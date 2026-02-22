export function getTimeSlot(startDate) {
  const hour = new Date(startDate).getUTCHours();
  if (hour <= 17) return "noon";
  if (hour <= 22) return "afternoon";
  return "evening";
}

export function venuesToGeoJSON(venues) {
  return {
    type: "FeatureCollection",
    features: venues
      .filter((v) => v.lat != null && v.lng != null)
      .map((v) => ({
        type: "Feature",
        id: v.id,
        geometry: { type: "Point", coordinates: [v.lng, v.lat] },
        properties: { id: v.id, name: v.name, city: v.city, state: v.state, capacity: v.capacity },
      })),
  };
}

export function eventsToGeoJSON(events, venueMap) {
  const features = [];
  events.forEach((ev) => {
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
