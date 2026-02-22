import { useState } from "react";
import LandingPage from "./pages/LandingPage";
import VenueMapPage from "./pages/VenueMapPage";
import RoadTripPage from "./pages/RoadTripPage";

export default function App() {
  const [page, setPage] = useState("landing");

  if (page === "landing") return <LandingPage onNavigate={setPage} />;
  if (page === "map") return <VenueMapPage onNavigate={setPage} />;
  return <RoadTripPage onNavigate={setPage} />;
}
