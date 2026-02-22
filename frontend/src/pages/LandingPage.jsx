import { COLORS } from "../constants";

function FeatureCard({ icon, title, desc, cta, onClick, accent = false }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: "260px", background: accent ? "rgba(245,158,11,0.05)" : COLORS.surface,
        border: `1px solid ${accent ? COLORS.accent + "44" : COLORS.panelBorder}`,
        borderRadius: "14px", padding: "28px 24px",
        cursor: "pointer", textAlign: "left", transition: "transform 0.2s, border-color 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent ? COLORS.accent + "99" : "rgba(255,255,255,0.18)";
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = accent ? COLORS.accent + "44" : COLORS.panelBorder;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ fontSize: "32px", marginBottom: "14px", lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: "16px", fontWeight: 700, color: COLORS.text, marginBottom: "8px" }}>
        {title}
      </div>
      <div style={{ fontSize: "13px", color: COLORS.textDim, lineHeight: 1.6, marginBottom: "22px" }}>
        {desc}
      </div>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        fontSize: "13px", fontWeight: 700,
        color: accent ? COLORS.accent : COLORS.text,
      }}>
        {cta} <span style={{ fontSize: "16px" }}>→</span>
      </div>
    </div>
  );
}

function StatItem({ value, label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        fontFamily: "'Instrument Serif', serif", fontSize: "28px",
        color: COLORS.text, letterSpacing: "-0.5px", lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: "11px", color: COLORS.textDim, marginTop: "4px", letterSpacing: "0.5px" }}>
        {label}
      </div>
    </div>
  );
}

export default function LandingPage({ onNavigate }) {
  return (
    <div style={{
      width: "100%", height: "100vh", background: COLORS.bg,
      display: "flex", flexDirection: "column",
      fontFamily: "'DM Sans', sans-serif", position: "relative", overflow: "hidden",
    }}>
      {/* Grid background */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `
          linear-gradient(rgba(245,158,11,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(245,158,11,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "48px 48px",
      }} />

      {/* Ambient glow */}
      <div style={{
        position: "absolute", top: "20%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: "700px", height: "500px", pointerEvents: "none",
        background: "radial-gradient(ellipse, rgba(245,158,11,0.07) 0%, transparent 65%)",
      }} />

      {/* Minimal top nav */}
      <div style={{
        display: "flex", alignItems: "center", padding: "16px 28px",
        borderBottom: `1px solid ${COLORS.panelBorder}`,
        position: "relative", zIndex: 10, flexShrink: 0,
      }}>
        <span style={{
          fontFamily: "'Instrument Serif', serif", fontSize: "20px",
          color: COLORS.text, letterSpacing: "-0.5px",
        }}>
          GameTrip
        </span>
        <span style={{
          fontSize: "9px", color: COLORS.accent, fontWeight: 700,
          letterSpacing: "0.8px", marginLeft: "7px",
        }}>
          BETA
        </span>
      </div>

      {/* Hero */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        position: "relative", zIndex: 10, padding: "0 24px",
      }}>
        {/* Eyebrow chip */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "28px",
          background: COLORS.surface, border: `1px solid ${COLORS.panelBorder}`,
          borderRadius: "20px", padding: "5px 16px",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: COLORS.accent, display: "inline-block",
          }} />
          <span style={{ fontSize: "11px", color: COLORS.textDim, fontWeight: 600, letterSpacing: "0.8px" }}>
            COLLEGE FOOTBALL · 2025 SEASON
          </span>
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: "clamp(56px, 9vw, 88px)",
          color: COLORS.text, margin: "0 0 18px",
          lineHeight: 1.0, letterSpacing: "-2px", textAlign: "center",
        }}>
          GameTrip
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: "clamp(15px, 2vw, 18px)", color: COLORS.textDim,
          margin: "0 0 52px", lineHeight: 1.65,
          maxWidth: "460px", textAlign: "center",
        }}>
          Plan multi-game road trips across college football stadiums.
          Explore venues, filter schedules, and build the perfect football weekend.
        </p>

        {/* Feature cards */}
        <div style={{ display: "flex", gap: "18px", justifyContent: "center", flexWrap: "wrap" }}>
          <FeatureCard
            icon="🗺️"
            title="Venue Map"
            desc="Explore every CFB stadium on a fullscreen interactive map. Hover to see capacity, city, and stadium details."
            cta="Explore Map"
            onClick={() => onNavigate("map")}
          />
          <FeatureCard
            icon="🏈"
            title="Road Trip Planner"
            desc="Browse weekly schedules, discover suggested road trips, and build your own custom multi-stop itinerary."
            cta="Plan a Trip"
            onClick={() => onNavigate("planner")}
            accent
          />
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: "flex", justifyContent: "center", gap: "56px",
        padding: "24px 28px", borderTop: `1px solid ${COLORS.panelBorder}`,
        position: "relative", zIndex: 10, flexShrink: 0,
      }}>
        <StatItem value="197" label="WEEK 1 GAMES" />
        <div style={{ width: "1px", background: COLORS.panelBorder, margin: "0" }} />
        <StatItem value="300+" label="VENUES" />
        <div style={{ width: "1px", background: COLORS.panelBorder }} />
        <StatItem value="15" label="WEEKS" />
        <div style={{ width: "1px", background: COLORS.panelBorder }} />
        <StatItem value="2025" label="SEASON" />
      </div>
    </div>
  );
}
