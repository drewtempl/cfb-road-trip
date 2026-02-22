const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function get(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function post(path, params = {}, body) {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

/** Fetch all events for a given season + week. */
export function fetchEvents({ season = 2025, week = 1, limit = 500 } = {}) {
  return get("/api/v1/events", { season, week, limit });
}

/** Fetch all venues (up to 500). */
export function fetchVenues({ limit = 500 } = {}) {
  return get("/api/v1/venues", { limit });
}

/** Fetch ranked trips for a given season + week. */
export function fetchTrips({ season = 2025, week = 1, limit = 50, auto_compute = false } = {}) {
  return get("/api/v1/trips", { season, week, limit, auto_compute });
}

/** Trigger synchronous trip computation for a week. */
export function computeTrips({ season = 2025, week = 1, top_n = 100 } = {}) {
  return post("/api/v1/trips/compute", { season, week, top_n });
}
