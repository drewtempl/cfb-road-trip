import { useState, useEffect, useMemo } from "react";
import {
  fetchVenues, fetchEvents, fetchTrips, computeTrips,
  fetchReachableFromEvent, buildCustomTrip,
} from "../api";
import MapView from "../components/Map";
import TripCard from "../components/TripCard";
import Nav from "../components/Nav";
import { venuesToGeoJSON, eventsToGeoJSON, getTimeSlot } from "../utils";
import { COLORS, TIME_SLOT_COLORS, ALL_TIME_SLOTS, WEEKS } from "../constants";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

// ── Schedule tab ────────────────────────────────────────────────────────────

function ScheduleTab({ events, venueMap, loading, error, onStartRoadTrip }) {
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.textDim, fontSize: "12px" }}>
        <Spinner /> Loading games…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{
        padding: "12px 14px", borderRadius: "8px",
        background: "#F8717122", border: "1px solid #F8717144",
        color: "#F87171", fontSize: "12px",
      }}>
        Could not reach API — is the server running?
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.textDim, fontSize: "12px" }}>
        No games match the current filters.
      </div>
    );
  }

  // Group by day
  const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const grouped = events.reduce((acc, ev) => {
    const day = ev.day ?? "Other";
    if (!acc[day]) acc[day] = [];
    acc[day].push(ev);
    return acc;
  }, {});
  const days = Object.keys(grouped).sort(
    (a, b) => (DAY_ORDER.indexOf(a) + 1 || 99) - (DAY_ORDER.indexOf(b) + 1 || 99)
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {days.map((day) => (
        <div key={day}>
          <div style={{
            fontSize: "9px", color: COLORS.textDim, fontWeight: 700,
            letterSpacing: "1.2px", marginBottom: "6px",
          }}>
            {day.toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {grouped[day].map((ev) => {
              const venue = venueMap.get(ev.venue_id);
              const slot = ev.time_slot ?? getTimeSlot(ev.kickoff);
              const slotColor = TIME_SLOT_COLORS[slot]?.dot ?? "#94A3B8";
              return (
                <div
                  key={ev.id}
                  style={{
                    padding: "9px 12px",
                    background: COLORS.surface,
                    borderRadius: "8px",
                    border: `1px solid ${COLORS.panelBorder}`,
                    display: "flex", alignItems: "center", gap: "10px",
                  }}
                >
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: slotColor, flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "12px", fontWeight: 600, color: COLORS.text,
                      lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {ev.away} <span style={{ color: COLORS.textDim, fontWeight: 400 }}>@</span> {ev.home}
                    </div>
                    <div style={{ fontSize: "10px", color: COLORS.textDim, marginTop: "2px" }}>
                      {venue ? `${venue.city}, ${venue.state}` : (ev.venue_name ?? "")}
                    </div>
                  </div>
                  <button
                    onClick={() => onStartRoadTrip(ev.id)}
                    style={{
                      padding: "4px 8px", borderRadius: "5px", border: "none",
                      background: COLORS.accent + "22", color: COLORS.accent,
                      fontSize: "10px", fontWeight: 700, cursor: "pointer",
                      flexShrink: 0, letterSpacing: "0.2px",
                    }}
                  >
                    Trip →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Trips tab ───────────────────────────────────────────────────────────────

function TripsTab({
  trips, eventMap, venueMap, loading, error,
  week, computing, onComputeTrips, selectedTrip, onTripSelect,
}) {
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.textDim, fontSize: "12px" }}>
        <Spinner /> Loading trips…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{
        padding: "12px 14px", borderRadius: "8px",
        background: "#F8717122", border: "1px solid #F8717144",
        color: "#F87171", fontSize: "12px",
      }}>
        Could not reach API
      </div>
    );
  }
  if (trips.length === 0) {
    return (
      <div style={{
        padding: "20px 16px", borderRadius: "10px",
        background: COLORS.surface, border: `1px solid ${COLORS.panelBorder}`,
        textAlign: "center",
      }}>
        <div style={{ fontSize: "13px", color: COLORS.textMuted, marginBottom: "14px" }}>
          No trips computed for Week {week} yet.
        </div>
        <button
          onClick={onComputeTrips}
          disabled={computing}
          style={{
            padding: "8px 20px", borderRadius: "8px", border: "none",
            background: computing ? COLORS.surface : COLORS.accent,
            color: computing ? COLORS.textDim : "#000",
            fontSize: "12px", fontWeight: 700,
            cursor: computing ? "default" : "pointer",
            opacity: computing ? 0.7 : 1,
          }}
        >
          {computing ? "Computing…" : `Generate trips for Week ${week}`}
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {trips.map((trip) => (
        <TripCard
          key={trip.id}
          trip={trip}
          eventMap={eventMap}
          venueMap={venueMap}
          isSelected={selectedTrip?.id === trip.id}
          onSelect={onTripSelect}
          onHoverEnter={() => {}}
          onHoverLeave={() => {}}
        />
      ))}
    </div>
  );
}

// ── Spinner ─────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <>
      <div style={{
        width: "20px", height: "20px",
        border: `2px solid ${COLORS.panelBorder}`,
        borderTopColor: COLORS.accent, borderRadius: "50%",
        animation: "spin 0.8s linear infinite", margin: "0 auto 8px",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Left panel filters ───────────────────────────────────────────────────────

function FilterBar({ week, onWeekChange, availableDays, selectedDays, onDayToggle, selectedTimeSlots, onSlotToggle }) {
  return (
    <div style={{ padding: "12px 16px 0", flexShrink: 0 }}>
      {/* Week selector */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        background: COLORS.surface, borderRadius: "8px",
        padding: "7px 10px", marginBottom: "12px",
      }}>
        <span style={{
          fontSize: "9px", color: COLORS.textMuted, fontWeight: 700,
          letterSpacing: "1px", flexShrink: 0,
        }}>
          WEEK
        </span>
        <div style={{ display: "flex", gap: "2px", flex: 1, overflowX: "auto" }}>
          {WEEKS.map((w) => (
            <button
              key={w}
              onClick={() => onWeekChange(w)}
              style={{
                flex: 1, minWidth: "20px", textAlign: "center", padding: "4px 2px",
                fontSize: "11px", fontWeight: w === week ? 700 : 500,
                color: w === week ? COLORS.accent : COLORS.textDim,
                background: w === week ? COLORS.accent + "18" : "transparent",
                border: "none", borderRadius: "5px", cursor: "pointer",
              }}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Tab row is above, day filter below */}
      <div style={{ marginBottom: "10px" }}>
        <div style={{
          fontSize: "9px", color: COLORS.textDim, fontWeight: 700,
          letterSpacing: "1.2px", marginBottom: "6px",
        }}>
          DAY
        </div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {availableDays.map((day) => {
            const active = selectedDays.has(day);
            return (
              <button
                key={day}
                onClick={() => onDayToggle(day)}
                style={{
                  padding: "4px 10px", fontSize: "11px", fontWeight: 600,
                  background: active ? COLORS.surface : "transparent",
                  color: active ? COLORS.text : COLORS.textDim,
                  border: `1px solid ${active ? COLORS.panelBorder : "transparent"}`,
                  borderRadius: "5px", cursor: "pointer",
                }}
              >
                {day}
              </button>
            );
          })}
          {availableDays.length === 0 && (
            <span style={{ fontSize: "11px", color: COLORS.textDim }}>—</span>
          )}
        </div>
      </div>

      {/* Time slot filter */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{
          fontSize: "9px", color: COLORS.textDim, fontWeight: 700,
          letterSpacing: "1.2px", marginBottom: "6px",
        }}>
          TIME SLOT
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {ALL_TIME_SLOTS.map((key) => {
            const slot = TIME_SLOT_COLORS[key];
            const active = selectedTimeSlots.has(key);
            return (
              <button
                key={key}
                onClick={() => onSlotToggle(key)}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "4px 10px", fontSize: "11px", fontWeight: 600,
                  background: active ? slot.bg : "transparent",
                  color: active ? slot.dot : COLORS.textDim,
                  border: `1px solid ${active ? slot.border + "44" : "transparent"}`,
                  borderRadius: "5px", cursor: "pointer",
                }}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: active ? slot.dot : COLORS.textDim,
                  opacity: active ? 1 : 0.4,
                }} />
                {slot.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ height: "1px", background: COLORS.panelBorder }} />
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RoadTripPage({ onNavigate }) {
  // ── data ────────────────────────────────────────────────────────────────────
  const [events, setEvents] = useState([]);
  const [trips, setTrips] = useState([]);
  const [venueMap, setVenueMap] = useState(new Map());
  const [eventMap, setEventMap] = useState(new Map());
  const [venueGeoJSON, setVenueGeoJSON] = useState(EMPTY_FC);
  const [eventsGeoJSON, setEventsGeoJSON] = useState(EMPTY_FC);

  // ── filters ─────────────────────────────────────────────────────────────────
  const [week, setWeek] = useState(1);
  const [selectedDays, setSelectedDays] = useState(new Set());
  const [selectedTimeSlots, setSelectedTimeSlots] = useState(new Set());
  const [tab, setTab] = useState("schedule");
  const [selectedTrip, setSelectedTrip] = useState(null);

  // ── loading ─────────────────────────────────────────────────────────────────
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState(null);

  // ── road trip builder ────────────────────────────────────────────────────────
  const [roadTripStops, setRoadTripStops] = useState([]);
  const [roadTripLegs, setRoadTripLegs] = useState([]);
  const [reachable, setReachable] = useState(null);
  const [builtTrip, setBuiltTrip] = useState(null);
  const [building, setBuilding] = useState(false);

  const inRoadTripMode = roadTripStops.length > 0;

  // ── load venues once ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetchVenues().then((venues) => {
      const vMap = new Map(venues.map((v) => [v.id, v]));
      setVenueMap(vMap);
      setVenueGeoJSON(venuesToGeoJSON(venues));
    });
  }, []);

  // ── reload events + trips on week change ─────────────────────────────────────
  useEffect(() => {
    setLoadingEvents(true);
    setError(null);
    setSelectedDays(new Set());
    fetchEvents({ season: 2025, week })
      .then((data) => {
        setEvents(data);
        setEventMap(new Map(data.map((e) => [e.id, e])));
      })
      .catch(() => setError("api"))
      .finally(() => setLoadingEvents(false));
  }, [week]);

  useEffect(() => {
    setLoadingTrips(true);
    fetchTrips({ season: 2025, week, limit: 20 })
      .then(setTrips)
      .catch(() => setTrips([]))
      .finally(() => setLoadingTrips(false));
  }, [week]);

  // ── rebuild events GeoJSON when data changes ──────────────────────────────────
  useEffect(() => {
    if (venueMap.size > 0 && events.length > 0) {
      setEventsGeoJSON(eventsToGeoJSON(events, venueMap));
    }
  }, [events, venueMap]);

  // ── derived ──────────────────────────────────────────────────────────────────
  const availableDays = useMemo(() => {
    const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const days = [...new Set(events.map((e) => e.day).filter(Boolean))];
    return days.sort((a, b) => (DAY_ORDER.indexOf(a) + 1 || 99) - (DAY_ORDER.indexOf(b) + 1 || 99));
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const dayOk = selectedDays.size === 0 || selectedDays.has(ev.day);
      const slot = ev.time_slot ?? getTimeSlot(ev.kickoff);
      const slotOk = selectedTimeSlots.size === 0 || selectedTimeSlots.has(slot);
      return dayOk && slotOk;
    });
  }, [events, selectedDays, selectedTimeSlots]);

  // ── handlers ─────────────────────────────────────────────────────────────────
  function toggleDay(day) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  }

  function toggleSlot(slot) {
    setSelectedTimeSlots((prev) => {
      const next = new Set(prev);
      next.has(slot) ? next.delete(slot) : next.add(slot);
      return next;
    });
  }

  function handleComputeTrips() {
    setComputing(true);
    computeTrips({ season: 2025, week })
      .then((result) => setTrips(Array.isArray(result) ? result.slice(0, 20) : []))
      .catch(() => {})
      .finally(() => setComputing(false));
  }

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
    setBuilding(true);
    buildCustomTrip(roadTripStops.map((e) => e.id))
      .then((results) => setBuiltTrip(Array.isArray(results) ? (results[0] ?? null) : results))
      .catch(() => {})
      .finally(() => setBuilding(false));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100vh" }}>
      <Nav page="planner" onNavigate={onNavigate} />

      {/* ── Three-column layout ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Left panel ── */}
        <div style={{
          width: "360px", minWidth: "360px", height: "100%",
          background: COLORS.panel, borderRight: `1px solid ${COLORS.panelBorder}`,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Filters */}
          <FilterBar
            week={week}
            onWeekChange={setWeek}
            availableDays={availableDays}
            selectedDays={selectedDays}
            onDayToggle={toggleDay}
            selectedTimeSlots={selectedTimeSlots}
            onSlotToggle={toggleSlot}
          />

          {/* Tabs */}
          <div style={{ display: "flex", gap: "4px", padding: "10px 16px 0", flexShrink: 0 }}>
            {[["schedule", "Schedule"], ["trips", "Road Trips"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: "7px", border: "none", cursor: "pointer",
                  fontSize: "12px", fontWeight: tab === key ? 700 : 500,
                  background: tab === key ? COLORS.accent + "22" : "transparent",
                  color: tab === key ? COLORS.accent : COLORS.textDim,
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 16px 16px" }}>
            {tab === "schedule" ? (
              <ScheduleTab
                events={filteredEvents}
                venueMap={venueMap}
                loading={loadingEvents}
                error={error}
                onStartRoadTrip={handleStartRoadTrip}
              />
            ) : (
              <TripsTab
                trips={trips}
                eventMap={eventMap}
                venueMap={venueMap}
                loading={loadingTrips}
                error={error}
                week={week}
                computing={computing}
                onComputeTrips={handleComputeTrips}
                selectedTrip={selectedTrip}
                onTripSelect={(trip) => setSelectedTrip(selectedTrip?.id === trip?.id ? null : trip)}
              />
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 16px", borderTop: `1px solid ${COLORS.panelBorder}`,
            display: "flex", justifyContent: "space-between", flexShrink: 0,
          }}>
            <span style={{ fontSize: "11px", color: COLORS.textDim }}>
              {loadingEvents ? "Loading…" : `${filteredEvents.length} games`}
            </span>
            <span style={{ fontSize: "11px", color: COLORS.textDim }}>
              Week {week} · 2025
            </span>
          </div>
        </div>

        {/* ── Map ── */}
        <div style={{ flex: 1, height: "100%", position: "relative" }}>
          <MapView
            venueGeoJSON={venueGeoJSON}
            eventsGeoJSON={eventsGeoJSON}
            layerVisibility={{ venues: true, events: true }}
            onStartRoadTrip={handleStartRoadTrip}
          />

          {/* Road trip mode hint */}
          {inRoadTripMode && (
            <div style={{
              position: "absolute", top: "16px", left: "50%",
              transform: "translateX(-50%)", zIndex: 10,
              background: "rgba(11,14,20,0.9)", backdropFilter: "blur(10px)",
              border: `1px solid ${COLORS.accent}44`, borderRadius: "20px",
              padding: "7px 18px",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: COLORS.accent, display: "inline-block",
              }} />
              <span style={{ fontSize: "12px", color: COLORS.textDim }}>
                {roadTripStops.length} stop{roadTripStops.length !== 1 ? "s" : ""} · Click a game on the map to add
              </span>
            </div>
          )}
        </div>

        {/* ── Right panel: Road Trip Builder ── */}
        {inRoadTripMode && (
          <div style={{
            width: "340px", minWidth: "340px", height: "100%",
            background: COLORS.panel, borderLeft: `1px solid ${COLORS.panelBorder}`,
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${COLORS.panelBorder}`, flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{
                    fontSize: "9px", color: COLORS.textDim, fontWeight: 700,
                    letterSpacing: "1.2px", marginBottom: "2px",
                  }}>
                    ROAD TRIP BUILDER
                  </div>
                  <div style={{ fontSize: "11px", color: COLORS.textMuted }}>
                    {roadTripStops.length} stop{roadTripStops.length !== 1 ? "s" : ""} selected
                  </div>
                </div>
                <button
                  onClick={handleClear}
                  style={{
                    padding: "5px 10px", borderRadius: "6px",
                    border: `1px solid ${COLORS.panelBorder}`,
                    background: "transparent", color: COLORS.textDim,
                    fontSize: "11px", cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Builder (hide its own clear button since we have one above) */}
            <RoadTripBuilderInner
              stops={roadTripStops}
              legs={roadTripLegs}
              reachable={reachable}
              onAddStop={handleAddStop}
              onBuild={handleBuild}
              builtTrip={builtTrip}
              building={building}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline builder (RoadTripBuilder minus the header/clear handled by parent) ──

function fmtKickoff(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
function driveColor(h) { return h <= 4 ? "#34D399" : h <= 8 ? "#F59E0B" : "#F87171"; }
function bufferColor(h) { return h >= 3 ? "#34D399" : h >= 1.5 ? "#F59E0B" : "#F87171"; }
function fmtHours(h) {
  if (h < 1) return `${Math.round(h * 60)}m`;
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function StopRow({ n, event }) {
  const slot = event.time_slot ?? "noon";
  const slotColor = TIME_SLOT_COLORS[slot]?.dot ?? "#94A3B8";
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "10px",
      padding: "10px 12px", background: "rgba(255,255,255,0.04)",
      borderRadius: "8px", border: `1px solid ${COLORS.panelBorder}`,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        background: COLORS.accent, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "#000",
      }}>
        {n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: COLORS.text, lineHeight: 1.3 }}>
          {event.away} <span style={{ color: COLORS.textDim, fontWeight: 400 }}>@</span> {event.home}
        </div>
        <div style={{ fontSize: "11px", color: COLORS.textDim, marginTop: "2px" }}>{event.venue_name}</div>
        <div style={{ marginTop: "5px", display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: slotColor, display: "inline-block" }} />
          <span style={{ fontSize: "10px", color: COLORS.textDim }}>{fmtKickoff(event.kickoff)}</span>
        </div>
      </div>
    </div>
  );
}

function Chip2({ color, label }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      background: "rgba(255,255,255,0.06)", borderRadius: "4px", padding: "2px 7px",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span style={{ fontSize: "10px", color: "#94A3B8", textTransform: "capitalize" }}>{label}</span>
    </div>
  );
}

function ReachableRow({ item, onAdd }) {
  const { event, drive_hours, buffer_hours, distance_km } = item;
  const slot = event.time_slot ?? "noon";
  const slotColors = TIME_SLOT_COLORS[slot] ?? TIME_SLOT_COLORS.noon;
  return (
    <div
      style={{
        padding: "10px 12px", background: "rgba(255,255,255,0.03)",
        borderRadius: "8px", border: `1px solid ${COLORS.panelBorder}`,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.panelBorder; }}
    >
      <div style={{ fontSize: "13px", fontWeight: 600, color: COLORS.text, lineHeight: 1.3, marginBottom: "3px" }}>
        {event.away} <span style={{ color: COLORS.textDim, fontWeight: 400 }}>@</span> {event.home}
      </div>
      <div style={{ fontSize: "11px", color: COLORS.textDim, marginBottom: "8px" }}>
        {event.venue_name}
        {distance_km != null && distance_km > 0 && (
          <span style={{ color: COLORS.textMuted }}> · {distance_km.toFixed(0)} km</span>
        )}
      </div>
      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "8px" }}>
        <Chip2 color={driveColor(drive_hours)} label={`Drive ${fmtHours(drive_hours)}`} />
        <Chip2 color={bufferColor(buffer_hours)} label={`Buffer ${fmtHours(buffer_hours)}`} />
        <Chip2 color={slotColors.dot} label={slot} />
      </div>
      <div style={{ fontSize: "10px", color: COLORS.textDim, marginBottom: "8px" }}>
        {fmtKickoff(event.kickoff)}
      </div>
      <button
        onClick={() => onAdd(item)}
        style={{
          width: "100%", padding: "6px 0", border: "none", borderRadius: "6px",
          background: COLORS.accent, color: "#000", fontWeight: 700,
          fontSize: "12px", cursor: "pointer",
        }}
      >
        Add Stop
      </button>
    </div>
  );
}

function RoadTripBuilderInner({ stops, legs, reachable, onAddStop, onBuild, builtTrip, building }) {
  const canBuild = stops.length >= 2;
  const totalDrive = legs.reduce((s, l) => s + l.drive_hours, 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Stops + build button */}
      <div style={{ padding: "12px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
          {stops.map((ev, i) => <StopRow key={ev.id} n={i + 1} event={ev} />)}
        </div>

        {canBuild && (
          <button
            onClick={onBuild}
            disabled={building}
            style={{
              width: "100%", padding: "8px 0", border: "none", borderRadius: "7px",
              background: building ? COLORS.panelBorder : "#22C55E",
              color: building ? COLORS.textDim : "#000",
              fontWeight: 700, fontSize: "12px",
              cursor: building ? "default" : "pointer", marginBottom: "10px",
            }}
          >
            {building ? "Building…" : `Build Trip (${stops.length} stops)`}
          </button>
        )}

        {builtTrip && (
          <div style={{
            padding: "8px 12px", borderRadius: "7px", marginBottom: "10px",
            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
          }}>
            <div style={{ fontSize: "11px", color: "#22C55E", fontWeight: 700 }}>
              Score: {builtTrip.score.toFixed(1)}
            </div>
            <div style={{ fontSize: "10px", color: COLORS.textDim, marginTop: "2px" }}>
              {stops.length} games · {totalDrive.toFixed(1)}h total drive
            </div>
          </div>
        )}

        <div style={{ height: "1px", background: COLORS.panelBorder, marginBottom: "10px" }} />
        <div style={{ fontSize: "9px", color: COLORS.textDim, fontWeight: 700, letterSpacing: "1.2px" }}>
          {reachable === null ? "LOADING OPTIONS…" : `NEXT GAME OPTIONS (${reachable.length})`}
        </div>
      </div>

      {/* Reachable list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {reachable === null ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: COLORS.textDim, fontSize: "12px" }}>
            Finding reachable games…
          </div>
        ) : reachable.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: COLORS.textMuted, fontSize: "12px" }}>
            No reachable games within drive limit.
          </div>
        ) : (
          reachable.map((item) => (
            <ReachableRow key={item.event.id} item={item} onAdd={onAddStop} />
          ))
        )}
      </div>
    </div>
  );
}
