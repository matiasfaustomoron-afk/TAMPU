-- ──────────────────────────────────────────────────────────────────────────
-- Tampu — Curated destinations (P2.12 infraestructura)
--
-- 50 destinos editoriales seed para Cono Sur (Argentina + Chile + Uruguay).
-- Cada destino tiene blurb editorial, mejores temporadas, spots top, nivel
-- premium suggested. Esto es el MOAT defendible 24 meses: contenido curado
-- que Wanderlog/Mindtrip/Layla NO tienen.
--
-- El user (founder) carga las primeras 5-10 manualmente con Claude como
-- copilot. Después: iterar contra real travelers.
--
-- RLS: read público (cualquiera ve el catálogo). Write: solo service-role.
-- ──────────────────────────────────────────────────────────────────────────

create table if not exists curated_destinations (
  slug text primary key,
  name text not null,
  country text not null check (country in ('AR', 'CL', 'UY', 'BR', 'PE', 'BO', 'CO', 'MX', 'EC')),
  region text,                          -- "Patagonia", "NOA", "Cuyo", "Cordillera", etc.
  category text not null check (category in ('city', 'wine', 'nature', 'beach', 'mountain', 'desert', 'cultural', 'adventure')),
  premium_level text not null check (premium_level in ('económico', 'medio', 'alto', 'premium')),

  -- Editorial content
  blurb text not null,                  -- 1-2 oraciones, el carácter del destino
  long_description text,                -- 2-4 párrafos editorial-quality
  best_season text[],                   -- ej ['Mar–May', 'Sep–Nov']
  duration_suggested text,              -- ej "3-5 días"
  vibe_tags text[],                     -- ej ['quieto', 'adulto', 'gastronómico', 'paisajístico']

  -- POIs principales (5-10)
  spots jsonb,                          -- [{name, type, blurb, lat, lng}]

  -- Logística práctica
  arrival_options text[],               -- ej ['vuelo BUE-MZA 1h45', 'bus 14h']
  typical_cost_usd_per_day numeric(10, 2),

  -- Affiliate partnerships específicos del destino
  partner_hotels text[],                -- slugs de hoteles que tenemos en partnership
  partner_activities text[],            -- slugs de GetYourGuide/Viator que ya curamos

  -- Editorial metadata
  last_visited_at date,                 -- cuándo fue el último visit del editor (Tampu founder)
  author_notes text,                    -- notas personales del founder
  photo_credit text,
  hero_photo_url text,                  -- override del Wikipedia resolver

  -- Stats
  view_count integer default 0,
  added_to_trips_count integer default 0,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_curated_destinations_country on curated_destinations(country);
create index idx_curated_destinations_category on curated_destinations(category);
create index idx_curated_destinations_premium on curated_destinations(premium_level);

-- RLS: read público, write solo service-role
alter table curated_destinations enable row level security;

drop policy if exists curated_destinations_public_read on curated_destinations;
create policy curated_destinations_public_read on curated_destinations for select using (true);

-- ──────────────────────────────────────────────────────────────────────────
-- Seed inicial: 5 destinos del Cono Sur que el founder (Matías) puede
-- expandir manualmente o vía script.
-- ──────────────────────────────────────────────────────────────────────────

insert into curated_destinations (slug, name, country, region, category, premium_level, blurb, best_season, duration_suggested, vibe_tags, spots, arrival_options, typical_cost_usd_per_day)
values
  (
    'buenos-aires',
    'Buenos Aires',
    'AR',
    'Río de la Plata',
    'city',
    'alto',
    'Capital argentina. Barrios distintos como universos: Palermo gastronómico, San Telmo histórico, Recoleta museos, Chacarita vino natural emergente.',
    ARRAY['Mar–Jun', 'Sep–Nov'],
    '4-6 días',
    ARRAY['urbano', 'adulto', 'gastronómico', 'noctámbulo', 'cultural'],
    '[
      {"name":"Don Julio","type":"food","blurb":"Parrilla emblema de Palermo, reservar 60 días antes","lat":-34.586,"lng":-58.435},
      {"name":"MALBA","type":"sight","blurb":"Museo de arte latinoamericano siglo XX","lat":-34.577,"lng":-58.404},
      {"name":"Recoleta Cemetery","type":"sight","blurb":"Cementerio de la elite porteña, gratuito","lat":-34.587,"lng":-58.394},
      {"name":"Mercado de San Telmo","type":"food","blurb":"Domingos: feria + asado","lat":-34.621,"lng":-58.372},
      {"name":"Plaza Dorrego","type":"neighborhood","blurb":"Tango callejero, milonga al aire libre","lat":-34.620,"lng":-58.371}
    ]'::jsonb,
    ARRAY['vuelo MAD-EZE 13h directo', 'vuelo MIA-EZE 9h', 'vuelo GRU-EZE 3h'],
    180.00
  ),
  (
    'mendoza',
    'Mendoza',
    'AR',
    'Cuyo',
    'wine',
    'premium',
    'Cuna del malbec. Tres valles: Luján de Cuyo (clásico), Maipú (cerca + tradicional), Valle de Uco (premium altura 1200m+).',
    ARRAY['Mar–May (vendimia)', 'Oct–Nov (flor)'],
    '4-7 días',
    ARRAY['adulto', 'gastronómico', 'paisajístico', 'lujo silencioso'],
    '[
      {"name":"Catena Zapata","type":"sight","blurb":"Bodega pirámide de Adrianna Catena, tour + tasting","lat":-33.108,"lng":-68.890},
      {"name":"The Vines Resort","type":"neighborhood","blurb":"Villas en Valle de Uco + Siete Fuegos restaurant","lat":-33.731,"lng":-69.166},
      {"name":"Bodega Salentein","type":"sight","blurb":"Bodega-museo en Tupungato","lat":-33.452,"lng":-69.207},
      {"name":"Cerro Aconcagua","type":"sight","blurb":"Vista del techo de América, día completo","lat":-32.653,"lng":-70.011},
      {"name":"Cavas Wine Lodge","type":"neighborhood","blurb":"Cabañas con viña propia, spa, sunset terrace","lat":-33.020,"lng":-68.881}
    ]'::jsonb,
    ARRAY['vuelo EZE-MDZ 1h45', 'bus EZE-MDZ 14h'],
    230.00
  ),
  (
    'bariloche',
    'San Carlos de Bariloche',
    'AR',
    'Patagonia Norte',
    'mountain',
    'medio',
    'Lagos andinos, bosques de coihue, chocolate suizo legacy. Verano = trekking; invierno = ski Catedral.',
    ARRAY['Dec–Mar (verano)', 'Jul–Sep (ski)'],
    '5-7 días',
    ARRAY['paisajístico', 'familiar', 'adventura', 'romántico'],
    '[
      {"name":"Cerro Catedral","type":"sight","blurb":"Ski + verano cabalgatas + vista 360","lat":-41.171,"lng":-71.510},
      {"name":"Llao Llao Hotel","type":"neighborhood","blurb":"Hotel icónico años 30, golf, spa, lago","lat":-41.057,"lng":-71.554},
      {"name":"Circuito Chico","type":"sight","blurb":"Drive 25km lagos + miradores","lat":-41.108,"lng":-71.495},
      {"name":"Colonia Suiza","type":"food","blurb":"Domingos curanto comunitario","lat":-41.087,"lng":-71.530},
      {"name":"Cerro Tronador","type":"sight","blurb":"Glaciar negro, 90km de Bariloche","lat":-41.157,"lng":-71.880}
    ]'::jsonb,
    ARRAY['vuelo EZE-BRC 2h15', 'bus EZE-BRC 22h'],
    160.00
  ),
  (
    'san-pedro-de-atacama',
    'San Pedro de Atacama',
    'CL',
    'Norte Grande',
    'desert',
    'premium',
    'Desierto más seco del mundo. Geysers, salares, lagunas altiplánicas, observatorio astronómico clase mundial.',
    ARRAY['Apr–Jun', 'Sep–Nov'],
    '4-6 días',
    ARRAY['premium', 'paisajístico', 'astronómico', 'adulto'],
    '[
      {"name":"Geysers del Tatio","type":"sight","blurb":"Salida 5am, 4320m altitud, vapor + amanecer","lat":-22.330,"lng":-68.012},
      {"name":"Valle de la Luna","type":"sight","blurb":"Sunset entre dunas + sal","lat":-22.953,"lng":-68.255},
      {"name":"Laguna Cejar","type":"sight","blurb":"Flotación tipo Mar Muerto en cordillera","lat":-23.020,"lng":-68.156},
      {"name":"Tierra Atacama","type":"neighborhood","blurb":"Lodge premium, todo-incluido, excursiones guiadas","lat":-22.913,"lng":-68.197},
      {"name":"Observatorio Alma","type":"sight","blurb":"Tour gratis sábados, requiere reserva 60 días","lat":-23.024,"lng":-67.755}
    ]'::jsonb,
    ARRAY['vuelo SCL-CJC 2h + 100km auto', 'vuelo SCL-Calama via LATAM'],
    320.00
  ),
  (
    'montevideo',
    'Montevideo',
    'UY',
    'Costa Sur',
    'city',
    'alto',
    'Capital uruguaya: mate, parrilla, rambla 22km, candombe. Más quieta que BA, igual de literaria.',
    ARRAY['Nov–Apr'],
    '3-4 días',
    ARRAY['adulto', 'gastronómico', 'tranquilo', 'cultural'],
    '[
      {"name":"Mercado del Puerto","type":"food","blurb":"Parrillas tradicionales, sábados llenos","lat":-34.906,"lng":-56.214},
      {"name":"Rambla Sur","type":"sight","blurb":"22km costanera, atardecer mate","lat":-34.917,"lng":-56.157},
      {"name":"Ciudad Vieja","type":"neighborhood","blurb":"Bohemia + arquitectura art déco","lat":-34.906,"lng":-56.205},
      {"name":"Teatro Solís","type":"sight","blurb":"Teatro 1856, tours guiados","lat":-34.906,"lng":-56.198},
      {"name":"Punta Carretas Shopping","type":"shopping","blurb":"Ex-prisión, ahora mall premium","lat":-34.926,"lng":-56.158}
    ]'::jsonb,
    ARRAY['vuelo EZE-MVD 50min', 'buquebus EZE-COL 1h + bus 2h'],
    160.00
  )
on conflict (slug) do nothing;
