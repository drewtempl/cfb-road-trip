import { COLORS, TIME_SLOT_COLORS } from "../constants";

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function bufferColor(hrs) {
  if (hrs >= 3) return "#34D399";
  if (hrs >= 1.5) return "#F59E0B";
  return "#F87171";
}

export default function TripCard({
  trip,
  events,
  venueMap,
  isSelected,
  onSelect,
  onHoverEnter,
  onHoverLeave,
}) {
  const tripEvents = trip.event_ids.map((id) => events.find((e) => e.id === id)).filter(Boolean);

  const firstCity = venueMap.get(tripEvents[0]?.venue_id)?.city ?? "";
  const lastCity  = venueMap.get(tripEvents[tripEvents.length - 1]?.venue_id)?.city ?? "";
  const label = firstCity && lastCity && firstCity !== lastCity
    ? `${firstCity} → ${lastCity}`
    : tripEvents[0] ? `${tripEvents[0].home} game` : "Road Trip";

  const totalDrive = trip.legs.reduce((s, l) => s + (l.drive_hours ?? 0), 0);

  return (
    <div
      onClick={() => onSelect(isSelected ? null : trip)}
      onMouseEnter={() => onHoverEnter?.(new Set(trip.event_ids))}
      onMouseLeave={() => onHoverLeave?.()}
      style={{
        background: isSelected ? "#1A2235" : COLORS.surface,
        border: `1px solid ${isSelected ? COLORS.accent + "66" : COLORS.panelBorder}`,
        borderRadius: "10px",
        padding: "14px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: isSelected ? `0 0 20px ${COLORS.accentGlow}` : "none",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: COLORS.text, letterSpacing: "-0.2px" }}>
            {label}
          </div>
          <div style={{ fontSize: "11px", color: COLORS.textDim, marginTop: "2px" }}>
            {trip.event_ids.length} games · {totalDrive.toFixed(1)}h total drive
          </div>
        </div>
        <div style={{
          fontSize: "12px", fontWeight: 700, color: COLORS.accent,
          background: COLORS.accent + "18", padding: "3px 8px", borderRadius: "6px", flexShrink: 0,
        }}>
          {trip.score.toFixed(1)}
        </div>
      </div>

      {/* Stops */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {tripEvents.map((event, i) => {
          const venue = venueMap.get(event.venue_id);
          const slot  = TIME_SLOT_COLORS[event.time_slot] ?? TIME_SLOT_COLORS.evening;
          const leg   = i < trip.legs.length ? trip.legs[i] : null;

          return (
            <div key={event.id}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0,
                  background: slot.bg, border: `2px solid ${slot.dot}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "10px", fontWeight: 800, color: slot.dot,
                }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: COLORS.text }}>
                    {event.away} @ {event.home}
                  </div>
                  <div style={{ fontSize: "11px", color: COLORS.textMuted }}>
                    {event.day} {formatTime(event.kickoff)} · {venue?.city ?? ""}, {venue?.state ?? ""}
                  </div>
                </div>
              </div>

              {leg && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  marginLeft: "11px", padding: "4px 0 4px 21px",
                  borderLeft: `2px dashed ${COLORS.panelBorder}`,
                }}>
                  <span style={{ fontSize: "10px", color: COLORS.textDim }}>
                    🚗 {leg.drive_hours?.toFixed(1)}h drive
                  </span>
                  <span style={{ fontSize: "10px", color: bufferColor(leg.buffer_hours ?? 0) }}>
                    ⏱ {leg.buffer_hours?.toFixed(1)}h buffer
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
