import { useState, useEffect } from "react";
import { fetchVenues, fetchEvents, fetchTrips, fetchReachableFromEvent, buildCustomTrip } from "./api";
import MapView from "./components/Map";
import TripCard from "./components/TripCard";
import RoadTripBuilder from "./components/RoadTripBuilder";
import { COLORS } from "./constants";

function LayerToggle({ label, color, checked, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: color, display: "inline-block",
          opacity: checked ? 1 : 0.3, flexShrink: 0,
        }} />
        <span style={{ fontSize: "12px", color: checked ? COLORS.text : COLORS.textDim }}>
          {label}
        </span>
      </div>
      <button
        onClick={onChange}
        style={{
          width: 32, height: 18, borderRadius: 9, flexShrink: 0,
          background: checked ? COLORS.accent : COLORS.panelBorder,
          border: "none", cursor: "pointer", position: "relative", padding: 0,
        }}
      >
        <span style={{
          position: "absolute", top: 2,
          left: checked ? 16 : 2,
          width: 14, height: 14, borderRadius: "50%", background: "#FFF",
        }} />
      </button>
    </div>
  );
}

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

function getTimeSlot(startDate) {
  const hour = new Date(startDate).getUTCHours();
  if (hour <= 17) return "noon";
  if (hour <= 22) return "afternoon";
  return "evening";
}

function eventsToGeoJSON(events, venueMap) {
  const features = [];
  events.forEach((ev) => {
    // API returns venue_id as string; venueMap keys are also strings (VenueOut.id: str)
    const venue = venueMap.get(ev.venue_id);
    if (!venue || venue.lat == null || venue.lng == null) return;
    features.push({
      type: "Feature",
      id: ev.id,
      geometry: { type: "Point", coordinates: [venue.lng, venue.lat] },
      properties: {
        id: ev.id,
        homeTeam: ev.home,
        awayTeam: ev.away,
        venueName: ev.venue_name ?? venue.name,
        city: venue.city,
        state: venue.state,
        startDate: ev.kickoff,
        time_slot: ev.time_slot ?? getTimeSlot(ev.kickoff),
      },
    });
  });
  return { type: "FeatureCollection", features };
}

export default function App() {
  const [venueGeoJSON, setVenueGeoJSON] = useState(EMPTY_FC);
  const [eventsGeoJSON, setEventsGeoJSON] = useState(EMPTY_FC);
  const [layerVisibility, setLayerVisibility] = useState({ venues: true, events: true });
  const [trips, setTrips] = useState([]);
  const [eventMap, setEventMap] = useState(new Map());
  const [venueMap, setVenueMap] = useState(new Map());
  const [loading, setLoading] = useState(true);

  // ── road trip builder state ─────────────────────────────────────────────────
  const [roadTripStops, setRoadTripStops] = useState([]);   // EventOut[]
  const [roadTripLegs, setRoadTripLegs] = useState([]);     // {drive_hours, buffer_hours}[] per leg
  const [reachable, setReachable] = useState(null);         // null = loading, [] = empty
  const [builtTrip, setBuiltTrip] = useState(null);
  const [building, setBuilding] = useState(false);

  const inRoadTripMode = roadTripStops.length > 0;

  function toggleLayer(key) {
    setLayerVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    Promise.all([
      fetchVenues(),
      fetchEvents({ season: 2025, week: 1 }),
      fetchTrips({ season: 2025, week: 1, limit: 5 }),
    ])
      .then(([venues, events, tripList]) => {
        const vMap = new Map(venues.map((v) => [v.id, v]));
        setVenueGeoJSON(venuesToGeoJSON(venues));
        setEventsGeoJSON(eventsToGeoJSON(events, vMap));
        setEventMap(new Map(events.map((e) => [e.id, e])));
        setVenueMap(vMap);
        setTrips(tripList.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, []);

  // ── road trip handlers ──────────────────────────────────────────────────────

  function loadReachable(eventId) {
    setReachable(null);
    fetchReachableFromEvent(eventId)
      .then(setReachable)
      .catch(() => setReachable([]));
  }

  function handleStartRoadTrip(eventId) {
    const event = eventMap.get(String(eventId));
    if (!event) return;
    setRoadTripStops([event]);
    setRoadTripLegs([]);
    setBuiltTrip(null);
    loadReachable(eventId);
  }

  function handleAddStop(reachableItem) {
    setRoadTripStops((prev) => [...prev, reachableItem.event]);
    setRoadTripLegs((prev) => [...prev, {
      drive_hours: reachableItem.drive_hours,
      buffer_hours: reachableItem.buffer_hours,
    }]);
    setBuiltTrip(null);
    loadReachable(reachableItem.event.id);
  }

  function handleClear() {
    setRoadTripStops([]);
    setRoadTripLegs([]);
    setReachable(null);
    setBuiltTrip(null);
  }

  function handleBuild() {
    const ids = roadTripStops.map((e) => e.id);
    setBuilding(true);
    buildCustomTrip(ids)
      .then((results) => setBuiltTrip(Array.isArray(results) ? (results[0] ?? null) : results))
      .catch(() => {})
      .finally(() => setBuilding(false));
  }

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

          {/* Layer toggles */}
          <div style={{ marginBottom: "6px" }}>
            <span style={{ fontSize: "10px", color: COLORS.textDim, fontWeight: 600, letterSpacing: "1px" }}>
              LAYERS
            </span>
          </div>
          <LayerToggle
            label="Venues"
            color={COLORS.accent}
            checked={layerVisibility.venues}
            onChange={() => toggleLayer("venues")}
          />
          <LayerToggle
            label="Events"
            color="#A78BFA"
            checked={layerVisibility.events}
            onChange={() => toggleLayer("events")}
          />

          <div style={{ height: "1px", background: COLORS.panelBorder, margin: "12px 0 14px" }} />
          {!inRoadTripMode && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ fontSize: "10px", color: COLORS.textDim, fontWeight: 600, letterSpacing: "1px" }}>
                SAMPLE ROAD TRIPS
              </span>
              <span style={{ fontSize: "11px", color: COLORS.textMuted }}>Week 1 · 2025</span>
            </div>
          )}
        </div>

        {/* ── Sidebar body: trips list OR road trip builder ── */}
        {inRoadTripMode ? (
          <RoadTripBuilder
            stops={roadTripStops}
            legs={roadTripLegs}
            reachable={reachable}
            onAddStop={handleAddStop}
            onClear={handleClear}
            onBuild={handleBuild}
            builtTrip={builtTrip}
            building={building}
          />
        ) : (
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
        )}
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1, height: "100%" }}>
        <MapView
          venueGeoJSON={venueGeoJSON}
          eventsGeoJSON={eventsGeoJSON}
          layerVisibility={layerVisibility}
          onStartRoadTrip={handleStartRoadTrip}
        />
      </div>
    </div>
  );
}
