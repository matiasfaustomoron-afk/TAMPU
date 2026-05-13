/**
 * Route optimizer — greedy nearest-neighbor TSP (Travel Salesman heuristic).
 *
 * Toma una lista de puntos { lat, lng } y devuelve el orden óptimo aproximado
 * empezando por el primero. Es greedy O(n²) — perfecto para 10-30 stops por
 * día (excursiones turísticas, no rutas de delivery con cientos de puntos).
 *
 * Para 100+ puntos usar 2-opt o or-tools. Para 30 stops el greedy da
 * resultados dentro del 5-15% del óptimo y corre en < 1ms.
 *
 * Inspirado en Wanderlog's "optimize route" (ellos no documentan el algoritmo
 * pero los resultados son consistentes con greedy + 2-opt swap).
 */

export interface RoutePoint {
  id: string;
  lat: number;
  lng: number;
  /** Si está fijo (ej. hotel del día), no se mueve del primer slot */
  pinned?: boolean;
}

/** Haversine distance en km entre dos puntos lat/lng. */
export function haversine(a: RoutePoint, b: RoutePoint): number {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Reordena la lista usando nearest-neighbor empezando por el primer pinned.
 * Si no hay pinned, empieza por el primero del array (centroid would also work
 * but breaks user intent — usually the user wants to start where they wake up).
 *
 * Devuelve los puntos en orden óptimo + la distancia total estimada.
 */
export function optimizeRoute(points: RoutePoint[]): { ordered: RoutePoint[]; totalKm: number } {
  if (points.length <= 2) {
    return {
      ordered: points,
      totalKm: points.length === 2 ? haversine(points[0], points[1]) : 0,
    };
  }

  // Start: first pinned, else first item
  const pinnedIdx = points.findIndex((p) => p.pinned);
  const startIdx = pinnedIdx >= 0 ? pinnedIdx : 0;

  const unvisited = points.slice();
  const start = unvisited.splice(startIdx, 1)[0];
  const ordered: RoutePoint[] = [start];
  let totalKm = 0;
  let cur = start;

  while (unvisited.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const d = haversine(cur, unvisited[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    cur = unvisited.splice(bestIdx, 1)[0];
    ordered.push(cur);
    totalKm += bestDist;
  }

  return { ordered, totalKm };
}

/**
 * 2-opt swap improvement — toma el output de optimizeRoute y prueba swaps
 * de aristas que mejoren la distancia total. Para 20 stops baja la distancia
 * típicamente 5-15% adicional. Costo O(n²) iteraciones × O(n) per swap.
 */
export function twoOpt(route: RoutePoint[]): { ordered: RoutePoint[]; totalKm: number } {
  if (route.length < 4) {
    return { ordered: route, totalKm: route.reduce((s, _, i, arr) => (i === 0 ? 0 : s + haversine(arr[i - 1], arr[i])), 0) };
  }

  const path = route.slice();
  let improved = true;
  let iterations = 0;
  const maxIterations = 100;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    for (let i = 1; i < path.length - 2; i++) {
      for (let j = i + 1; j < path.length - 1; j++) {
        const a = path[i - 1];
        const b = path[i];
        const c = path[j];
        const d = path[j + 1];
        const before = haversine(a, b) + haversine(c, d);
        const after = haversine(a, c) + haversine(b, d);
        if (after < before - 0.001) {
          // Reverse the segment [i..j]
          path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }

  let totalKm = 0;
  for (let i = 1; i < path.length; i++) totalKm += haversine(path[i - 1], path[i]);
  return { ordered: path, totalKm };
}

/** Full pipeline: greedy + 2-opt. */
export function optimizeRouteFull(points: RoutePoint[]): { ordered: RoutePoint[]; totalKm: number } {
  const greedy = optimizeRoute(points);
  if (greedy.ordered.length < 4) return greedy;
  return twoOpt(greedy.ordered);
}
