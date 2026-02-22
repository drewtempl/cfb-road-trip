import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { COLORS } from "../constants";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const EMPTY_FC = { type: "FeatureCollection", features: [] };

export default function Map({ venueGeoJSON = EMPTY_FC }) {
  const containerRef = useRef(null);
  const mapRef      = useRef(null);
  const loadedRef   = useRef(false);
  const pendingRef  = useRef(null);   // data that arrived before map loaded
  const popupRef    = useRef(null);
  const hoveredRef  = useRef(null);   // currently hovered feature id

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

      loadedRef.current = true;

      // If venue data arrived before the map finished loading, apply it now.
      if (pendingRef.current) {
        map.getSource("venues").setData(pendingRef.current);
        pendingRef.current = null;
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
  // source.setData() is the idiomatic way to update GeoJSON — no layer teardown.
  useEffect(() => {
    if (!mapRef.current) return;
    if (loadedRef.current) {
      mapRef.current.getSource("venues")?.setData(venueGeoJSON);
    } else {
      // Map hasn't fired 'load' yet; stash data for the load handler above.
      pendingRef.current = venueGeoJSON;
    }
  }, [venueGeoJSON]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
