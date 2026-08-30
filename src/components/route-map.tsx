"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Polyline, CircleMarker } from "leaflet";
import type { Fix } from "@/lib/geo";

// OpenStreetMap's own tiles: no key, no account, no bill. CARTO's dark style
// used to be usable unkeyed and now serves "API KEY REQUIRED" watermarks, so
// don't go back to it without a paid token.
//
// ponytail: OSM is a light basemap darkened by a CSS filter on .leaflet-tile,
// which costs nothing and matches the UI. Their tile policy is fine for one
// person's app but not for a widely distributed one — move to a keyed provider
// (Mapbox, Stadia, MapTiler) before this ships to strangers.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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
  const [dead, setDead] = useState(false);
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

      const tiles = L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 });
      let reported = false;
      tiles.on("tileerror", () => {
        if (!reported) { reported = true; setDead(true); }
      });
      tiles.on("tileload", () => setDead(false));
      tiles.addTo(m);
      line.current = L.polyline([], { color: "#ef3d05", weight: 4, lineJoin: "round" }).addTo(m);
      head.current = L.circleMarker([0, 0], {
        radius: 6, color: "#141412", weight: 2, fillColor: "#ef3d05", fillOpacity: 1,
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
    // `className` must position this box (the callers pass `absolute inset-0`):
    // the host below fills it, and percentage heights need a definite parent.
    <div className={className}>
      {dead && (
        <p className="pointer-events-none absolute inset-x-0 bottom-8 z-[500] mx-auto w-fit rounded-lg border border-line bg-ground/90 px-3 py-1.5 text-xs text-muted">
          Map tiles unavailable — your route is still being recorded.
        </p>
      )}
      <div
        ref={host}
        className="absolute inset-0"
        role="img"
        aria-label={
          track.length
            ? `Map of the route, ${track.length} recorded points`
            : "Map, waiting for a GPS signal"
        }
      />
    </div>
  );
}
