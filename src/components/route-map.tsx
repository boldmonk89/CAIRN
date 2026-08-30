"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Polyline, CircleMarker } from "leaflet";
import type { Fix } from "@/lib/geo";

// ponytail: OpenStreetMap raster tiles through CARTO's free dark style. No key,
// no account, no bill. Swap the tile URL for Mapbox if we ever want vector
// tiles or traffic — that needs a paid token, so it's a decision to make, not a
// default to drift into.
const TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function RouteMap({
  track, live = false, className = "", interactive = true,
}: {
  track: Fix[];
  /** keep the view pinned to the latest fix instead of the whole route */
  live?: boolean;
  className?: string;
  interactive?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const line = useRef<Polyline | null>(null);
  const head = useRef<CircleMarker | null>(null);

  // Leaflet touches `window` on import, so it can only load in the browser.
  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | null = null;

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !host.current || map.current) return;

      const m = L.map(host.current, {
        zoomControl: false,
        attributionControl: true,
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
        keyboard: interactive,
      }).setView([20.5937, 78.9629], 4);

      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
      line.current = L.polyline([], { color: "#ff5a1f", weight: 4, lineJoin: "round" }).addTo(m);
      head.current = L.circleMarker([0, 0], {
        radius: 6, color: "#0c0a09", weight: 2, fillColor: "#ff5a1f", fillOpacity: 1,
      });
      map.current = m;

      // the map is often laid out before its container has a height
      resize = new ResizeObserver(() => m.invalidateSize());
      resize.observe(host.current);
      draw();
    })();

    return () => {
      cancelled = true;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
      line.current = null;
      head.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  function draw() {
    const m = map.current, l = line.current;
    if (!m || !l) return;
    const coords = track.map((f) => [f.lat, f.lon] as [number, number]);
    l.setLatLngs(coords);

    const last = coords.at(-1);
    if (last && head.current) {
      head.current.setLatLng(last);
      if (!m.hasLayer(head.current)) head.current.addTo(m);
    }

    if (!coords.length) return;
    if (live) m.setView(last!, Math.max(m.getZoom(), 16), { animate: false });
    else m.fitBounds(l.getBounds(), { padding: [28, 28], animate: false });
  }

  useEffect(draw);

  return (
    <div
      ref={host}
      className={className}
      role="img"
      aria-label={
        track.length
          ? `Map of the route, ${track.length} recorded points`
          : "Map, waiting for a GPS signal"
      }
    />
  );
}
