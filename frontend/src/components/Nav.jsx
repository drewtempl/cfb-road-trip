import { COLORS } from "../constants";

export default function Nav({ page, onNavigate }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "0 20px", height: "48px", flexShrink: 0,
      background: "rgba(11,14,20,0.95)", backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${COLORS.panelBorder}`,
      zIndex: 100,
    }}>
      {/* Logo */}
      <button
        onClick={() => onNavigate("landing")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "baseline", gap: "6px", padding: "0 4px",
        }}
      >
        <span style={{
          fontFamily: "'Instrument Serif', serif", fontSize: "20px",
          color: COLORS.text, letterSpacing: "-0.5px",
        }}>
          GameTrip
        </span>
        <span style={{ fontSize: "9px", color: COLORS.accent, fontWeight: 700, letterSpacing: "0.8px" }}>
          BETA
        </span>
      </button>

      {/* Divider */}
      <div style={{ width: "1px", height: "16px", background: COLORS.panelBorder, margin: "0 12px" }} />

      {/* Nav links */}
      {[
        ["map", "Venue Map"],
        ["planner", "Road Trip Planner"],
      ].map(([target, label]) => {
        const active = page === target;
        return (
          <button
            key={target}
            onClick={() => onNavigate(target)}
            style={{
              background: active ? COLORS.accent + "18" : "transparent",
              border: "none", cursor: "pointer",
              color: active ? COLORS.accent : COLORS.textDim,
              fontSize: "13px", fontWeight: active ? 700 : 500,
              padding: "6px 12px", borderRadius: "6px",
              transition: "all 0.15s",
              marginRight: "4px",
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = COLORS.text; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = COLORS.textDim; }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
