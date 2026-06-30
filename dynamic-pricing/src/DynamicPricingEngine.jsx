import { useState, useEffect, useRef, useCallback } from "react";

import ExplainCard from "./ExplainCard";
import DriverTipsCard from "./DriverTipsCard";
import DriverPanel from "./DriverPanel";
import PriceCard from "./PriceCard";
import WeatherCard from "./WeatherCard";
import RiderPanel from "./RiderPanel";
import TrafficCard from "./TrafficCard";
import SurgeCard from "./SurgeCard";
// ─── CONFIG — replace with your keys ────────────────────────────────────────
const TOMTOM_API_KEY = process.env.REACT_APP_TOMTOM_API_KEY;
const DEFAULT_CENTER = { lat: 11.9139, lng: 79.8145 }; // Central Puducherry
const DEFAULT_ZOOM = 13;
const API_BASE = process.env.REACT_APP_API_BASE;


/** Reverse geocode lat/lng → readable address */
async function reverseGeocode(lat, lng) {
  const url = new URL("https://api.tomtom.com/search/2/reverseGeocode/" + `${lat},${lng}` + ".json");
  url.searchParams.set("key", TOMTOM_API_KEY);

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const result = data.addresses?.[0]?.address;

  if (!result) return null;

  return {
    lat,
    lng,
    label: result.freeformAddress,
    name: result.municipalitySubdivision || result.municipality || result.streetName || "Unknown Area",
    zone: result.municipalitySubdivision || result.municipality || "Default Zone",
  };
}
// ─── TomTom API helpers ───────────────────────────────────────────────────────

/** Fuzzy place search — returns up to 5 suggestions */
async function searchPlaces(query, center) {
  if (!query || query.length < 2) return [];
  const url = new URL("https://api.tomtom.com/search/2/search/" + encodeURIComponent(query) + ".json");
  url.searchParams.set("key", TOMTOM_API_KEY);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lat", center.lat);
  url.searchParams.set("lon", center.lng);
  url.searchParams.set("radius", "50000");
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map((r) => ({
    id: r.id,
    label: r.address?.freeformAddress || r.poi?.name || "Unknown",
    name: r.poi?.name || r.address?.municipality || "",
    lat: r.position.lat,
    lng: r.position.lon,
    zone: r.address?.municipalitySubdivision || r.address?.municipality || "Default Zone",
  }));
}

/** Calculate a driving route between two points */
async function calculateRoute(pickup, destination) {
  const url = new URL(
    `https://api.tomtom.com/routing/1/calculateRoute/${pickup.lat},${pickup.lng}:${destination.lat},${destination.lng}/json`
  );
  url.searchParams.set("key", TOMTOM_API_KEY);
  url.searchParams.set("travelMode", "car");
  url.searchParams.set("routeType", "fastest");
  url.searchParams.set("traffic", "true");
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;
  return {
    points: route.legs.flatMap((leg) => leg.points),
    distanceM: route.summary.lengthInMeters,
    durationSec: route.summary.travelTimeInSeconds,
  };
}

// ─── Debounce hook ────────────────────────────────────────────────────────────
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
const fmtDist = (m) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const fmtTime = (s) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    : `${Math.floor(s / 60)} min`;

