import { NextRequest, NextResponse } from "next/server";
import { resolveDestinationPhoto, slugify } from "@/lib/photos/destination-resolver";

/**
 * MCP server endpoint — Model Context Protocol (Anthropic-driven spec adopted
 * by OpenAI / ChatGPT, Cursor, etc).
 *
 * Permite que Tampu sea invocable desde Claude Desktop / ChatGPT Apps / Cursor:
 * cuando un user pregunta en cualquiera de esos clients "qué hago 3 días en
 * Mendoza", Tampu puede ser el provider de la respuesta sin que el user
 * abra Tampu.app.
 *
 * MVP scope: dos tools de read-only —
 *   - search_destination(query): trae info Wikipedia + foto
 *   - get_destination_pois(destination, category): lista de spots curados
 *
 * Roadmap: tools de write (create_trip, add_reservation) cuando OAuth flow
 * y auth via MCP esté maduro (todavía es estándar emergente Q2 2026).
 *
 * Endpoint: POST /api/mcp con JSON-RPC 2.0 envelope.
 *
 * Discovery: cualquier cliente MCP puede llamar `initialize` + `tools/list`
 * + `tools/call` siguiendo el protocolo.
 *
 * Spec: https://spec.modelcontextprotocol.io
 */

export const runtime = "nodejs";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const SERVER_INFO = {
  name: "tampu-travel",
  version: "0.1.0",
  description:
    "Tampu — travel companion app para Cono Sur (Argentina/Chile/Uruguay). Expose tools para search de destinos, info curada, POIs, y eventualmente trip creation.",
};

const TOOLS = [
  {
    name: "search_destination",
    description:
      "Busca info actualizada sobre un destino o POI (ciudad, atracción, neighborhood). Devuelve título, descripción y URL de foto icónica desde Wikipedia. Útil para iniciar un viaje a un lugar nuevo o investigar opciones.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Nombre del destino. Ej: 'Cusco', 'Salar de Uyuni', 'Mendoza Argentina'",
        },
        locale: {
          type: "string",
          enum: ["es", "en"],
          description: "Idioma preferido para la fuente Wikipedia. Default es.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_tampu_curated_destinations",
    description:
      "Devuelve la lista de destinos curados editorialmente por Tampu para Cono Sur. Cada destino tiene categoría, spots principales, mejor temporada y nivel de premium suggested. NOTA: en MVP devuelve un set seed; en producción será 50+ destinos.",
    inputSchema: {
      type: "object",
      properties: {
        country: {
          type: "string",
          enum: ["AR", "CL", "UY", "all"],
          description: "Filtro por país. 'all' devuelve todos.",
        },
        category: {
          type: "string",
          enum: ["adventure", "wine", "nature", "city", "beach", "all"],
          description: "Categoría editorial. 'all' devuelve todas.",
        },
      },
    },
  },
];

