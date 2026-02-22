import { COLORS, TIME_SLOT_COLORS, ALL_TIME_SLOTS, WEEKS } from "../constants";
import TripCard from "./TripCard";

function Spinner() {
  return (
    <div style={{ textAlign: "center", padding: "32px 0", color: COLORS.textDim }}>
      <div style={{
        width: "24px", height: "24px", border: `2px solid ${COLORS.panelBorder}`,
        borderTopColor: COLORS.accent, borderRadius: "50%",
        animation: "spin 0.8s linear infinite", margin: "0 auto 8px",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      Loading…
    </div>
  );
}

export default function SidePanel({
  week,
  onWeekChange,
  availableDays,
  selectedDays,
  onDayToggle,
  selectedTimeSlots,
  onSlotToggle,
  trips,
  events,
  venueMap,
  selectedTrip,
  onTripSelect,
  onHoverEnter,
  onHoverLeave,
  loadingEvents,
  loadingTrips,
  error,
  onComputeTrips,
  computing,
  filteredEvents,
}) {
  return (
    <div style={{
      width: "380px", minWidth: "380px", height: "100%",
      background: COLORS.panel,
      borderRight: `1px solid ${COLORS.panelBorder}`,
      display: "flex", flexDirection: "column",
      overflow: "hidden", zIndex: 10,
    }}>
      {/* ── Header ── */}
      <div style={{ padding: "20px 20px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "2px" }}>
          <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: "26px", color: COLORS.text, letterSpacing: "-0.5px" }}>
            GameTrip
          </span>
          <span style={{ fontSize: "11px", color: COLORS.accent, fontWeight: 700, letterSpacing: "0.5px" }}>
            BETA
          </span>
        </div>
        <div style={{ fontSize: "12px", color: COLORS.textDim, marginBottom: "16px" }}>
          College Football Road Trip Planner
        </div>

        {/* ── Week selector ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: COLORS.surface, borderRadius: "8px", padding: "8px 12px",
          marginBottom: "16px",
        }}>
          <span style={{ fontSize: "11px", color: COLORS.textMuted, fontWeight: 500, flexShrink: 0 }}>WEEK</span>
          <div style={{ display: "flex", gap: "2px", flex: 1, overflowX: "auto" }}>
            {WEEKS.map((w) => (
              <button
                key={w}
                onClick={() => onWeekChange(w)}
                style={{
                  flex: 1, minWidth: "22px", textAlign: "center", padding: "4px 2px",
                  fontSize: "12px", fontWeight: w === week ? 700 : 500,
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

        {/* ── Day filters ── */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontSize: "10px", color: COLORS.textDim, fontWeight: 600, letterSpacing: "1px", marginBottom: "6px" }}>
            DAY
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {availableDays.map((day) => {
              const active = selectedDays.has(day);
              const DAY_FULL = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
              return (
                <button
                  key={day}
                  onClick={() => onDayToggle(day)}
                  style={{
                    padding: "6px 14px", fontSize: "12px", fontWeight: 600,
                    background: active ? COLORS.surface : "transparent",
                    color: active ? COLORS.text : COLORS.textDim,
                    border: `1px solid ${active ? COLORS.panelBorder : "transparent"}`,
                    borderRadius: "6px", transition: "all 0.15s",
                  }}
                >
                  {DAY_FULL[day] ?? day}
                </button>
              );
            })}
            {availableDays.length === 0 && (
              <span style={{ fontSize: "12px", color: COLORS.textDim }}>—</span>
            )}
          </div>
        </div>

        {/* ── Time slot filters ── */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "10px", color: COLORS.textDim, fontWeight: 600, letterSpacing: "1px", marginBottom: "6px" }}>
            TIME SLOT
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {ALL_TIME_SLOTS.map((key) => {
              const slot = TIME_SLOT_COLORS[key];
              const active = selectedTimeSlots.has(key);
              return (
                <button
                  key={key}
                  onClick={() => onSlotToggle(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "6px 12px", fontSize: "12px", fontWeight: 600,
                    background: active ? slot.bg : "transparent",
                    color: active ? slot.dot : COLORS.textDim,
                    border: `1px solid ${active ? slot.border + "44" : "transparent"}`,
                    borderRadius: "6px", transition: "all 0.15s",
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: active ? slot.dot : COLORS.textDim, opacity: active ? 1 : 0.4 }} />
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ height: "1px", background: COLORS.panelBorder, marginBottom: "14px" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <span style={{ fontSize: "10px", color: COLORS.textDim, fontWeight: 600, letterSpacing: "1px" }}>
            ROAD TRIPS
          </span>
          {!loadingTrips && (
            <span style={{ fontSize: "11px", color: COLORS.textMuted }}>
              {trips.length} found
            </span>
          )}
        </div>
      </div>

      {/* ── Trip list ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {error && (
          <div style={{
            padding: "12px 14px", borderRadius: "8px",
            background: "#F8717122", border: "1px solid #F8717144",
            color: "#F87171", fontSize: "12px",
          }}>
            Could not reach API — is the server running?
          </div>
        )}

        {loadingTrips ? (
          <Spinner />
        ) : trips.length === 0 && !error ? (
          <div style={{
            padding: "20px 16px", borderRadius: "10px",
            background: COLORS.surface, border: `1px solid ${COLORS.panelBorder}`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: "13px", color: COLORS.textMuted, marginBottom: "12px" }}>
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
                opacity: computing ? 0.7 : 1,
              }}
            >
              {computing ? "Computing…" : `Generate trips for Week ${week}`}
            </button>
          </div>
        ) : (
          trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              events={events}
              venueMap={venueMap}
              isSelected={selectedTrip?.id === trip.id}
              onSelect={onTripSelect}
              onHoverEnter={onHoverEnter}
              onHoverLeave={onHoverLeave}
            />
          ))
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: "12px 20px", borderTop: `1px solid ${COLORS.panelBorder}`,
        display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span style={{ fontSize: "11px", color: COLORS.textDim }}>
          {loadingEvents ? "Loading…" : `${filteredEvents.length} games shown`}
        </span>
        <span style={{ fontSize: "11px", color: COLORS.textDim }}>
          Week {week} · 2025 Season
        </span>
      </div>
    </div>
  );
}
