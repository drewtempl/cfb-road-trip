import { useState, useEffect } from "react";
import { fetchVenues, fetchEvents, fetchTrips } from "./api";
import MapView from "./components/Map";
import TripCard from "./components/TripCard";
import { COLORS } from "./constants";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

function venuesToGeoJSON(venues) {
  return {
    type: "FeatureCollection",
    features: venues
      .filter((v) => v.lat != null && v.lng != null)
      .map((v) => ({
        type: "Feature",
        id: v.id,
        geometry: { type: "Point", coordinates: [v.lng, v.lat] },
        properties: {
          id: v.id,
          name: v.name,
          city: v.city,
          state: v.state,
          capacity: v.capacity,
        },
      })),
  };
}

export default function App() {
  const [venueGeoJSON, setVenueGeoJSON] = useState(EMPTY_FC);
  const [trips, setTrips] = useState([]);
  const [eventMap, setEventMap] = useState(new Map());
  const [venueMap, setVenueMap] = useState(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchVenues(),
      fetchEvents({ season: 2025, week: 1 }),
      fetchTrips({ season: 2025, week: 1, limit: 5 }),
    ])
      .then(([venues, events, tripList]) => {
        setVenueGeoJSON(venuesToGeoJSON(venues));
        setEventMap(new Map(events.map((e) => [e.id, e])));
        setVenueMap(new Map(venues.map((v) => [v.id, v])));
        setTrips(tripList.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", width: "100%", height: "100vh" }}>
      {/* ── Sidebar ── */}
      <div style={{
        width: "380px", minWidth: "380px", height: "100%",
        background: COLORS.panel, borderRight: `1px solid ${COLORS.panelBorder}`,
        display: "flex", flexDirection: "column", overflow: "hidden", zIndex: 10,
      }}>
        {/* Header */}
        <div style={{ padding: "20px 20px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "2px" }}>
            <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: "26px", color: COLORS.text, letterSpacing: "-0.5px" }}>
              GameTrip
            </span>
            <span style={{ fontSize: "11px", color: COLORS.accent, fontWeight: 700, letterSpacing: "0.5px" }}>
              BETA
            </span>
          </div>
          <div style={{ fontSize: "12px", color: COLORS.textDim, marginBottom: "20px" }}>
            College Football Road Trip Planner
          </div>
          <div style={{ height: "1px", background: COLORS.panelBorder, marginBottom: "14px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontSize: "10px", color: COLORS.textDim, fontWeight: 600, letterSpacing: "1px" }}>
              SAMPLE ROAD TRIPS
            </span>
            <span style={{ fontSize: "11px", color: COLORS.textMuted }}>Week 1 · 2025</span>
          </div>
        </div>

        {/* Trip list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: COLORS.textDim, fontSize: "12px" }}>
              Loading…
            </div>
          ) : trips.length === 0 ? (
            <div style={{ fontSize: "13px", color: COLORS.textMuted, textAlign: "center", padding: "20px" }}>
              No trips found. Run compute first.
            </div>
          ) : (
            trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                eventMap={eventMap}
                venueMap={venueMap}
                isSelected={false}
                onSelect={() => {}}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1, height: "100%" }}>
        <MapView venueGeoJSON={venueGeoJSON} />
      </div>
    </div>
  );
}