// ─── SearchInput Component ────────────────────────────────────────────────────
function SearchInput({ placeholder, value, onChange, onSelect, color, icon }) {
  const [query, setQuery] = useState(value?.label || "");
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [priceData, setPriceData] = useState(null);
  const [priceError, setPriceError] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debouncedQuery = useDebounce(query, 280);
  const wrapRef = useRef(null);

  // Sync external value → internal query label
  useEffect(() => {
    if (value?.label && value.label !== query) setQuery(value.label);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch suggestions
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    // Don't re-search if query matches the already-selected label
    if (value?.label === debouncedQuery) return;
    setLoading(true);
    searchPlaces(debouncedQuery, DEFAULT_CENTER)
      .then((res) => { setSuggestions(res); setOpen(res.length > 0); setActiveIdx(-1); })
      .finally(() => setLoading(false));
  }, [debouncedQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (s) => {
    setQuery(s.label);
    setSuggestions([]);
    setOpen(false);
    onSelect(s);
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && activeIdx >= 0) handleSelect(suggestions[activeIdx]);
    if (e.key === "Escape") { setOpen(false); setActiveIdx(-1); }
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    onChange(e.target.value);
    if (!e.target.value) onSelect(null);
  };

  const accentStyle = { "--accent": color };

  return (
    <div className="search-wrap" ref={wrapRef} style={accentStyle}>
      <div className={`search-field ${focused ? "focused" : ""} ${value ? "has-value" : ""}`}>
        <span className="search-field-icon">{icon}</span>
        <input
          type="text"
          className="search-input"
          placeholder={placeholder}
          value={query}
          onChange={handleChange}
          onFocus={() => { setFocused(true); if (suggestions.length) setOpen(true); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <span className="search-spinner" />}
        {query && !loading && (
          <button className="search-clear" onClick={() => { setQuery(""); setSuggestions([]); setOpen(false); onSelect(null); onChange(""); }}>×</button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="suggestions-dropdown">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              className={`suggestion-item ${i === activeIdx ? "active" : ""}`}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="suggestion-pin" style={{ color }}>◈</span>
              <span className="suggestion-text">
                <span className="suggestion-name">{s.name || s.label.split(",")[0]}</span>
                <span className="suggestion-addr">{s.label}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function DynamicPricingEngine() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({ pickup: null, destination: null });
  const routeLayerRef = useRef(false);

  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [rideType, setRideType] = useState("single");
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);   // { distanceM, durationSec }
  const [routeLoading, setRouteLoading] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceData, setPriceData] = useState(null);
  const [priceError, setPriceError] = useState(false);
  const [demandData, setDemandData] = useState(null);
  const [demandLoading, setDemandLoading] = useState(false);
  const [countdown, setCountdown] = useState(20);
  const [weatherData, setWeatherData] = useState(null);
  const [trafficData, setTrafficData] = useState(null);   // ← add this
  // Click-state for map clicks (ref so closure stays fresh)
  const clickModeRef = useRef("pickup"); // "pickup" | "destination" | "none"
  const [activeInput, setActiveInput] = useState("pickup"); // which input is "focused"

  // ── Load TomTom SDK ────────────────────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById("tt-css")) { if (window.tt) setSdkLoaded(true); return; }
    const css = document.createElement("link");
    css.id = "tt-css"; css.rel = "stylesheet";
    css.href = "https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.25.0/maps/maps.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.id = "tt-js";
    js.src = "https://api.tomtom.com/maps-sdk-for-web/cdn/6.x/6.25.0/maps/maps-web.min.js";
    js.onload = () => setSdkLoaded(true);
    document.head.appendChild(js);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        // Reverse geocode to get readable label
        const location = await reverseGeocode(latitude, longitude);

        const pickupPoint = location || {
          lat: latitude,
          lng: longitude,
          label: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          name: "Current location",
        };

        setPickup(pickupPoint);
        placeMarker("pickup", latitude, longitude);

        mapRef.current?.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          duration: 800,
        });

        clickModeRef.current = "destination";
        setActiveInput("destination");
      },
      (err) => {
        alert("Location permission denied");
        console.error(err);
      },
      { enableHighAccuracy: true }
    );
  };

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sdkLoaded || !mapContainerRef.current || mapRef.current) return;
    const tt = window.tt;
    mapRef.current = tt.map({
      key: TOMTOM_API_KEY,
      container: mapContainerRef.current,
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      style: `https://api.tomtom.com/style/1/style/22.2.1-*?map=2/basic_street-dark&poi=2/poi_dynamic-dark&key=${TOMTOM_API_KEY}`,
    });
    mapRef.current.on("load", () => setMapReady(true));
    mapRef.current.on("error", (e) => console.warn("Map:", e?.error?.message));
  }, [sdkLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Place marker helper ────────────────────────────────────────────────────
  const placeMarker = useCallback((type, lat, lng) => {
    if (!mapRef.current || !window.tt) return;
    if (markersRef.current[type]) { markersRef.current[type].remove(); markersRef.current[type] = null; }
    const el = document.createElement("div");
    el.className = `map-marker map-marker--${type}`;
    el.innerHTML = `<div class="marker-body"><span>${type === "pickup" ? "A" : "B"}</span></div><div class="marker-tip"></div>`;
    markersRef.current[type] = new window.tt.Marker({ element: el, anchor: "bottom" })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);
  }, []);

  // ── Draw / clear route on map ──────────────────────────────────────────────

  const dashAnimRef = useRef(null);

  const drawRoute = useCallback((points) => {
    const map = mapRef.current;
    if (!map) return;

    // Stop any running dash animation
    if (dashAnimRef.current) {
      cancelAnimationFrame(dashAnimRef.current);
      dashAnimRef.current = null;
    }

    // Remove old layers + source
    const oldLayers = ["route-dash", "route-core", "route-halo", "route-glow-wide", "route-glow"];
    if (routeLayerRef.current) {
      oldLayers.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource("route")) map.removeSource("route");
      routeLayerRef.current = false;
    }
    if (!points || points.length === 0) return;

    const coords = points.map((p) => [p.longitude ?? p.lng, p.latitude ?? p.lat]);

    map.addSource("route", {
      type: "geojson",
      data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } },
    });

    // Layer 1 — outermost wide soft glow
    map.addLayer({
      id: "route-glow-wide", type: "line", source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#f5a623", "line-width": 28, "line-opacity": 0.06, "line-blur": 20 },
    });

    // Layer 2 — tight amber halo
    map.addLayer({
      id: "route-glow", type: "line", source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffc84a", "line-width": 12, "line-opacity": 0.18, "line-blur": 6 },
    });

    // Layer 3 — solid bright amber core
    map.addLayer({
      id: "route-halo", type: "line", source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#f5a623", "line-width": 5, "line-opacity": 0.55 },
    });

    // Layer 4 — white-hot centerline
    map.addLayer({
      id: "route-core", type: "line", source: "route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.9 },
    });

    // Layer 5 — animated cyan travelling dash
    map.addLayer({
      id: "route-dash", type: "line", source: "route",
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": "#00e8ff",
        "line-width": 3,
        "line-opacity": 0.9,
        "line-dasharray": [0, 4, 3, 4],
      },
    });

    routeLayerRef.current = true;

    // Animate the dash by cycling through offset patterns
    const frames = [
      [0, 4, 3, 4],
      [0.5, 4, 2.5, 4],
      [1, 4, 2, 4],
      [1.5, 4, 1.5, 4],
      [2, 4, 1, 4],
      [2.5, 4, 0.5, 4],
      [3, 4, 0, 4],
      [3.5, 3.5, 0, 4],
      [4, 3, 0, 4],
      [0, 4, 3.5, 3.5],
    ];
    let frameIdx = 0;
    let lastTime = 0;
    const INTERVAL = 80; // ms per frame

    const animate = (timestamp) => {
      if (!routeLayerRef.current) return;
      if (timestamp - lastTime >= INTERVAL) {
        lastTime = timestamp;
        try {
          map.setPaintProperty("route-dash", "line-dasharray", frames[frameIdx % frames.length]);
        } catch (_) { return; } // layer was removed
        frameIdx++;
      }
      dashAnimRef.current = requestAnimationFrame(animate);
    };
    dashAnimRef.current = requestAnimationFrame(animate);

    // Fit bounds to show full route
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: { top: 80, bottom: 80, left: 420, right: 80 }, duration: 900 }
    );
  }, []);

  const clearRoute = useCallback(() => {
    if (dashAnimRef.current) {
      cancelAnimationFrame(dashAnimRef.current);
      dashAnimRef.current = null;
    }
    drawRoute(null);
    setRouteInfo(null);
  }, [drawRoute]);

  // ── Fetch route when both points are set ──────────────────────────────────
  useEffect(() => {
    if (!mapReady || !pickup || !destination) { clearRoute(); return; }
    setRouteLoading(true);
    calculateRoute(pickup, destination)
      .then((r) => {
        if (r) { drawRoute(r.points); setRouteInfo({ distanceM: r.distanceM, durationSec: r.durationSec }); }
      })
      .finally(() => setRouteLoading(false));
  }, [pickup, destination, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Map click handler ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const handler = (e) => {
      const mode = clickModeRef.current;
      if (mode === "none") return;
      const { lng, lat } = e.lngLat;
      const pseudo = { lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, name: "Resolving…" };

      if (mode === "pickup") {
        setPickup(pseudo);
        placeMarker("pickup", lat, lng);
        reverseGeocode(lat, lng).then(loc => loc && setPickup(loc));
        clickModeRef.current = "destination";
        setActiveInput("destination");
      } else {
        setDestination(pseudo);
        placeMarker("destination", lat, lng);
        reverseGeocode(lat, lng).then(loc => loc && setDestination(loc));
        clickModeRef.current = "none";
        setActiveInput("none");
      }
    };
    map.on("click", handler);
    return () => map.off("click", handler);
  }, [mapReady, placeMarker]);

  // ── Select from search ─────────────────────────────────────────────────────
  const handlePickupSelect = (s) => {
    setPickup(s);
    if (s) {
      placeMarker("pickup", s.lat, s.lng);
      mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: 14, duration: 600 });
      clickModeRef.current = "destination";
      setActiveInput("destination");
    } else {
      if (markersRef.current.pickup) { markersRef.current.pickup.remove(); markersRef.current.pickup = null; }
      clearRoute();
    }
  };

  const handleDestinationSelect = (s) => {
    setDestination(s);
    if (s) {
      placeMarker("destination", s.lat, s.lng);
      clickModeRef.current = "none";
      setActiveInput("none");
    } else {
      if (markersRef.current.destination) { markersRef.current.destination.remove(); markersRef.current.destination = null; }
      clearRoute();
    }
  };

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    Object.values(markersRef.current).forEach((m) => m?.remove());
    markersRef.current = { pickup: null, destination: null };
    setPickup(null); setDestination(null);
    clearRoute();
    clickModeRef.current = "pickup";
    setActiveInput("pickup");
  };

  // ── Fetch demand when pickup is set ───────────────────────────────────────
  const fetchDemandRef = useRef(null);

  useEffect(() => {
    if (!pickup) {
      setDemandData(null);
      setCountdown(20);
      return;
    }

    const fetch_demand = () => {
      setDemandLoading(true);
      fetch(`${API_BASE}/demand?lat=${pickup.lat}&lng=${pickup.lng}&radius_km=3`)
        .then(r => r.json())
        .then(data => {
          setDemandData(data);
          setCountdown(20);
        })
        .catch(() => setDemandData(null))
        .finally(() => setDemandLoading(false));
    };

    fetchDemandRef.current = fetch_demand;

    // Initial fetch
    fetch_demand();

    // Ticker interval
    const ticker = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchDemandRef.current();
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [pickup?.lat, pickup?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Get price stub ─────────────────────────────────────────────────────────
  const handleGetPrice = async () => {
    if (!pickup || !destination) return;
    setPriceLoading(true);
    setPriceError(false);
    setPriceData(null);

    try {
      const now = new Date();
      const hour_of_day = now.getHours();
      const day_of_week = now.getDay();

      // ── Gather all signals already fetched by panels ──────────────────
      const drivers = demandData?.drivers ?? 10;
      const riders = demandData?.riders ?? 10;
      const demand_ratio = Math.min(riders / Math.max(drivers, 1), 2.0);

      // Snap weather to 4 allowed values: 1.0, 1.1, 1.3, 1.5
      const rawWeather = weatherData?.weather_multiplier ?? 1.0;
      const weatherSnap = [1.0, 1.1, 1.3, 1.5];
      const weather_multiplier = weatherSnap.reduce((a, b) =>
        Math.abs(b - rawWeather) < Math.abs(a - rawWeather) ? b : a
      );

      // Snap traffic to 4 allowed values: 1.0, 1.2, 1.4, 1.6
      const rawTraffic = trafficData?.traffic_multiplier ?? 1.0;
      const trafficSnap = [1.0, 1.2, 1.4, 1.6];
      const traffic_multiplier = trafficSnap.reduce((a, b) =>
        Math.abs(b - rawTraffic) < Math.abs(a - rawTraffic) ? b : a
      );

      const distance_km = trafficData?.distance_km ?? routeInfo?.distanceM / 1000 ?? 5.0;
      const eta_minutes = trafficData?.eta_minutes ?? routeInfo?.durationSec / 60 ?? 15.0;
      const is_shared = rideType === "shared" ? 1 : 0;

      const payload = {
        distance_km: parseFloat(distance_km.toFixed(2)),
        eta_minutes: parseFloat(eta_minutes.toFixed(1)),
        drivers,
        riders,
        demand_ratio: parseFloat(demand_ratio.toFixed(3)),
        weather_multiplier,
        traffic_multiplier,
        hour_of_day,
        day_of_week,
        is_shared,
      };

      const res = await fetch(`${API_BASE}/predict-price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPriceData(data);

    } catch {
      setPriceError(true);
    } finally {
      setPriceLoading(false);
    }
  };
  const readyToPrice = !!pickup && !!destination && !routeLoading;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Barlow+Condensed:wght@300;400;600;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg:         #07090f;
          --surface:    #0c1019;
          --surface2:   #111827;
          --surface3:   #1a2235;
          --border:     rgba(0,200,255,0.1);
          --border-hot: rgba(0,200,255,0.35);
          --amber:      #f5a623;
          --amber-dim:  rgba(245,166,35,0.15);
          --cyan:       #00c8ff;
          --cyan-dim:   rgba(0,200,255,0.08);
          --green:      #00e87a;
          --red:        #ff4060;
          --text:       #b8d0e8;
          --text-dim:   #3d5570;
          --text-mid:   #6a88a8;
          --mono:       'Space Mono', monospace;
          --display:    'Barlow Condensed', sans-serif;
          --radius:     4px;
        }
        html, body { height: 100%; overflow: hidden; background: var(--bg); }

        /* ── Layout ── */
        .aim-btn {
          position: absolute;
          right: 5px;
          top: 5px;
          z-index: 5;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface3);
          border: 1px solid var(--border);
          border-radius: 3px;
          color: var(--text-mid);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .aim-btn:hover {
          background: var(--surface2);
          border-color: var(--cyan);
          color: var(--cyan);
          box-shadow: 0 0 12px var(--cyan-dim);
          transform: translateY(-1px);
        }
        .aim-btn:active {
          transform: translateY(0);
        }
        .aim-btn svg {
          width: 14px;
          height: 14px;
          transition: transform 0.3s ease;
        }
        .aim-btn:hover svg {
          transform: rotate(90deg);
        }
        .app {
          display: grid;
          grid-template-columns: 400px 1fr;
          grid-template-rows: 52px 1fr;
          height: 100vh;
          font-family: var(--mono);
          color: var(--text);
          overflow: hidden; /* Prevent body scroll */
        }
        .map-explain-wrap {
          display: grid;
          grid-template-columns: 1fr;
          grid-template-rows: 100%;
          height: calc(100vh - 52px);
          overflow: hidden;
          transition: grid-template-columns 0.4s ease;
        }
        .map-explain-wrap.has-explain {
          grid-template-columns: 1fr 380px;
        }
        .explain-sidebar {
          background: var(--surface);
          border-left: 1px solid var(--border);
          overflow-y: scroll; /* Force scrollbar visibility */
          overflow-x: hidden;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 16px 0 24px;
          height: 100%; /* Fill the grid cell */
          box-sizing: border-box;
        }
        .explain-sidebar-title {
          font-size: 8px; letter-spacing: 0.28em; text-transform: uppercase;
          color: var(--cyan); padding: 0 16px 14px;
          display: flex; align-items: center; gap: 10px;
        }
        .explain-sidebar-title::after {
          content: ''; flex: 1; height: 1px; background: var(--border);
        }

        /* ── Header ── */
        .header {
          grid-column: 1 / -1;
          display: flex; align-items: center; gap: 16px;
          padding: 0 20px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          position: relative; z-index: 20;
        }
        .logo {
          font-family: var(--display); font-weight: 800; font-size: 18px;
          letter-spacing: 0.15em; text-transform: uppercase; color: var(--cyan);
        }
        .logo em { color: var(--amber); font-style: normal; }
        .badge {
          font-size: 8px; letter-spacing: 0.25em; text-transform: uppercase;
          color: var(--text-dim); border: 1px solid var(--border);
          padding: 2px 7px; border-radius: 2px;
        }
        .header-right { margin-left: auto; display: flex; align-items: center; gap: 16px; }
        .sys-status { display: flex; align-items: center; gap: 7px; font-size: 9px; letter-spacing: 0.12em; color: var(--text-dim); text-transform: uppercase; }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 6px var(--green); animation: blink 2.5s ease-in-out infinite; }
        @keyframes blink { 0%,100%{opacity:1} 55%{opacity:.25} }

        /* ── Panel ── */
        .panel {
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex; flex-direction: column;
          overflow-y: auto; overflow-x: hidden;
          scrollbar-width: thin; scrollbar-color: var(--border) transparent;
          position: relative; z-index: 10;
          height: calc(100vh - 52px);
          box-sizing: border-box;
        }

        .panel-block { padding: 18px 18px 0; }
        .panel-block:last-child { padding-bottom: 18px; }

        .block-label {
          font-size: 8px; letter-spacing: 0.28em; text-transform: uppercase;
          color: var(--cyan); margin-bottom: 12px;
          display: flex; align-items: center; gap: 10px;
        }
        .block-label::after { content:''; flex:1; height:1px; background: var(--border); }

        /* ── Search Input ── */
        .search-wrap { position: relative; margin-bottom: 10px; }
        .search-field {
          display: flex; align-items: center; gap: 10px;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 12px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .search-field.focused {
          border-color: var(--accent, var(--cyan));
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, var(--cyan)) 12%, transparent);
        }
        .search-field.has-value { border-color: color-mix(in srgb, var(--accent, var(--cyan)) 30%, var(--border)); }
        .search-field-icon { font-size: 15px; flex-shrink: 0; line-height: 1; }
        .search-input {
          flex: 1; background: none; border: none; outline: none;
          font-family: var(--mono); font-size: 11px; color: var(--text);
          min-width: 0;
        }
        .search-input::placeholder { color: var(--text-dim); }
        .search-spinner {
          width: 14px; height: 14px; flex-shrink: 0;
          border: 2px solid var(--border);
          border-top-color: var(--cyan);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .search-clear {
          background: none; border: none; color: var(--text-dim);
          font-size: 16px; cursor: pointer; line-height: 1; padding: 0;
          transition: color 0.1s; flex-shrink: 0;
        }
        .search-clear:hover { color: var(--red); }

        /* Dropdown */
        .suggestions-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: var(--surface2);
          border: 1px solid var(--border-hot);
          border-radius: var(--radius);
          overflow: hidden; z-index: 100;
          box-shadow: 0 12px 40px rgba(0,0,0,0.6);
          animation: dropIn 0.15s ease;
        }
        @keyframes dropIn { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform: translateY(0); } }
        .suggestion-item {
          display: flex; align-items: flex-start; gap: 10px;
          width: 100%; padding: 10px 12px;
          background: none; border: none; border-bottom: 1px solid var(--border);
          cursor: pointer; text-align: left; transition: background 0.1s;
        }
        .suggestion-item:last-child { border-bottom: none; }
        .suggestion-item:hover, .suggestion-item.active { background: var(--cyan-dim); }
        .suggestion-pin { font-size: 14px; margin-top: 1px; flex-shrink: 0; }
        .suggestion-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .suggestion-name { font-family: var(--display); font-weight: 600; font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .suggestion-addr { font-family: var(--mono); font-size: 9px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* ── Map hint ── */
        .map-hint {
          margin: 0 18px 14px;
          display: flex; align-items: center; gap: 8px;
          font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-dim);
        }
        .map-hint-line { flex: 1; height: 1px; background: var(--border); }
        .map-hint-txt { white-space: nowrap; }

        /* ── Ride Toggle ── */
        .ride-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .ride-btn {
          padding: 14px 10px;
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: var(--radius); color: var(--text-dim);
          font-family: var(--display); font-weight: 600; font-size: 14px;
          letter-spacing: 0.08em; text-transform: uppercase;
          cursor: pointer; transition: all 0.15s;
          display: flex; flex-direction: column; align-items: center; gap: 5px;
        }
        .ride-btn:hover { border-color: var(--border-hot); color: var(--text); }
        .ride-btn.active {
          background: var(--amber-dim); border-color: var(--amber);
          color: var(--amber); box-shadow: 0 0 20px rgba(245,166,35,0.08);
        }
        .ride-icon { font-size: 20px; line-height: 1; }
        .ride-sub  { font-size: 8px; letter-spacing: 0.1em; opacity: 0.6; font-family: var(--mono); }

        /* ── Route Info Card ── */
        .route-card {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px;
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
          position: relative; overflow: hidden;
        }
        .route-card::before {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
          background: linear-gradient(180deg, var(--amber), transparent);
        }
        .route-stat-label { font-size: 8px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 4px; }
        .route-stat-value { font-family: var(--display); font-weight: 800; font-size: 22px; color: var(--amber); letter-spacing: 0.05em; }
        .route-stat-unit  { font-size: 10px; color: var(--text-dim); margin-left: 3px; }
        .route-loading {
          display: flex; align-items: center; gap: 10px;
          font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--text-dim);
        }

        /* ── CTA ── */
        .cta-area { padding: 18px; margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
        .btn-price {
          width: 100%; padding: 15px;
          background: var(--amber); border: none; border-radius: var(--radius);
          font-family: var(--display); font-weight: 800; font-size: 15px;
          letter-spacing: 0.2em; text-transform: uppercase;
          color: #080a0f; cursor: pointer;
          transition: all 0.15s; position: relative; overflow: hidden;
        }
        .btn-price:disabled { background: var(--surface3); color: var(--text-dim); cursor: not-allowed; border: 1px solid var(--border); }
        .btn-price:not(:disabled):hover { background: #fdb94a; box-shadow: 0 0 36px rgba(245,166,35,0.35); transform: translateY(-1px); }
        .btn-price:not(:disabled):active { transform: translateY(0); }
        .btn-price.shimmer::after { content:''; position:absolute; inset:0; background: linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent); animation: sh 1s linear infinite; }
        @keyframes sh { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        .btn-reset {
          width: 100%; padding: 9px;
          background: transparent; border: 1px solid var(--border);
          border-radius: var(--radius);
          font-family: var(--mono); font-size: 9px;
          letter-spacing: 0.15em; text-transform: uppercase;
          color: var(--text-dim); cursor: pointer; transition: all 0.15s;
        }
        .btn-reset:hover { border-color: var(--red); color: var(--red); }

        /* ── Map Area ── */
        .map-wrap { position: relative; overflow: hidden; }
        .map-container { width: 100%; height: 100%; }

        /* HUD chips */
        .map-hud {
          position: absolute; top: 14px; right: 14px; z-index: 5;
          display: flex; flex-direction: column; gap: 6px; pointer-events: none;
        }
        .hud-chip {
          background: rgba(7,9,15,0.88); backdrop-filter: blur(10px);
          border: 1px solid var(--border); border-radius: var(--radius);
          padding: 7px 11px; font-size: 8px; letter-spacing: 0.15em;
          text-transform: uppercase; color: var(--text-dim);
        }
        .hud-chip b { color: var(--cyan); font-weight: 400; }

        /* Click hint overlay */
        .click-hint {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          z-index: 5; pointer-events: none;
          background: rgba(7,9,15,0.88); backdrop-filter: blur(10px);
          border: 1px solid var(--border-hot);
          border-radius: 20px; padding: 8px 18px;
          font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--cyan); white-space: nowrap;
          animation: fadeUp 0.3s ease;
        }
        @keyframes fadeUp { from{opacity:0;transform:translate(-50%,8px)} to{opacity:1;transform:translate(-50%,0)} }

        /* Map placeholder */
        .map-placeholder {
          position: absolute; inset: 0; z-index: 2;
          background:
            linear-gradient(rgba(0,200,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,200,255,0.025) 1px, transparent 1px),
            var(--surface2);
          background-size: 44px 44px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 12px; color: var(--text-dim); font-size: 10px;
          letter-spacing: 0.2em; text-transform: uppercase;
        }
        .placeholder-icon { font-size: 36px; opacity: 0.25; }

        /* ── Custom Markers ── */
        .map-marker { display: flex; flex-direction: column; align-items: center; }
        .marker-body {
          width: 30px; height: 30px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--display); font-weight: 800; font-size: 13px;
          animation: markerPop 0.35s cubic-bezier(.34,1.56,.64,1) forwards;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .marker-tip {
          width: 0; height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          margin-top: -1px;
        }
        .map-marker--pickup      .marker-body { background: var(--green);  color: #06120d; box-shadow: 0 0 24px rgba(0,232,122,0.5); }
        .map-marker--pickup      .marker-tip  { border-top: 8px solid var(--green); }
        .map-marker--destination .marker-body { background: var(--red);    color: #fff;    box-shadow: 0 0 24px rgba(255,64,96,0.5); }
        .map-marker--destination .marker-tip  { border-top: 8px solid var(--red); }
        @keyframes markerPop { from{transform:scale(0) translateY(-10px);opacity:0} to{transform:scale(1) translateY(0);opacity:1} }
      `}</style>

      <div className="app">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="header">
          <div className="logo">Dynamic<em>Price</em></div>
          <div className="badge">Dispatch Engine · Ride Sharing</div>
          <div className="header-right">
            <div className="sys-status">
              <div className="dot" />
              {mapReady ? "Map Ready" : sdkLoaded ? "Initializing…" : "Loading SDK…"}
            </div>
          </div>
        </header>

        {/* ── Side Panel ─────────────────────────────────────────────────── */}
        <aside className="panel">
          {/* Unified Surge Analysis Card (Feature 4 focus) */}
          <div style={{ margin: "18px 18px 0" }}>
            <SurgeCard demandData={demandData} loading={demandLoading} countdown={countdown} />

          </div>

          <div className="panel-block" style={{ marginTop: 12, paddingBottom: 0 }}>
            <div className="block-label">Driver Intelligence</div>
          </div>
          <div style={{ marginTop: 8 }}>
            <DriverPanel demandData={demandData} loading={demandLoading} />
          </div>

          <div style={{ marginTop: 12 }}>
            <RiderPanel demandData={demandData} loading={demandLoading} />
          </div>
          <div>
            {/* Feature 5 — Weather */}
            <WeatherCard pickup={pickup} onData={setWeatherData} />
          </div>

          <div>
            {/* Feature 5 — Weather */}
            <TrafficCard pickup={pickup} destination={destination} onData={setTrafficData} />
          </div>
          <div>
            {/* Feature 7 — Price */}
            {(priceData || priceLoading || priceError) && (
              <PriceCard
                priceData={priceData}
                loading={priceLoading}
                error={priceError}
              />
            )}
          </div>
          {/* Search inputs */}
          <div className="panel-block" style={{ paddingTop: 18 }}>
            <div className="block-label">Route</div>

            <div style={{ position: "relative" }}>
              <SearchInput
                placeholder="Pickup location…"
                value={pickup}
                onChange={() => { }}
                onSelect={handlePickupSelect}
                color="var(--green)"
                icon="🟢"
              />

              <button
                className="aim-btn"
                onClick={handleUseCurrentLocation}
                title="Use current location"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="22" y1="12" x2="18" y2="12" />
                  <line x1="6" y1="12" x2="2" y2="12" />
                  <line x1="12" y1="6" x2="12" y2="2" />
                  <line x1="12" y1="22" x2="12" y2="18" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <SearchInput
              placeholder="Destination…"
              value={destination}
              onChange={() => { }}
              onSelect={handleDestinationSelect}
              color="var(--red)"
              icon="🔴"
            />
          </div>

          {/* Map click hint */}
          <div className="map-hint">
            <div className="map-hint-line" />
            <div className="map-hint-txt">or click map to place pins</div>
            <div className="map-hint-line" />
          </div>

          {/* Route info */}
          {(routeInfo || routeLoading) && (
            <div className="panel-block">
              <div className="block-label">Route Info</div>
              {routeLoading ? (
                <div className="route-card">
                  <div className="route-loading">
                    <span className="search-spinner" />
                    Calculating route…
                  </div>
                </div>
              ) : routeInfo && (
                <div className="route-card">
                  <div>
                    <div className="route-stat-label">Distance</div>
                    <div className="route-stat-value">
                      {routeInfo.distanceM >= 1000
                        ? (routeInfo.distanceM / 1000).toFixed(1)
                        : Math.round(routeInfo.distanceM)}
                      <span className="route-stat-unit">
                        {routeInfo.distanceM >= 1000 ? "km" : "m"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="route-stat-label">ETA</div>
                    <div className="route-stat-value">
                      {routeInfo.durationSec >= 3600
                        ? `${Math.floor(routeInfo.durationSec / 3600)}h ${Math.floor((routeInfo.durationSec % 3600) / 60)}`
                        : Math.floor(routeInfo.durationSec / 60)}
                      <span className="route-stat-unit">
                        {routeInfo.durationSec >= 3600 ? "m" : "min"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ride type */}
          <div className="panel-block" style={{ paddingTop: 16 }}>
            <div className="block-label">Ride Type</div>
            <div className="ride-toggle">
              <button className={`ride-btn ${rideType === "single" ? "active" : ""}`} onClick={() => setRideType("single")}>
                <span className="ride-icon">🚗</span>
                Single
                <span className="ride-sub">Private</span>
              </button>
              <button className={`ride-btn ${rideType === "shared" ? "active" : ""}`} onClick={() => setRideType("shared")}>
                <span className="ride-icon">🚌</span>
                Shared
                <span className="ride-sub">Split fare</span>
              </button>
            </div>
          </div>

          {/* CTA */}
          <div className="cta-area">
            <button
              className={`btn-price ${priceLoading ? "shimmer" : ""}`}
              disabled={!readyToPrice || priceLoading}
              onClick={handleGetPrice}
            >
              {priceLoading ? "Calculating…" : readyToPrice ? "Get Price →" : "Set Route First"}
            </button>
            <button className="btn-reset" onClick={handleReset}>↺ Reset</button>
          </div>
        </aside>

        {/* ── Map + Explain Sidebar ───────────────────────────────────────── */}
        <div className={`map-explain-wrap ${priceData ? "has-explain" : ""}`}>

          {/* Map */}
          <div className="map-wrap">
            <div ref={mapContainerRef} className="map-container" />

            {!sdkLoaded && (
              <div className="map-placeholder">
                <div className="placeholder-icon">🗺️</div>
                <span>Loading TomTom SDK…</span>
              </div>
            )}

            <div className="map-hud">
              <div className="hud-chip">Mode: <b>{rideType.toUpperCase()}</b></div>
              {pickup && <div className="hud-chip">A: <b>{pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)}</b></div>}
              {destination && <div className="hud-chip">B: <b>{destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}</b></div>}
              {routeInfo && <div className="hud-chip">🛣 <b>{fmtDist(routeInfo.distanceM)}</b> · <b>{fmtTime(routeInfo.durationSec)}</b></div>}
            </div>

            {activeInput !== "none" && mapReady && (
              <div className="click-hint">
                {activeInput === "pickup" ? "📍 Click to set pickup" : "🎯 Click to set destination"}
              </div>
            )}
          </div>

          {/* Explain Sidebar — slides in when price is available */}
          {priceData && (
            <div className="explain-sidebar">
              <div className="explain-sidebar-title">AI Price Analysis</div>

              {/* Price summary chip at top */}
              <div style={{
                margin: "0 16px 14px",
                padding: "14px",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
              }}>
                <div style={{
                  fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "var(--text-dim)", marginBottom: 6
                }}>ML Predicted Price</div>
                <div style={{
                  fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800,
                  fontSize: 52, lineHeight: 1, color: "var(--amber)"
                }}>
                  ₹{priceData.predicted_price}
                </div>
                {priceData.confidence_interval && (
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 6 }}>
                    Range: ₹{priceData.confidence_interval.low} – ₹{priceData.confidence_interval.high}
                  </div>
                )}
                <div style={{
                  fontSize: 9, color: "var(--text-dim)", marginTop: 4,
                  letterSpacing: "0.1em", textTransform: "uppercase"
                }}>
                  {rideType === "shared" ? "🚌 Shared ride" : "🚗 Private ride"}
                </div>
              </div>

              {/* Multiplier pills */}
              <div style={{ margin: "0 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["Demand", priceData.inputs_used?.demand_ratio?.toFixed(2), "#f5a623"],
                  ["Weather", priceData.inputs_used?.weather_multiplier, "#00c8ff"],
                  ["Traffic", priceData.inputs_used?.traffic_multiplier, "#ff8c00"],
                ].map(([label, val, color]) => (
                  <div key={label} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: "var(--surface2)",
                    border: `1px solid ${color}33`, borderRadius: 4,
                  }}>
                    <span style={{
                      fontSize: 9, letterSpacing: "0.15em",
                      textTransform: "uppercase", color: "var(--text-dim)"
                    }}>{label}</span>
                    <span style={{
                      fontFamily: "'Barlow Condensed',sans-serif",
                      fontWeight: 700, fontSize: 16, color
                    }}>
                      {val ?? "—"}×
                    </span>
                  </div>
                ))}
              </div>

              {/* ExplainCard */}
              <div style={{ margin: "0 16px" }}>
                <ExplainCard
                  priceData={priceData}
                  demandData={demandData}
                  weatherData={weatherData}
                  trafficData={trafficData}
                  rideType={rideType}
                />
              </div>

              {/* Feature 10 — Driver tips (Added back to sidebar for convenience) */}
              <div style={{ margin: "14px 16px 0" }}>
                <DriverTipsCard pickup={pickup} />
              </div>
            </div>
          )}
        </div>
      </div >

    </>
  );
}