// ─── Curated destinations seed (P2.12 infraestructura — 5 seed iniciales) ──
const CURATED_DESTINATIONS = [
  {
    slug: "buenos-aires",
    name: "Buenos Aires",
    country: "AR",
    category: "city",
    blurb:
      "Capital argentina. Barrios distintos como universos: Palermo (gastronomía), San Telmo (historia), Recoleta (museos), Chacarita (vino natural emergente).",
    best_season: ["Mar–Jun", "Sep–Nov"],
    premium_level: "alto",
    spots: ["Plaza San Martín", "Recoleta", "Don Julio", "MALBA", "Mercado de San Telmo"],
  },
  {
    slug: "mendoza",
    name: "Mendoza",
    country: "AR",
    category: "wine",
    blurb:
      "Cuna del malbec. Tres valles principales: Luján de Cuyo (clásico), Maipú (cerca + tradicional), Valle de Uco (premium altura).",
    best_season: ["Mar–May", "Oct–Nov"],
    premium_level: "alto",
    spots: ["Bodega Catena Zapata", "Cavas Wine Lodge", "Bodega Vistalba", "The Vines Resort", "Río Mendoza rafting"],
  },
  {
    slug: "bariloche",
    name: "Bariloche",
    country: "AR",
    category: "nature",
    blurb:
      "Patagonia Norte. Lagos andinos, bosques de coihue, chocolate suizo legacy. Verano = trekking; invierno = ski Cerro Catedral.",
    best_season: ["Dec–Mar (verano)", "Jul–Sep (ski)"],
    premium_level: "medio-alto",
    spots: ["Cerro Catedral", "Circuito Chico", "Llao Llao Hotel", "Colonia Suiza domingo", "Cerro Tronador"],
  },
  {
    slug: "san-pedro-de-atacama",
    name: "San Pedro de Atacama",
    country: "CL",
    category: "nature",
    blurb:
      "Desierto más seco del mundo. Geysers, salares, lagunas altiplánicas, observatorio astronómico. Tierra de Awasi / Tierra Hoteles.",
    best_season: ["Apr–Jun", "Sep–Nov"],
    premium_level: "premium",
    spots: ["Geysers del Tatio", "Valle de la Luna", "Laguna Cejar", "Salar de Tara", "Tierra Atacama Lodge"],
  },
  {
    slug: "montevideo",
    name: "Montevideo",
    country: "UY",
    category: "city",
    blurb:
      "Capital uruguaya: mate, parrilla, rambla 22km, candombe. Más quieta que BA, igual de literaria. Carmelo + Colonia + José Ignacio = circuito premium.",
    best_season: ["Nov–Apr"],
    premium_level: "alto",
    spots: ["Mercado del Puerto", "Rambla", "Ciudad Vieja", "Pocitos", "Teatro Solís"],
  },
];

// ─── MCP method handlers ──────────────────────────────────────────────────

async function handleInitialize() {
  return {
    protocolVersion: "2025-06-18",
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: SERVER_INFO,
  };
}

async function handleToolsList() {
  return { tools: TOOLS };
}

interface ToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

async function handleToolCall(params: ToolCallParams) {
  if (params.name === "search_destination") {
    const args = params.arguments as { query?: string; locale?: "es" | "en" } | undefined;
    if (!args?.query) {
      return { isError: true, content: [{ type: "text", text: "query es requerido" }] };
    }
    const photo = await resolveDestinationPhoto(args.query, { locale: args.locale ?? "es" });
    if (!photo) {
      return {
        content: [
          {
            type: "text",
            text: `No encontré info canónica para "${args.query}". Probá un destino más conocido o con nombre exacto.`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: photo.caption,
            description: photo.description,
            photo_url: photo.url,
            attribution: photo.attribution,
            source: photo.sourcePageUrl,
            tier: photo.tier,
          }),
        },
      ],
    };
  }

  if (params.name === "get_tampu_curated_destinations") {
    const args = params.arguments as { country?: string; category?: string } | undefined;
    let results = CURATED_DESTINATIONS;
    if (args?.country && args.country !== "all") {
      results = results.filter((d) => d.country === args.country);
    }
    if (args?.category && args.category !== "all") {
      results = results.filter((d) => d.category === args.category);
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(results),
        },
      ],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Tool desconocida: ${params.name}` }],
  };
}

// ─── HTTP handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32600, message: "Invalid Request" } },
      { status: 400 },
    );
  }

  try {
    let result: unknown;
    if (body.method === "initialize") {
      result = await handleInitialize();
    } else if (body.method === "tools/list") {
      result = await handleToolsList();
    } else if (body.method === "tools/call") {
      result = await handleToolCall(body.params as unknown as ToolCallParams);
    } else {
      const errResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32601, message: `Method not found: ${body.method}` },
      };
      return NextResponse.json(errResponse, { status: 200 });
    }

    const response: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: body.id,
      result,
    };
    return NextResponse.json(response);
  } catch (err) {
    const errResponse: JsonRpcResponse = {
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32603, message: err instanceof Error ? err.message : "Internal error" },
    };
    return NextResponse.json(errResponse, { status: 500 });
  }
}

/**
 * GET /api/mcp — discovery info (algunos clients lo usan para "ping").
 */
export async function GET() {
  return NextResponse.json({
    server: SERVER_INFO,
    transport: "http+jsonrpc",
    endpoint: "/api/mcp",
    methods_supported: ["initialize", "tools/list", "tools/call"],
    tools_count: TOOLS.length,
    note: "Tampu MCP server. Connect from Claude Desktop, ChatGPT Apps, or Cursor.",
  });
}
