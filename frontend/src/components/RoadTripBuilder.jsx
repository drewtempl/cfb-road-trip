import { COLORS, TIME_SLOT_COLORS } from "../constants";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtKickoff(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function driveColor(hours) {
  if (hours <= 4) return "#34D399";
  if (hours <= 8) return "#F59E0B";
  return "#F87171";
}

function bufferColor(hours) {
  if (hours >= 3) return "#34D399";
  if (hours >= 1.5) return "#F59E0B";
  return "#F87171";
}

function fmtHours(h) {
  if (h < 1) return `${Math.round(h * 60)}m`;
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

// ── sub-components ────────────────────────────────────────────────────────────

function StopBadge({ n, event }) {
  const slot = event.time_slot ?? "noon";
  const slotColor = TIME_SLOT_COLORS[slot]?.dot ?? "#94A3B8";
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "10px",
      padding: "10px 12px",
      background: "rgba(255,255,255,0.04)",
      borderRadius: "8px",
      border: `1px solid ${COLORS.panelBorder}`,
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
        <div style={{ fontSize: "11px", color: COLORS.textDim, marginTop: "2px" }}>
          {event.venue_name}
        </div>
        <div style={{ marginTop: "5px", display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: slotColor, display: "inline-block",
          }} />
          <span style={{ fontSize: "10px", color: COLORS.textDim, textTransform: "capitalize" }}>
            {fmtKickoff(event.kickoff)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ReachableCard({ item, onAdd }) {
  const { event, drive_hours, buffer_hours, distance_km } = item;
  const slot = event.time_slot ?? "noon";
  const slotColors = TIME_SLOT_COLORS[slot] ?? TIME_SLOT_COLORS.noon;

  return (
    <div style={{
      padding: "10px 12px",
      background: "rgba(255,255,255,0.03)",
      borderRadius: "8px",
      border: `1px solid ${COLORS.panelBorder}`,
      transition: "border-color 0.15s",
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = COLORS.panelBorder}
    >
      {/* matchup */}
      <div style={{ fontSize: "13px", fontWeight: 600, color: COLORS.text, lineHeight: 1.3, marginBottom: "3px" }}>
        {event.away} <span style={{ color: COLORS.textDim, fontWeight: 400 }}>@</span> {event.home}
      </div>
      <div style={{ fontSize: "11px", color: COLORS.textDim, marginBottom: "8px" }}>
        {event.venue_name}
        {distance_km != null && distance_km > 0 && (
          <span style={{ color: COLORS.textMuted }}> · {distance_km.toFixed(0)} km</span>
        )}
      </div>

      {/* drive + buffer + slot row */}
      <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginBottom: "8px" }}>
        <Chip color={driveColor(drive_hours)} label={`Drive ${fmtHours(drive_hours)}`} />
        <Chip color={bufferColor(buffer_hours)} label={`Buffer ${fmtHours(buffer_hours)}`} />
        <Chip color={slotColors.dot} label={slot} />
      </div>

      {/* kickoff */}
      <div style={{ fontSize: "10px", color: COLORS.textDim, marginBottom: "8px" }}>
        {fmtKickoff(event.kickoff)}
      </div>

      <button
        onClick={() => onAdd(item)}
        style={{
          width: "100%", padding: "6px 0", border: "none", borderRadius: "6px",
          background: COLORS.accent, color: "#000", fontWeight: 700,
          fontSize: "12px", cursor: "pointer", letterSpacing: "0.3px",
        }}
      >
        Add Stop
      </button>
    </div>
  );
}

function Chip({ color, label }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      background: "rgba(255,255,255,0.06)", borderRadius: "4px",
      padding: "2px 7px",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span style={{ fontSize: "10px", color: "#94A3B8", textTransform: "capitalize" }}>{label}</span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function RoadTripBuilder({
  stops,          // EventOut[]
  legs,           // {drive_hours, buffer_hours}[] — one per leg between stops
  reachable,      // ReachableEventOut[] | null  (null = loading)
  onAddStop,      // (ReachableEventOut) => void
  onClear,        // () => void
  onBuild,        // () => void  — POST /trips/custom
  builtTrip,      // CustomTripOut | null
  building,       // bool — building in progress
}) {
  const canBuild = stops.length >= 2;
  const totalDriveHours = legs.reduce((s, l) => s + l.drive_hours, 0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── header ── */}
      <div style={{ padding: "0 20px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <span style={{ fontSize: "10px", color: COLORS.textDim, fontWeight: 600, letterSpacing: "1px" }}>
            BUILDING YOUR TRIP
          </span>
          <button
            onClick={onClear}
            style={{
              background: "none", border: `1px solid ${COLORS.panelBorder}`,
              color: COLORS.textDim, fontSize: "11px", padding: "3px 8px",
              borderRadius: "5px", cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>

        {/* selected stops */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
          {stops.map((ev, i) => (
            <StopBadge key={ev.id} n={i + 1} event={ev} />
          ))}
        </div>

        {/* build trip button */}
        {canBuild && (
          <button
            onClick={onBuild}
            disabled={building}
            style={{
              width: "100%", padding: "8px 0", border: "none", borderRadius: "7px",
              background: building ? COLORS.panelBorder : "#22C55E",
              color: building ? COLORS.textDim : "#000",
              fontWeight: 700, fontSize: "12px", cursor: building ? "default" : "pointer",
              marginBottom: "10px", letterSpacing: "0.3px",
            }}
          >
            {building ? "Building…" : `Build This Trip (${stops.length} stops)`}
          </button>
        )}

        {/* built trip score */}
        {builtTrip && (
          <div style={{
            padding: "8px 12px", borderRadius: "7px", marginBottom: "10px",
            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
          }}>
            <div style={{ fontSize: "11px", color: "#22C55E", fontWeight: 700 }}>
              Trip score: {builtTrip.score.toFixed(1)}
            </div>
            <div style={{ fontSize: "10px", color: COLORS.textDim, marginTop: "2px" }}>
              {stops.length} games · {totalDriveHours.toFixed(1)}h total drive
            </div>
          </div>
        )}

        <div style={{ height: "1px", background: COLORS.panelBorder, marginBottom: "10px" }} />
        <span style={{ fontSize: "10px", color: COLORS.textDim, fontWeight: 600, letterSpacing: "1px" }}>
          {reachable === null ? "LOADING OPTIONS…" : `NEXT GAME OPTIONS (${reachable.length})`}
        </span>
      </div>

      {/* ── reachable list ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {reachable === null ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: COLORS.textDim, fontSize: "12px" }}>
            Finding reachable games…
          </div>
        ) : reachable.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: COLORS.textMuted, fontSize: "12px" }}>
            No reachable games found within drive limit.
          </div>
        ) : (
          reachable.map((item) => (
            <ReachableCard key={item.event.id} item={item} onAdd={onAddStop} />
          ))
        )}
      </div>
    </div>
  );
}
