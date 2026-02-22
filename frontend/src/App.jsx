import { useState, useEffect } from "react";
import { fetchVenues } from "./api";
import Map from "./components/Map";

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

  useEffect(() => {
    fetchVenues().then((venues) => setVenueGeoJSON(venuesToGeoJSON(venues)));
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <Map venueGeoJSON={venueGeoJSON} />
    </div>
  );
}
