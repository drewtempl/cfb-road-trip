import { useState, useEffect } from "react";
import { fetchVenues } from "../api";
import MapView from "../components/Map";
import Nav from "../components/Nav";
import { venuesToGeoJSON } from "../utils";
import { COLORS } from "../constants";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

export default function VenueMapPage({ onNavigate }) {
  const [venueGeoJSON, setVenueGeoJSON] = useState(EMPTY_FC);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVenues()
      .then((venues) => {
        setVenueGeoJSON(venuesToGeoJSON(venues));
        setCount(venues.length);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", flexDirection: "column" }}>
      <Nav page="map" onNavigate={onNavigate} />

      {/* Map fills remaining height */}
      <div style={{ flex: 1, position: "relative" }}>
        <MapView
          venueGeoJSON={venueGeoJSON}
          eventsGeoJSON={EMPTY_FC}
          layerVisibility={{ venues: true, events: false }}
          onStartRoadTrip={null}
        />

        {/* Bottom info bar */}
        {!loading && (
          <div style={{
            position: "absolute", bottom: "28px", left: "50%",
            transform: "translateX(-50%)", zIndex: 10,
            background: "rgba(11,14,20,0.88)", backdropFilter: "blur(10px)",
            border: `1px solid ${COLORS.panelBorder}`, borderRadius: "24px",
            padding: "9px 22px",
            display: "flex", alignItems: "center", gap: "10px",
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: COLORS.accent, display: "inline-block", flexShrink: 0,
            }} />
            <span style={{ fontSize: "12px", color: COLORS.textDim, fontWeight: 500, whiteSpace: "nowrap" }}>
              {count} venues · Dot size = stadium capacity · Click for details
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
