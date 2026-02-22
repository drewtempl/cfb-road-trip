import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { COLORS, TIME_SLOT_COLORS } from "../constants";

// Injected into popup HTML to avoid inline style CSP issues
const BTN_STYLE = [
  "margin-top:10px", "width:100%", "padding:7px 0", "border:none",
  "border-radius:6px", "background:#F59E0B", "color:#000",
  "font-weight:700", "font-size:12px", "cursor:pointer",
  "font-family:'DM Sans',sans-serif", "letter-spacing:0.3px",
].join(";");

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const EMPTY_FC = { type: "FeatureCollection", features: [] };

// Mapbox expression: pick dot color from time_slot property
const TIME_SLOT_COLOR_EXPR = [
  "match", ["get", "time_slot"],
  "noon",      TIME_SLOT_COLORS.noon.dot,
  "afternoon", TIME_SLOT_COLORS.afternoon.dot,
  "evening",   TIME_SLOT_COLORS.evening.dot,
  "#94A3B8",
];

const DEFAULT_VISIBILITY = { venues: true, events: true };

export default function Map({
  venueGeoJSON = EMPTY_FC,
  eventsGeoJSON = EMPTY_FC,
  layerVisibility = DEFAULT_VISIBILITY,
  onStartRoadTrip = null,
}) {
  const containerRef        = useRef(null);
  const mapRef              = useRef(null);
  const loadedRef           = useRef(false);
  const pendingRef          = useRef(null);   // venue data before map loaded
  const pendingEventsRef    = useRef(null);   // event data before map loaded
  const popupRef            = useRef(null);
  const hoveredRef          = useRef(null);   // currently hovered venue id
  const hoveredEventRef     = useRef(null);   // currently hovered event id
  const onStartRoadTripRef  = useRef(onStartRoadTrip);

  useEffect(() => {
    onStartRoadTripRef.current = onStartRoadTrip;
  }, [onStartRoadTrip]);

  // ── init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-90, 36],
      zoom: 4.2,
      attributionControl: false,
    });

    mapRef.current = map;

    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      "bottom-right"
    );

    map.on("load", () => {
      // ── source ──────────────────────────────────────────────────────────────
      // promoteId tells Mapbox to use Feature.id as the stable feature ID,
      // which is required for setFeatureState to work on this source.
      map.addSource("venues", {
        type: "geojson",
        data: EMPTY_FC,
        promoteId: "id",
      });

      // ── glow layer (renders behind the dot) ─────────────────────────────────
      // A blurred, low-opacity circle scaled by capacity — gives a heatmap feel.
      map.addLayer({
        id: "venues-glow",
        type: "circle",
        source: "venues",
        paint: {
          "circle-color": COLORS.accent,
          "circle-radius": [
            "interpolate", ["linear"],
            ["coalesce", ["get", "capacity"], 30000],
            5000, 14,
            50000, 30,
            100000, 46,
          ],
          "circle-blur": 1.2,
          "circle-opacity": 0.12,
        },
      });

      // ── main dot layer ───────────────────────────────────────────────────────
      // Data-driven radius from capacity. Hover state (GPU-side via feature-state)
      // changes color without any JS re-render.
      map.addLayer({
        id: "venues-circle",
        type: "circle",
        source: "venues",
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            "#FFFFFF",
            COLORS.accent,
          ],
          "circle-radius": [
            "interpolate", ["linear"],
            ["coalesce", ["get", "capacity"], 30000],
            5000, 5,
            50000, 9,
            100000, 14,
          ],
          "circle-stroke-color": "rgba(255,255,255,0.25)",
          "circle-stroke-width": 1,
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            1,
            0.85,
          ],
        },
      });

      // ── hover: toggle GPU feature state ─────────────────────────────────────
      // setFeatureState is synchronous + GPU-side: no React re-render needed.
      map.on("mouseenter", "venues-circle", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.id;
        if (id == null) return;
        if (hoveredRef.current != null) {
          map.setFeatureState(
            { source: "venues", id: hoveredRef.current },
            { hover: false }
          );
        }
        hoveredRef.current = id;
        map.setFeatureState({ source: "venues", id }, { hover: true });
      });

      map.on("mouseleave", "venues-circle", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredRef.current != null) {
          map.setFeatureState(
            { source: "venues", id: hoveredRef.current },
            { hover: false }
          );
          hoveredRef.current = null;
        }
      });

      // ── click: show popup ────────────────────────────────────────────────────
      // e.features[0].properties comes from the GeoJSON properties object.
      map.on("click", "venues-circle", (e) => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        if (popupRef.current) popupRef.current.remove();
        const cap = props.capacity
          ? `<div style="margin-top:6px;font-size:11px;color:#64748B;">
               Cap. ${Number(props.capacity).toLocaleString()}
             </div>`
          : "";
        const location = [props.city, props.state].filter(Boolean).join(", ");
        popupRef.current = new mapboxgl.Popup({
          offset: 12,
          closeButton: true,
          maxWidth: "220px",
        })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:'DM Sans',sans-serif;">
              <div style="font-size:14px;font-weight:700;color:#F0F6FC;margin-bottom:4px;">
                ${props.name}
              </div>
              <div style="font-size:12px;color:#94A3B8;">${location}</div>
              ${cap}
            </div>
          `)
          .addTo(map);
      });

      // ── events source ────────────────────────────────────────────────────────
      map.addSource("events", {
        type: "geojson",
        data: EMPTY_FC,
        promoteId: "id",
      });

      // ── events glow ──────────────────────────────────────────────────────────
      map.addLayer({
        id: "events-glow",
        type: "circle",
        source: "events",
        paint: {
          "circle-color": TIME_SLOT_COLOR_EXPR,
          "circle-radius": 16,
          "circle-blur": 1.0,
          "circle-opacity": 0.22,
        },
      });

      // ── events dot ───────────────────────────────────────────────────────────
      map.addLayer({
        id: "events-circle",
        type: "circle",
        source: "events",
        paint: {
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            "#FFFFFF",
            TIME_SLOT_COLOR_EXPR,
          ],
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            9,
            6,
          ],
          "circle-stroke-color": "rgba(255,255,255,0.35)",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.95,
        },
      });

      // ── events hover ─────────────────────────────────────────────────────────
      map.on("mouseenter", "events-circle", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.id;
        if (id == null) return;
        if (hoveredEventRef.current != null) {
          map.setFeatureState(
            { source: "events", id: hoveredEventRef.current },
            { hover: false }
          );
        }
        hoveredEventRef.current = id;
        map.setFeatureState({ source: "events", id }, { hover: true });
      });

      map.on("mouseleave", "events-circle", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredEventRef.current != null) {
          map.setFeatureState(
            { source: "events", id: hoveredEventRef.current },
            { hover: false }
          );
          hoveredEventRef.current = null;
        }
      });

      // ── events click popup ───────────────────────────────────────────────────
      map.on("click", "events-circle", (e) => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        if (popupRef.current) popupRef.current.remove();
        const location = [props.city, props.state].filter(Boolean).join(", ");
        const date = props.startDate
          ? new Date(props.startDate).toLocaleString("en-US", {
              weekday: "short", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit", timeZoneName: "short",
            })
          : "";
        const slotColors = {
          noon: "#34D399", afternoon: "#F59E0B", evening: "#A78BFA",
        };
        const dotColor = slotColors[props.time_slot] ?? "#94A3B8";
        const popup = new mapboxgl.Popup({ offset: 12, closeButton: true, maxWidth: "240px" })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:'DM Sans',sans-serif;">
              <div style="font-size:13px;font-weight:700;color:#F0F6FC;margin-bottom:6px;line-height:1.3;">
                ${props.awayTeam} <span style="color:#64748B;">@</span> ${props.homeTeam}
              </div>
              <div style="font-size:11px;color:#94A3B8;margin-bottom:4px;">${props.venueName}</div>
              <div style="font-size:11px;color:#64748B;">${location}</div>
              ${date ? `<div style="margin-top:6px;font-size:11px;color:#64748B;">${date}</div>` : ""}
              <div style="margin-top:8px;display:inline-flex;align-items:center;gap:5px;
                          background:rgba(255,255,255,0.06);border-radius:4px;padding:3px 7px;">
                <span style="width:7px;height:7px;border-radius:50%;background:${dotColor};display:inline-block;"></span>
                <span style="font-size:10px;color:#94A3B8;text-transform:capitalize;">${props.time_slot ?? ""}</span>
              </div>
              <button data-action="start-road-trip" data-event-id="${props.id}" style="${BTN_STYLE}">
                Start Road Trip Here
              </button>
            </div>
          `)
          .addTo(map);

        popupRef.current = popup;

        // Attach click handler to the button via DOM (popup HTML can't use React handlers)
        const btn = popup.getElement()?.querySelector('[data-action="start-road-trip"]');
        if (btn) {
          btn.addEventListener("click", () => {
            popup.remove();
            onStartRoadTripRef.current?.(props.id);
          });
        }
      });

      loadedRef.current = true;

      // If venue data arrived before the map finished loading, apply it now.
      if (pendingRef.current) {
        map.getSource("venues").setData(pendingRef.current);
        pendingRef.current = null;
      }
      if (pendingEventsRef.current) {
        map.getSource("events").setData(pendingEventsRef.current);
        pendingEventsRef.current = null;
      }
    });

    return () => {
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // ── sync venue data whenever the prop changes ────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    if (loadedRef.current) {
      mapRef.current.getSource("venues")?.setData(venueGeoJSON);
    } else {
      pendingRef.current = venueGeoJSON;
    }
  }, [venueGeoJSON]);

  // ── sync events data whenever the prop changes ───────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    if (loadedRef.current) {
      mapRef.current.getSource("events")?.setData(eventsGeoJSON);
    } else {
      pendingEventsRef.current = eventsGeoJSON;
    }
  }, [eventsGeoJSON]);

  // ── sync layer visibility ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const vis = (on) => (on ? "visible" : "none");
    map.setLayoutProperty("venues-glow",   "visibility", vis(layerVisibility.venues));
    map.setLayoutProperty("venues-circle", "visibility", vis(layerVisibility.venues));
    map.setLayoutProperty("events-glow",   "visibility", vis(layerVisibility.events));
    map.setLayoutProperty("events-circle", "visibility", vis(layerVisibility.events));
  }, [layerVisibility]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
