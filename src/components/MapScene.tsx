import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  searchPlaces,
  type Place,
  type PlaceCategory,
} from "@/lib/bodegas.functions";
import { verifyPlacePhoto } from "@/lib/vision.functions";
import PlacesStory from "@/components/PlacesStory";
import { fetchWeather, type Weather, type WeatherMood } from "@/lib/weather.functions";

declare global {
  interface Window {
    google: any;
    __initRatMap?: () => void;
  }
}

const NYC = { lat: 40.7128, lng: -74.006 };
const TERRITORY_RADIUS_M = 80;
const STALE_FULL_MS = 90_000; // 90s to go fully stale (gentle, demo-friendly)
const STALE_MIN_OPACITY = 0.08;
const STALE_MAX_OPACITY = 0.28;
const CITY_PCT_PER_CLAIM = 1.4;
const CITY_PCT_CAP = 87;
const PLAYER_NAME = "You (👃)";

function loadMapsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.google?.maps) return resolve();

    const existing = document.getElementById("gmaps-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("maps load failed")));
      return;
    }

    window.__initRatMap = () => resolve();
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    const s = document.createElement("script");
    s.id = "gmaps-sdk";
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initRatMap&channel=${channel}`;
    s.onerror = () => reject(new Error("maps load failed"));
    document.head.appendChild(s);
  });
}

// "Neon Sewer" — near-black base, dim purple-gray streets, no Google POIs.
const RAT_MAP_STYLE: any[] = [
  // Base
  { elementType: "geometry", stylers: [{ color: "#08070f" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#cfc6e6" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#08070f" }, { weight: 3 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  // Kill all Google POIs (museums, churches, hotels, restaurants, etc.)
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", stylers: [{ visibility: "off" }] },
  { featureType: "poi.place_of_worship", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "poi.sports_complex", stylers: [{ visibility: "off" }] },
  { featureType: "poi.government", stylers: [{ visibility: "off" }] },
  // Keep parks but darken them so they don't overpower
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#0e1a12" }],
  },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  // Transit off
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  // Roads — dark desaturated gray-purple
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a1726" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0c0a14" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#221e30" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2b2440" }] },
  // Road labels — bright enough to read at every zoom, dark halo for contrast
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d8d0ec" }, { lightness: 10 }],
  },
  {
    featureType: "road",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#08070f" }, { weight: 4 }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f2ecff" }],
  },
  {
    featureType: "road.arterial",
    elementType: "labels.text.fill",
    stylers: [{ color: "#e4dcf5" }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [{ color: "#bdb3d6" }],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#08070f" }, { weight: 3 }],
  },
  // Water — even darker than the base
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#020108" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#8a82a8" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#020108" }, { weight: 3 }] },
  // Admin & landscape
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1a1726" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#e8e0ff" }],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0c0a16" }] },
];

// "Daylight Scurry" — clean light theme, still no Google POI clutter.
const LIGHT_MAP_STYLE: any[] = [
  { elementType: "geometry", stylers: [{ color: "#f5f1e8" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4a4458" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 3 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#cfe8c0" }] },
  { featureType: "poi.park", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d8d2c4" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#fdf9ef" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ffe9b8" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#5c5470" }] },
  { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 4 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#b8d9ee" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4e6f8a" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 3 }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#e2dccb" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#3c354b" }] },
  { featureType: "administrative.neighborhood", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#efe9da" }] },
];

// What each category actually sniffs from Google Maps (hover explainer copy)
const CATEGORY_TIP: Record<"bodega" | "cheese" | "hideout", { title: string; body: string }> = {
  bodega: {
    title: "🏪 Bodega",
    body: "Sniffs real corner stores & convenience shops near your rat from Google Maps. A rat's favorite hunting ground.",
  },
  cheese: {
    title: "🧀 Cheese",
    body: "Sniffs real restaurants, bakeries & takeout spots from Google Maps. Where the good crumbs live.",
  },
  hideout: {
    title: "🕳️ Hideout",
    body: "Sniffs real parks, viewpoints & quiet spots from Google Maps. Safe corners to lay low, little one.",
  },
};

// Category signature colors (used by pins, halos, and claimed zones)
const CATEGORY_COLOR: Record<"bodega" | "cheese" | "hideout", string> = {
  bodega: "#FF3D9A",
  cheese: "#FFC233",
  hideout: "#2DD4BF",
};

type SkySpec = {
  gradient: string;
  opacity: number;
  particles?: "rain" | "snow" | null;
};
const SKY_BY_MOOD: Record<WeatherMood, SkySpec> = {
  "clear-day": {
    gradient: "linear-gradient(180deg, #ffd27a 0%, #ff7ac6 45%, transparent 70%)",
    opacity: 0.18,
  },
  "clear-night": {
    gradient: "linear-gradient(180deg, #1a1f5c 0%, #4b1d8a 50%, transparent 75%)",
    opacity: 0.35,
  },
  cloudy: {
    gradient: "linear-gradient(180deg, #6b7280 0%, #3a3550 60%, transparent 80%)",
    opacity: 0.3,
  },
  rain: {
    gradient: "linear-gradient(180deg, #4a6079 0%, #1f2940 60%, transparent 80%)",
    opacity: 0.45,
    particles: "rain",
  },
  storm: {
    gradient: "linear-gradient(180deg, #2a2545 0%, #0a0820 60%, transparent 80%)",
    opacity: 0.55,
    particles: "rain",
  },
  snow: {
    gradient: "linear-gradient(180deg, #cfdfff 0%, #6b7faa 60%, transparent 80%)",
    opacity: 0.35,
    particles: "snow",
  },
  fog: {
    gradient: "linear-gradient(180deg, #b6b1c8 0%, #6e6884 70%, transparent 90%)",
    opacity: 0.4,
  },
  unknown: { gradient: "linear-gradient(180deg, transparent, transparent)", opacity: 0 },
};

function weatherFlavor(w: Weather): string {
  const t = w.tempC != null ? `${Math.round(w.tempC)}°C` : "";
  const flair: Record<WeatherMood, string> = {
    "clear-day": "Sun on the fur. Crumbs sparkle.",
    "clear-night": "Stars out. Cats sleepy.",
    cloudy: "Grey skies. Good rat weather.",
    rain: "Puddles glow. Mind the gutters.",
    storm: "Thunder rumbles. Hide in the alleys.",
    snow: "Snow on the sidewalk. Tiny paw prints.",
    fog: "Mist swallows the block. Sniff carefully.",
    unknown: "The sky keeps secrets.",
  };
  return [flair[w.mood], t].filter(Boolean).join(" · ");
}

function RainOverlay() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {Array.from({ length: 60 }).map((_, i) => (
        <span
          key={i}
          className="absolute block h-6 w-px bg-gradient-to-b from-transparent via-sky-200/60 to-sky-200/10"
          style={{
            left: `${(i * 1.7) % 100}%`,
            top: `-${Math.random() * 30}%`,
            animation: `rat-rain ${0.6 + Math.random() * 0.6}s linear ${Math.random() * 1.2}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes rat-rain { to { transform: translateY(120vh); } }`}</style>
    </div>
  );
}

function SnowOverlay() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {Array.from({ length: 50 }).map((_, i) => (
        <span
          key={i}
          className="absolute block rounded-full bg-white/80"
          style={{
            width: 3 + Math.random() * 4,
            height: 3 + Math.random() * 4,
            left: `${Math.random() * 100}%`,
            top: `-${Math.random() * 30}%`,
            animation: `rat-snow ${4 + Math.random() * 5}s linear ${Math.random() * 3}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes rat-snow { to { transform: translate(20px, 120vh); } }`}</style>
    </div>
  );
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function formatDistance(m: number) {
  if (m < 950) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

type Claim = {
  placeId: string;
  photo: string;
  category: PlaceCategory;
  claimedAt: number;
  refreshedAt: number;
  firstFang: boolean;
  lat: number;
  lng: number;
  name: string;
  crumbs: number;
};

const CONTROLLED_RADIUS_M = 180;

type LeaderRow = {
  id: string;
  name: string;
  crumbs: number;
  isYou?: boolean;
  lat?: number;
  lng?: number;
  lastPlace?: string;
  lastCategory?: "bodega" | "cheese" | "hideout";
  lastAt?: number; // ms epoch
};

const NOW0 = () => Date.now();
const FAKE_RATS: LeaderRow[] = [
  { id: "r1", name: "Pizza Rat 🍕", crumbs: 142, lat: 40.7138, lng: -74.0035, lastPlace: "Joe's Pizza", lastCategory: "cheese", lastAt: NOW0() - 3 * 60_000 },
  { id: "r2", name: "Remy 👨‍🍳", crumbs: 118, lat: 40.7115, lng: -74.0078, lastPlace: "Bleecker Bistro", lastCategory: "cheese", lastAt: NOW0() - 7 * 60_000 },
  { id: "r3", name: "Splinter 🥋", crumbs: 96, lat: 40.7155, lng: -74.0091, lastPlace: "Sewer Grate #14", lastCategory: "hideout", lastAt: NOW0() - 12 * 60_000 },
  { id: "r4", name: "Master Cheef 🧀", crumbs: 81, lat: 40.7092, lng: -74.0049, lastPlace: "Murray's Cheese", lastCategory: "cheese", lastAt: NOW0() - 22 * 60_000 },
  { id: "r5", name: "Scabbers 🪄", crumbs: 64, lat: 40.7167, lng: -74.0021, lastPlace: "Corner Bodega", lastCategory: "bodega", lastAt: NOW0() - 31 * 60_000 },
  { id: "r6", name: "Gnaw-some 🦷", crumbs: 47, lat: 40.7104, lng: -74.0103, lastPlace: "Washington Sq Bushes", lastCategory: "hideout", lastAt: NOW0() - 48 * 60_000 },
  { id: "r7", name: "Brie Larson 🎬", crumbs: 33, lat: 40.7141, lng: -74.0011, lastPlace: "Late Night Deli", lastCategory: "bodega", lastAt: NOW0() - 64 * 60_000 },
  { id: "r8", name: "Templeton 🐽", crumbs: 18, lat: 40.7081, lng: -74.0064, lastPlace: "Dumpster Lane", lastCategory: "hideout", lastAt: NOW0() - 92 * 60_000 },
];

function timeAgo(ms: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function MapScene({
  entering,
  onBack,
}: {
  entering: boolean;
  onBack: () => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const placeMarkersRef = useRef<Record<string, any>>({});
  const circlesRef = useRef<Record<string, any>>({});
  const controlledCirclesRef = useRef<Record<string, any>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPlaceRef = useRef<Place | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Sniffing out the city…");
  const [crumbs, setCrumbs] = useState(0);
  const [places, setPlaces] = useState<Place[]>([]);
  const [category, setCategory] = useState<PlaceCategory>("bodega");
  const [selected, setSelected] = useState<Place | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [ratPos, setRatPos] = useState<{ lat: number; lng: number }>(NYC);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<"denied" | "unavailable" | null>(null);
  const [geoAttempt, setGeoAttempt] = useState(0);
  const [trailOpen, setTrailOpen] = useState(false);
  const [hidePins, setHidePins] = useState(false);
  const [showControlled, setShowControlled] = useState(true);
  const [zoneHover, setZoneHover] = useState<
    | { placeId: string; x: number; y: number }
    | null
  >(null);
  const [sortBy, setSortBy] = useState<"distance" | "rating" | "name">("distance");
  const [storyOpen, setStoryOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const userMarkerRef = useRef<any>(null);
  const ratMarkersRef = useRef<Record<string, any>>({});

  // Game state
  const [claims, setClaims] = useState<Record<string, Claim>>({});
  const [claiming, setClaiming] = useState(false);
  const [claimNote, setClaimNote] = useState<
    | {
        kind: "mismatch" | "read" | "timeout" | "network";
        title: string;
        hint: string;
        reason?: string;
      }
    | null
  >(null);
  const [cityPct, setCityPct] = useState(0);
  const [celebration, setCelebration] = useState<{ emoji: string; msg: string } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>(FAKE_RATS);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sessionRefreshedRef = useRef<Set<string>>(new Set());

  const verifyPhotoFn = useServerFn(verifyPlacePhoto);
  const fetchPlacesFn = useServerFn(searchPlaces);
  const fetchWeatherFn = useServerFn(fetchWeather);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [lightMode, setLightMode] = useState(false);
  const [catTip, setCatTip] = useState<PlaceCategory | null>(null);
  const catTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCatTip = (cat: PlaceCategory) => {
    if (catTipTimer.current) clearTimeout(catTipTimer.current);
    setCatTip(cat);
    catTipTimer.current = setTimeout(() => setCatTip(null), 6000);
  };
  const hideCatTip = () => {
    if (catTipTimer.current) clearTimeout(catTipTimer.current);
    setCatTip(null);
  };
  const lastWeatherFetchRef = useRef<{ lat: number; lng: number; t: number } | null>(null);

  useEffect(() => {
    const last = lastWeatherFetchRef.current;
    const now = Date.now();
    const moved =
      !last ||
      Math.hypot(last.lat - ratPos.lat, last.lng - ratPos.lng) > 0.01 || // ~1km
      now - last.t > 10 * 60 * 1000;
    if (!moved) return;
    lastWeatherFetchRef.current = { ...ratPos, t: now };
    fetchWeatherFn({ data: ratPos })
      .then(setWeather)
      .catch(() => {});
  }, [ratPos, fetchWeatherFn]);

  const focusPlace = useCallback((p: Place) => {
    setSelected(p);
    setTrailOpen(false);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: p.lat, lng: p.lng });
      const z = mapInstanceRef.current.getZoom?.() ?? 15;
      if (z < 16) mapInstanceRef.current.setZoom(16);
    }
  }, []);

  const CATEGORY_META: Record<
    PlaceCategory,
    { emoji: string; noun: string; sniffing: string; quips: string[] }
  > = {
    bodega: {
      emoji: "🏪",
      noun: "bodegas",
      sniffing: "Sniffing out bodegas…",
      quips: [
        "Smells like crumbs. Worth a scurry.",
        "Good for cheese and cigs.",
        "Bright lights, lazy humans. Easy pickings.",
        "Cardboard heaven behind this one.",
      ],
    },
    cheese: {
      emoji: "🧀",
      noun: "cheese spots",
      sniffing: "Sniffing for cheese…",
      quips: [
        "Dumpsters out back smell like a king.",
        "Late-night scraps. Worth the scurry.",
        "Hot kitchen, hot crumbs.",
        "Big plates, small spills. Easy feast.",
      ],
    },
    hideout: {
      emoji: "🕳️",
      noun: "hideouts",
      sniffing: "Looking for a quiet corner…",
      quips: [
        "Quiet. Soft grass. A rat could nap.",
        "Pretty sunset, even prettier shadows.",
        "Tourists drop snacks here. Bonus.",
        "Safe spot. Few cats. Many bushes.",
      ],
    },
  };

  const sniffPlaces = useCallback(
    async (cat: PlaceCategory, pos?: { lat: number; lng: number }) => {
      const here =
        pos ??
        (markerRef.current
          ? {
              lat: markerRef.current.getPosition().lat(),
              lng: markerRef.current.getPosition().lng(),
            }
          : NYC);
      const meta = CATEGORY_META[cat];
      setCategory(cat);
      setSelected(null);
      setLoadingPlaces(true);
      setStatus(meta.sniffing);
      try {
        const { places } = await fetchPlacesFn({
          data: { ...here, radius: 700, category: cat },
        });
        setPlaces(places);
        setStatus(
          places.length
            ? `Found ${places.length} ${meta.noun} nearby. Pick one, little one.`
            : `No ${meta.noun} in sniffing range. Move the rat.`,
        );
        
      } catch (e: any) {
        setStatus(e?.message ?? `Couldn't sniff out ${meta.noun}.`);
      } finally {
        setLoadingPlaces(false);
      }
    },
    [fetchPlacesFn],
  );

  // Swap dark/light map skin on demand
  useEffect(() => {
    mapInstanceRef.current?.setOptions({
      styles: lightMode ? LIGHT_MAP_STYLE : RAT_MAP_STYLE,
      backgroundColor: lightMode ? "#f5f1e8" : "#08070f",
    });
  }, [lightMode]);

  // Map init
  useEffect(() => {
    let cancelled = false;
    loadMapsScript()
      .then(() => {
        if (cancelled || !mapRef.current || !window.google?.maps) return;
        const map = new window.google.maps.Map(mapRef.current, {
          center: NYC,
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: RAT_MAP_STYLE,
          backgroundColor: "#08070f",
        });
        mapInstanceRef.current = map;

        // Player rat: pulsing white halo (SVG SMIL) + rat emoji on top.
        const svg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="96" height="104" viewBox="0 0 96 104">
            <defs>
              <radialGradient id="ratHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>
                <stop offset="55%" stop-color="#ffffff" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <ellipse cx="48" cy="92" rx="16" ry="4" fill="rgba(0,0,0,0.55)"/>
            <circle cx="48" cy="56" r="30" fill="url(#ratHalo)">
              <animate attributeName="r" values="26;34;26" dur="2.2s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.9;0.45;0.9" dur="2.2s" repeatCount="indefinite"/>
            </circle>
            <circle cx="48" cy="56" r="18" fill="#ffffff" fill-opacity="0.18" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.5"/>
            <text x="48" y="70" text-anchor="middle" font-size="40">🐀</text>
          </svg>`;
        const icon = {
          url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
          scaledSize: new window.google.maps.Size(96, 104),
          anchor: new window.google.maps.Point(48, 86),
        };

        markerRef.current = new window.google.maps.Marker({
          position: NYC,
          map,
          draggable: true,
          icon,
          title: "You — little colony scout",
          cursor: "grab",
          zIndex: 9999,
        });

        markerRef.current.addListener("dragstart", () =>
          setStatus("Scurrying through the tunnels…"),
        );
        markerRef.current.addListener("dragend", () => {
          const p = markerRef.current.getPosition();
          const next = { lat: p.lat(), lng: p.lng() };
          setRatPos(next);
          sniffPlaces(category, next);
        });

        sniffPlaces("bodega", NYC);
      })
      .catch((e) => setError(e.message ?? "Could not load map"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geo watch
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("unavailable");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoError(null);
      },
      (err) => {
        setGeoError(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [geoAttempt]);

  const retryGeo = () => {
    setGeoError(null);
    setGeoAttempt((n) => n + 1);
  };

  // User marker
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps || !userPos) return;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="12" fill="#5ab0ff" fill-opacity="0.25"/>
        <circle cx="14" cy="14" r="6" fill="#3b82f6" stroke="white" stroke-width="2.5"/>
      </svg>`;
    const icon = {
      url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
      scaledSize: new window.google.maps.Size(28, 28),
      anchor: new window.google.maps.Point(14, 14),
    };
    if (!userMarkerRef.current) {
      userMarkerRef.current = new window.google.maps.Marker({
        position: userPos,
        map: mapInstanceRef.current,
        icon,
        title: "You (the human)",
        zIndex: 9998,
      });
    } else {
      userMarkerRef.current.setPosition(userPos);
    }
  }, [userPos]);

  // Fake scout rats — show all mocked rats as avatars on the map
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;
    Object.values(ratMarkersRef.current).forEach((m: any) => m.setMap(null));
    ratMarkersRef.current = {};
    leaderboard.forEach((r) => {
      if (r.lat == null || r.lng == null) return;
      const emoji = r.name.match(/\p{Emoji}/u)?.[0] ?? "🐀";
      const catColor = r.lastCategory ? CATEGORY_COLOR[r.lastCategory] : "#a78bfa";
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52">
          <defs>
            <filter id="g" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2"/>
            </filter>
          </defs>
          <ellipse cx="22" cy="46" rx="9" ry="3" fill="black" opacity="0.35"/>
          <circle cx="22" cy="20" r="17" fill="${catColor}" opacity="0.35" filter="url(#g)"/>
          <circle cx="22" cy="20" r="15" fill="#0f0f1a" stroke="${catColor}" stroke-width="2.5"/>
          <text x="22" y="27" text-anchor="middle" font-size="18" font-family="system-ui,Apple Color Emoji,Segoe UI Emoji">${emoji}</text>
        </svg>`;
      const icon = {
        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
        scaledSize: new window.google.maps.Size(44, 52),
        anchor: new window.google.maps.Point(22, 46),
      };
      const m = new window.google.maps.Marker({
        position: { lat: r.lat, lng: r.lng },
        map: mapInstanceRef.current,
        icon,
        title: `${r.name} · ${r.lastPlace ?? "off-grid"}`,
        zIndex: 5000,
      });
      m.addListener("click", () => {
        mapInstanceRef.current?.panTo({ lat: r.lat!, lng: r.lng! });
        setLeaderOpen(true);
      });
      ratMarkersRef.current[r.id] = m;
    });
    return () => {
      Object.values(ratMarkersRef.current).forEach((m: any) => m.setMap(null));
      ratMarkersRef.current = {};
    };
  }, [leaderboard]);

  // Place markers — glowing neon pins, one signature color per category.
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;
    Object.values(placeMarkersRef.current).forEach((m: any) => m.setMap(null));
    placeMarkersRef.current = {};

    if (hidePins) return;

    const baseEmoji = CATEGORY_META[category].emoji;
    const color = CATEGORY_COLOR[category];
    const isHideout = category === "hideout";
    const isClaimedRing = "#FFFFFF";

    places.forEach((b: Place) => {
      const claimed = !!claims[b.id];
      const ringStroke = claimed ? isClaimedRing : color;
      const ringOpacity = claimed ? 1 : 0.95;

      // Custom hideout pin: teal ring/disc with a dark center (a rat-hole).
      const body = isHideout
        ? `
          <circle cx="28" cy="28" r="13" fill="${color}" fill-opacity="0.95"/>
          <circle cx="28" cy="28" r="7.5" fill="#06121a"/>
          <text x="28" y="33" text-anchor="middle" font-size="11" fill="${color}" font-weight="700">🕳</text>
        `
        : `
          <circle cx="28" cy="28" r="14" fill="${color}" fill-opacity="0.98" stroke="${ringStroke}" stroke-opacity="${ringOpacity}" stroke-width="2"/>
          <text x="28" y="34" text-anchor="middle" font-size="18">${baseEmoji}</text>
        `;

      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="56" height="64" viewBox="0 0 56 64">
          <defs>
            <radialGradient id="g${b.id.replace(/[^a-zA-Z0-9]/g, "")}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.85"/>
              <stop offset="55%" stop-color="${color}" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <ellipse cx="28" cy="58" rx="11" ry="3" fill="rgba(0,0,0,0.55)"/>
          <circle cx="28" cy="28" r="26" fill="url(#g${b.id.replace(/[^a-zA-Z0-9]/g, "")})"/>
          ${claimed ? `<circle cx="28" cy="28" r="20" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="1.5" stroke-dasharray="3 3"/>` : ""}
          ${body}
        </svg>`;
      const icon = {
        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
        scaledSize: new window.google.maps.Size(56, 64),
        anchor: new window.google.maps.Point(28, 56),
      };
      const m = new window.google.maps.Marker({
        position: { lat: b.lat, lng: b.lng },
        map: mapInstanceRef.current,
        icon,
        title: b.name,
        zIndex: claimed ? 500 : 100,
      });
      m.addListener("click", () => setSelected(b));
      placeMarkersRef.current[b.id] = m;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, category, hidePins, claims]);


  // Territory circles (opacity reflects staleness, refreshed by `now` tick)
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;
    const active = new Set(Object.keys(claims));

    // remove circles for cleared claims
    Object.entries(circlesRef.current).forEach(([id, c]) => {
      if (!active.has(id)) {
        c.setMap(null);
        delete circlesRef.current[id];
      }
    });

    Object.values(claims).forEach((cl) => {
      const elapsed = Math.max(0, now - cl.refreshedAt);
      const t = Math.min(1, elapsed / STALE_FULL_MS);
      const op = STALE_MAX_OPACITY - (STALE_MAX_OPACITY - STALE_MIN_OPACITY) * t;
      const pos = { lat: cl.lat, lng: cl.lng };
      const zoneColor = CATEGORY_COLOR[cl.category];
      const existing = circlesRef.current[cl.placeId];
      if (existing) {
        existing.setOptions({
          fillColor: zoneColor,
          fillOpacity: op,
          strokeColor: zoneColor,
          strokeOpacity: Math.min(0.7, op + 0.2),
          center: pos,
        });
      } else {
        circlesRef.current[cl.placeId] = new window.google.maps.Circle({
          map: mapInstanceRef.current,
          center: pos,
          radius: TERRITORY_RADIUS_M,
          fillColor: zoneColor,
          fillOpacity: op,
          strokeColor: zoneColor,
          strokeOpacity: Math.min(0.7, op + 0.2),
          strokeWeight: 1.5,
          clickable: false,
          zIndex: 50,
        });
      }
    });
  }, [claims, now]);

  // Unified "City controlled" layer — larger cream halos around every claim,
  // visible regardless of which category is currently being sniffed.
  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;
    const active = new Set(showControlled ? Object.keys(claims) : []);

    Object.entries(controlledCirclesRef.current).forEach(([id, c]) => {
      if (!active.has(id)) {
        c.setMap(null);
        delete controlledCirclesRef.current[id];
      }
    });

    if (!showControlled) return;

    Object.values(claims).forEach((cl) => {
      const pos = { lat: cl.lat, lng: cl.lng };
      const isHover = zoneHover?.placeId === cl.placeId;
      const existing = controlledCirclesRef.current[cl.placeId];
      const opts = {
        center: pos,
        radius: CONTROLLED_RADIUS_M,
        fillColor: "#FFF4D6", // hero cream
        fillOpacity: isHover ? 0.32 : 0.12,
        strokeColor: isHover ? "#FFC233" : "#FF3D6E",
        strokeOpacity: isHover ? 0.95 : 0.55,
        strokeWeight: isHover ? 2.5 : 1.25,
        clickable: true,
        zIndex: isHover ? 30 : 20,
      };
      if (existing) {
        existing.setOptions(opts);
      } else {
        const circle = new window.google.maps.Circle({
          map: mapInstanceRef.current,
          ...opts,
        });
        const updateHover = (e: any) => {
          const dom = e?.domEvent;
          const x = dom?.clientX ?? 0;
          const y = dom?.clientY ?? 0;
          setZoneHover({ placeId: cl.placeId, x, y });
        };
        circle.addListener("mouseover", updateHover);
        circle.addListener("mousemove", updateHover);
        circle.addListener("mouseout", () =>
          setZoneHover((h) => (h?.placeId === cl.placeId ? null : h)),
        );
        controlledCirclesRef.current[cl.placeId] = circle;
      }
    });
  }, [claims, showControlled, zoneHover]);



  // Tick for staleness + animate fake rats
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setLeaderboard((rows) =>
        rows.map((r) =>
          r.isYou ? r : { ...r, crumbs: r.crumbs + (Math.random() < 0.35 ? 1 : 0) },
        ),
      );
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Clean up DOM on unmount
  useEffect(() => {
    return () => {
      Object.values(circlesRef.current).forEach((c: any) => c.setMap(null));
      Object.values(controlledCirclesRef.current).forEach((c: any) => c.setMap(null));
      Object.values(placeMarkersRef.current).forEach((m: any) => m.setMap(null));
    };
  }, []);

  const resetRat = () => {
    if (markerRef.current && mapInstanceRef.current) {
      markerRef.current.setPosition(NYC);
      mapInstanceRef.current.panTo(NYC);
      setRatPos(NYC);
      setStatus("Back to the colony nest.");
      sniffPlaces(category, NYC);
    }
  };

  const sniffCheese = () => sniffPlaces("cheese");
  const findHideout = () => sniffPlaces("hideout");

  const currentMeta = CATEGORY_META[category];
  const quipsForCategory = currentMeta.quips;
  const selectedQuip = selected
    ? quipsForCategory[
        (() => {
          let h = 0;
          for (let i = 0; i < selected.id.length; i++)
            h = (h * 31 + selected.id.charCodeAt(i)) >>> 0;
          return h % quipsForCategory.length;
        })()
      ]
    : "";

  // ============ Capture / claim flow ============
  const fireCelebration = (emoji: string, msg: string) => {
    setCelebration({ emoji, msg });
    setTimeout(() => setCelebration(null), 2200);
  };

  const openClaim = (place: Place) => {
    pendingPlaceRef.current = place;
    fileInputRef.current?.click();
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // reset input so same file can be re-picked
    if (e.target) e.target.value = "";
    const place = pendingPlaceRef.current;
    if (!file || !place) return;

    setClaiming(true);
    setClaimNote(null);

    let dataUrl: string;
    try {
      dataUrl = await fileToDataUrl(file);
    } catch {
      setClaiming(false);
      setClaimNote({
        kind: "read",
        title: "Couldn't read that photo.",
        hint: "The colony's eyes glazed over. Try a different file, little one.",
      });
      return;
    }

    // Vision check — wait for the server as long as it needs. The "Scurrying
    // the AI…" UI keeps showing while `claiming` is true. Only real network
    // errors surface as retryable; no client-side timeout.
    type VR = { ok: boolean; reason: string } | { failure: "network"; reason?: string };
    const result: VR = await verifyPhotoFn({
      data: {
        imageDataUrl: dataUrl,
        category: place.category,
        placeName: place.name,
      },
    }).catch((e: any) => ({
      failure: "network" as const,
      reason: e?.message ? String(e.message).slice(0, 120) : undefined,
    }));

    setClaiming(false);

    if ("failure" in result) {
      setClaimNote({
        kind: result.failure,
        title: "Couldn't reach the colony.",
        hint: "Network gave us the slip. Check your signal and try another photo.",
        reason: result.reason,
      });
      return;
    }

    if (!result.ok) {
      const hintByCat: Record<PlaceCategory, string> = {
        bodega:
          "Snap the storefront, the sign, the snacks — anything that screams bodega.",
        cheese:
          "Show the food, the menu, the kitchen, or the front of the joint.",
        hideout:
          "Point your lens at the park, the view, the trees, or the landmark.",
      };
      setClaimNote({
        kind: "mismatch",
        title: `Hmm, that doesn't smell like ${place.name}.`,
        hint: hintByCat[place.category],
        reason: result.reason,
      });
      return;
    }


    const already = claims[place.id];
    const meta = CATEGORY_META[place.category];

    if (already) {
      // Refresh existing turf — once per session bonus
      const refreshKey = `${place.id}:session`;
      const gotSessionBonus = !sessionRefreshedRef.current.has(refreshKey);
      sessionRefreshedRef.current.add(refreshKey);
      setClaims((c) => ({
        ...c,
        [place.id]: {
          ...already,
          photo: dataUrl,
          refreshedAt: Date.now(),
          crumbs: already.crumbs + (gotSessionBonus ? 3 : 0),
        },
      }));
      if (gotSessionBonus) {
        setCrumbs((n) => n + 3);
        fireCelebration(meta.emoji, "Fresh scent marked — keep your turf, little one. +3");
      } else {
        fireCelebration(meta.emoji, "Scent refreshed. Bold rat.");
      }
      return;
    }

    // New claim — in this demo the player is always first
    const firstFang = true;
    const gain = 10 + (firstFang ? 15 : 0);
    setCrumbs((n) => n + gain);
    setClaims((c) => ({
      ...c,
      [place.id]: {
        placeId: place.id,
        photo: dataUrl,
        category: place.category,
        claimedAt: Date.now(),
        refreshedAt: Date.now(),
        firstFang,
        lat: place.lat,
        lng: place.lng,
        name: place.name,
        crumbs: gain,
      },
    }));
    setCityPct((p) => Math.min(CITY_PCT_CAP, +(p + CITY_PCT_PER_CLAIM).toFixed(1)));
    fireCelebration(
      meta.emoji,
      firstFang
        ? `Territory claimed! First fang 🦷  +${gain} crumbs`
        : `Territory claimed! The colony grows. 🐀 +${gain}`,
    );
  };

  // Leaderboard with player slotted by crumbs
  const rankedBoard = useMemo(() => {
    const rows: LeaderRow[] = [
      ...leaderboard,
      { id: "you", name: PLAYER_NAME, crumbs, isYou: true },
    ];
    rows.sort((a, b) => b.crumbs - a.crumbs);
    return rows;
  }, [leaderboard, crumbs]);

  const playerRank = rankedBoard.findIndex((r) => r.isYou) + 1;

  const sky = weather ? SKY_BY_MOOD[weather.mood] : null;
  const weatherCaption = weather ? weatherFlavor(weather) : null;

  return (
    <div
      className={`fixed inset-0 overflow-hidden bg-[#08070f] ${
        entering ? "animate-scene-in" : ""
      }`}
    >
      <div ref={mapRef} className="absolute inset-0" />

      {sky && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] transition-opacity duration-1000"
          style={{ background: sky.gradient, mixBlendMode: "screen", opacity: sky.opacity }}
        />
      )}
      {sky?.particles === "rain" && <RainOverlay />}
      {sky?.particles === "snow" && <SnowOverlay />}

      {/* Hidden file input for capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-background/80 p-6 text-center text-sm text-muted-foreground">
          The tunnels are blocked: {error}
        </div>
      )}

      {/* Top-left: back */}
      <div className="absolute left-3 top-3 z-10">
        <button
          onClick={onBack}
          aria-label="Back to the colony"
          className="flex items-center gap-2 rounded-full bg-[var(--card)]/95 px-3 py-2 text-sm font-bold text-card-foreground shadow-rat backdrop-blur transition active:scale-95 hover:brightness-110"
        >
          <span className="text-lg leading-none">←</span>
          <span>Back to nest</span>
        </button>
      </div>

      {/* Top-right: crumbs HUD — navy frame + cream count, echoing the hero sticker */}
      <div className="pointer-events-none absolute right-3 top-3 z-10">
        <div
          className="flex items-center gap-2 rounded-full px-4 py-2 shadow-rat backdrop-blur"
          style={{
            background: "color-mix(in oklab, var(--hero-navy) 78%, transparent)",
            border: "2px solid var(--hero-cream)",
            boxShadow: "0 8px 20px -8px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.05)",
          }}
        >
          <span className="text-xl leading-none">🧀</span>
          <span
            key={crumbs}
            className="text-sm font-bold inline-block animate-scale-in"
            style={{ color: "var(--hero-cream)" }}
          >
            {crumbs}{" "}
            <span style={{ color: "color-mix(in oklab, var(--hero-cream) 70%, transparent)" }} className="font-medium">
              crumbs
            </span>
          </span>
        </div>
      </div>

      {/* Top-center toggles — open status / city-controlled on demand */}
      <div className="absolute inset-x-0 top-16 z-10 flex justify-center gap-2 px-3">
        <button
          onClick={() => setStatusOpen((v) => !v)}
          className="rounded-full px-3 py-1.5 text-[11px] font-bold shadow-rat backdrop-blur transition active:scale-95 hover:brightness-110"
          style={{
            background: "color-mix(in oklab, var(--hero-navy) 80%, transparent)",
            border: "1.5px solid color-mix(in oklab, var(--hero-cream) 55%, transparent)",
            color: "var(--hero-cream)",
          }}
          aria-pressed={statusOpen}
        >
          📰 Status
        </button>
        <button
          onClick={() => setCityOpen((v) => !v)}
          className="rounded-full px-3 py-1.5 text-[11px] font-bold shadow-rat backdrop-blur transition active:scale-95 hover:brightness-110"
          style={{
            background: "color-mix(in oklab, var(--hero-navy) 80%, transparent)",
            border: "1.5px solid color-mix(in oklab, var(--hero-cream) 55%, transparent)",
            color: "var(--hero-cream)",
          }}
          aria-pressed={cityOpen}
        >
          🏙️ {cityPct.toFixed(0)}%
        </button>
      </div>

      {/* City controlled meter — only on toggle */}
      {cityOpen && (
        <div className="absolute inset-x-0 top-28 z-10 flex justify-center px-3 animate-scale-in">
          <div
            className="relative w-full max-w-xs rounded-2xl px-3 py-2 pr-9 shadow-rat backdrop-blur"
            style={{
              background: "color-mix(in oklab, var(--hero-navy) 80%, transparent)",
              border: "1.5px solid color-mix(in oklab, var(--hero-cream) 60%, transparent)",
            }}
          >
            <button
              onClick={() => setCityOpen(false)}
              aria-label="Close"
              className="absolute right-2 top-1.5 text-xs opacity-70 hover:opacity-100"
              style={{ color: "var(--hero-cream)" }}
            >
              ✕
            </button>
            <div
              className="flex items-center justify-between text-[10px] uppercase tracking-wider"
              style={{ color: "color-mix(in oklab, var(--hero-cream) 75%, transparent)" }}
            >
              <span>🏙️ City controlled</span>
              <span
                key={cityPct}
                className="font-bold animate-scale-in"
                style={{ color: "var(--hero-cream)" }}
              >
                {cityPct.toFixed(1)}%
              </span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: "color-mix(in oklab, var(--hero-cream) 12%, transparent)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${cityPct}%`,
                  background:
                    "linear-gradient(90deg, var(--hero-red), color-mix(in oklab, var(--hero-red) 60%, var(--hero-cream)))",
                  boxShadow: "0 0 12px color-mix(in oklab, var(--hero-red) 60%, transparent)",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Status pill — only on toggle */}
      {statusOpen && (
        <div className="absolute inset-x-0 top-28 z-10 flex justify-center px-3 animate-scale-in">
          <div
            className="relative max-w-[90%] rounded-2xl px-4 py-2 pr-8 text-xs font-semibold shadow-rat backdrop-blur text-center"
            style={{
              background: "color-mix(in oklab, var(--hero-navy) 78%, transparent)",
              border: "1.5px solid color-mix(in oklab, var(--hero-cream) 55%, transparent)",
              color: "var(--hero-cream)",
              marginTop: cityOpen ? 80 : 0,
            }}
          >
            <button
              onClick={() => setStatusOpen(false)}
              aria-label="Close"
              className="absolute right-2 top-1.5 text-xs opacity-70 hover:opacity-100"
              style={{ color: "var(--hero-cream)" }}
            >
              ✕
            </button>
            {status}
            {weatherCaption && (
              <div className="mt-1 text-[10px] uppercase tracking-widest opacity-75">
                {weatherCaption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Left stack of controls — re-sniff tinted to current category */}
      <div className="absolute left-3 bottom-40 z-10 flex flex-col-reverse items-start gap-2">
        <button
          onClick={() => sniffPlaces(category)}
          disabled={loadingPlaces}
          style={{
            boxShadow: `0 0 0 1px ${CATEGORY_COLOR[category]}55, 0 6px 20px -8px ${CATEGORY_COLOR[category]}aa`,
            color: CATEGORY_COLOR[category],
          }}
          className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-xs font-bold backdrop-blur transition active:scale-95 hover:brightness-110 disabled:opacity-60"
        >
          {currentMeta.emoji} {loadingPlaces ? "Sniffing…" : `Re-sniff ${currentMeta.noun}`}
        </button>

        {places.length > 0 && (
          <button
            onClick={() => setStoryOpen(true)}
            className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-xs font-bold text-white backdrop-blur transition active:scale-95 hover:brightness-110"
            style={{ boxShadow: `0 0 0 1px ${CATEGORY_COLOR[category]}55` }}
          >
            📸 Scout pics
          </button>)}

        <button
          onClick={() => setTrailOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full bg-[var(--card)]/95 px-3 py-2 text-xs font-bold text-card-foreground shadow-rat backdrop-blur transition active:scale-95 hover:brightness-110"
        >
          🐾 {trailOpen ? "Hide trail" : `Crumb trail (${places.length})`}
        </button>

        <button
          onClick={() => setHidePins((v) => !v)}
          className="flex items-center gap-2 rounded-full bg-[var(--card)]/95 px-3 py-2 text-xs font-bold text-card-foreground shadow-rat backdrop-blur transition active:scale-95 hover:brightness-110"
          title="Temporarily hide pins on the map"
        >
          {hidePins ? "👁️ Show pins" : "🙈 Hide pins"}
        </button>

        <button
          onClick={() => setShowControlled((v) => !v)}
          aria-pressed={showControlled}
          className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold backdrop-blur transition active:scale-95 hover:brightness-110"
          style={{
            background: showControlled
              ? "color-mix(in oklab, var(--hero-navy) 85%, transparent)"
              : "rgba(8,7,15,0.85)",
            color: "var(--hero-cream)",
            boxShadow: showControlled
              ? "0 0 18px -6px color-mix(in oklab, var(--hero-red) 70%, transparent), inset 0 0 0 1.5px var(--hero-cream)"
              : "inset 0 0 0 1px color-mix(in oklab, var(--hero-cream) 35%, transparent)",
          }}
          title="Toggle the highlighted territory the colony controls"
        >
          🏴 {showControlled ? "Hide controlled" : "Show controlled"}
        </button>

        <button
          onClick={() => setLeaderOpen(true)}
          className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-bold text-[var(--accent-foreground)] shadow-rat backdrop-blur transition active:scale-95 hover:brightness-110"
        >
          🗺️ Scouts nearby
        </button>

        <button
          onClick={() => setLightMode((v) => !v)}
          className="flex items-center gap-2 rounded-full bg-[var(--card)]/95 px-3 py-2 text-xs font-bold text-card-foreground shadow-rat backdrop-blur transition active:scale-95 hover:brightness-110"
          title={lightMode ? "Back to the neon sewers" : "Scurry by daylight"}
        >
          {lightMode ? "🌙 Night sewers" : "☀️ Daylight"}
        </button>
      </div>


      {/* Crumb trail panel */}
      {trailOpen && (
        <div className="absolute inset-x-3 bottom-36 z-30 mx-auto max-w-md rounded-2xl bg-[var(--card)]/98 shadow-rat backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-lg">{currentMeta.emoji}</span>
              <h3 className="text-sm font-extrabold text-card-foreground">
                Crumb trail — {currentMeta.noun}
              </h3>
            </div>
            <button
              onClick={() => setTrailOpen(false)}
              aria-label="Close trail"
              className="rounded-full bg-black/20 px-2 py-1 text-xs text-card-foreground hover:bg-black/30"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
              Sort
            </span>
            {([
              { key: "distance", label: "🐀 Nearest" },
              { key: "rating", label: "⭐ Top" },
              { key: "name", label: "A–Z" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSortBy(opt.key)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition active:scale-95 ${
                  sortBy === opt.key
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "bg-white/5 text-card-foreground hover:bg-white/10"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-white/5">
            {places.length === 0 && (
              <li className="px-4 py-6 text-center text-xs text-muted-foreground">
                Nothing in sniffing range yet.
              </li>
            )}
            {[...places]
              .map((p) => ({
                p,
                d: haversineMeters(ratPos, { lat: p.lat, lng: p.lng }),
              }))
              .sort((a, b) => {
                if (sortBy === "rating") return (b.p.rating ?? -1) - (a.p.rating ?? -1);
                if (sortBy === "name") return a.p.name.localeCompare(b.p.name);
                return a.d - b.d;
              })
              .map(({ p, d }) => {
                const owned = !!claims[p.id];
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => focusPlace(p)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/5 active:bg-white/10"
                    >
                      <span className="text-xl leading-none mt-0.5">
                        {CATEGORY_META[p.category].emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-card-foreground">
                          {p.name} {owned && <span className="text-amber-400">🏴</span>}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {p.address}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-bold text-[var(--accent)]">
                          🐀 {formatDistance(d)}
                        </p>
                        {p.rating != null && (
                          <p className="text-[11px] text-muted-foreground">
                            {p.rating.toFixed(1)} ⭐
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {/* Leaderboard panel */}
      {leaderOpen && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center bg-black/60"
          onClick={() => setLeaderOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-[var(--card)] shadow-rat"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center pt-2">
              <span className="h-1 w-10 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <h3 className="text-sm font-extrabold text-card-foreground">
                  🗺️ Scouts nearby
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Other rats sniffing the same blocks · tap to peek
                </p>
              </div>
              <button
                onClick={() => setLeaderOpen(false)}
                aria-label="Close"
                className="rounded-full bg-black/20 px-2 py-1 text-xs text-card-foreground hover:bg-black/30"
              >
                ✕
              </button>
            </div>
            <ul className="max-h-[55vh] overflow-y-auto divide-y divide-white/5 pb-3">
              {[...rankedBoard]
                .map((r) => {
                  const dist =
                    r.lat != null && r.lng != null
                      ? haversineMeters(ratPos, { lat: r.lat, lng: r.lng })
                      : null;
                  return { r, dist };
                })
                .sort((a, b) => {
                  if (a.r.isYou) return -1;
                  if (b.r.isYou) return 1;
                  if (a.dist == null) return 1;
                  if (b.dist == null) return -1;
                  return a.dist - b.dist;
                })
                .map(({ r, dist }) => {
                  const catColor = r.lastCategory ? CATEGORY_COLOR[r.lastCategory] : "#888";
                  const catEmoji =
                    r.lastCategory === "bodega"
                      ? "🏪"
                      : r.lastCategory === "cheese"
                      ? "🧀"
                      : r.lastCategory === "hideout"
                      ? "🕳️"
                      : "📍";
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (r.lat != null && r.lng != null && mapInstanceRef.current) {
                            mapInstanceRef.current.panTo({ lat: r.lat, lng: r.lng });
                            const z = mapInstanceRef.current.getZoom?.() ?? 15;
                            if (z < 16) mapInstanceRef.current.setZoom(16);
                            setLeaderOpen(false);
                          }
                        }}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5 ${
                          r.isYou ? "bg-[var(--accent)]/10" : ""
                        }`}
                      >
                        <div
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl"
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            boxShadow: `0 0 0 2px ${catColor}aa`,
                          }}
                        >
                          {r.name.match(/\p{Emoji}/u)?.[0] ?? "🐀"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-card-foreground">
                              {r.name.replace(/\s*\p{Emoji}+\s*$/u, "")}
                            </span>
                            {r.isYou && (
                              <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-extrabold text-[var(--accent-foreground)]">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {r.isYou
                              ? "Right here, sniffing"
                              : r.lastPlace
                              ? `${catEmoji} ${r.lastPlace}`
                              : "Off the grid"}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                            {!r.isYou && r.lastAt && <span>{timeAgo(r.lastAt)}</span>}
                            {!r.isYou && dist != null && (
                              <span>· {formatDistance(dist)} away</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-bold text-[var(--accent)]">
                          🧀 {r.crumbs}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        </div>
      )}

      {/* Geolocation denied / unavailable */}
      {geoError && (
        <div className="absolute inset-x-3 top-44 z-20 mx-auto max-w-md rounded-2xl bg-[var(--card)]/98 p-3 shadow-rat backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">🐀</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-card-foreground">
                {geoError === "denied"
                  ? "Pssst… the colony can't smell where you are."
                  : "The tunnels are foggy — can't pick up your scent."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {geoError === "denied"
                  ? "Flip on location in your browser, then give us another sniff."
                  : "Try again in a sec, little one."}
              </p>
            </div>
            <button
              onClick={retryGeo}
              className="shrink-0 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent-foreground)] shadow-rat transition active:scale-95 hover:brightness-110"
            >
              Sniff again
            </button>
          </div>
        </div>
      )}

      {/* Find me */}
      {userPos && (
        <button
          onClick={() => mapInstanceRef.current?.panTo(userPos)}
          aria-label="Center on my location"
          className="absolute right-3 bottom-56 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--card)]/95 text-xl shadow-rat backdrop-blur transition active:scale-90 hover:brightness-110"
          title="Find me"
        >
          📍
        </button>
      )}

      <button
        onClick={resetRat}
        aria-label="Reset rat position"
        className="absolute right-3 bottom-40 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--card)]/95 text-xl shadow-rat backdrop-blur transition active:scale-90 hover:brightness-110"
        title="Send the rat back to the nest"
      >
        🎯
      </button>

      {/* Selected place info card */}
      {selected && (
        <div className="absolute inset-x-3 bottom-36 z-20 mx-auto max-w-md rounded-2xl bg-[var(--card)]/98 p-4 shadow-rat backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl leading-none">
                  {CATEGORY_META[selected.category].emoji}
                </span>
                <h3 className="truncate text-base font-extrabold text-card-foreground">
                  {selected.name}
                </h3>
                {claims[selected.id] && (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    🏴 Claimed
                  </span>
                )}
                {claims[selected.id]?.firstFang && (
                  <span className="rounded-full bg-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                    First fang 🦷
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {selected.address}
              </p>
              <p className="mt-2 text-sm font-bold text-card-foreground">
                {selected.rating != null ? `${selected.rating.toFixed(1)} ⭐` : "No rating yet"}
                <span className="ml-2 font-medium text-muted-foreground">
                  · 🐀 {formatDistance(haversineMeters(ratPos, { lat: selected.lat, lng: selected.lng }))} scurry
                </span>
                {userPos ? (
                  <span className="ml-1 font-medium text-muted-foreground">
                    · 📍 {formatDistance(haversineMeters(userPos, { lat: selected.lat, lng: selected.lng }))} from you
                  </span>
                ) : (
                  <span className="ml-1 font-medium text-muted-foreground/70 italic">
                    · 📍 location off
                  </span>
                )}
              </p>
              <p className="mt-2 text-sm italic text-[var(--accent)]">"{selectedQuip}"</p>

              {claims[selected.id]?.photo && (
                <img
                  src={claims[selected.id].photo}
                  alt={`Your claim of ${selected.name}`}
                  className="mt-3 h-28 w-full rounded-lg object-cover ring-1 ring-amber-400/40"
                />
              )}

              {claiming && (
                <div className="mt-3 rounded-lg bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/40 px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl animate-bounce">🐀</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold text-card-foreground">
                        Scurrying the AI…
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        The colony's nose is sniffing your photo. Hang tight.
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-1/3 animate-[ratSlide_1.2s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
                  </div>
                  <style>{`@keyframes ratSlide { 0%{transform:translateX(-100%)} 100%{transform:translateX(400%)} }`}</style>
                </div>
              )}

              {!claiming && claimNote && (
                <div className="mt-3 rounded-lg bg-red-500/15 ring-1 ring-red-400/30 px-3 py-2">
                  <p className="text-xs font-bold text-red-100">
                    🐀 {claimNote.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-red-200/90">
                    {claimNote.hint}
                  </p>
                  {claimNote.reason && (
                    <p className="mt-1 text-[10px] italic text-red-200/70">
                      Nose says: "{claimNote.reason}"
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => {
                        setClaimNote(null);
                        openClaim(selected);
                      }}
                      className="flex-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11px] font-extrabold text-[var(--accent-foreground)] shadow-rat transition active:scale-95 hover:brightness-110"
                    >
                      📸 Try another photo
                    </button>
                    <button
                      onClick={() => setClaimNote(null)}
                      className="rounded-md bg-white/10 px-3 py-1.5 text-[11px] font-bold text-card-foreground hover:bg-white/15"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {!claiming && !claimNote && (
                <button
                  onClick={() => openClaim(selected)}
                  className="mt-3 w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-extrabold text-[var(--accent-foreground)] shadow-rat transition active:scale-95 hover:brightness-110"
                >
                  {claims[selected.id]
                    ? "📸 Re-mark this turf"
                    : "📸 Claim this turf"}
                </button>
              )}
            </div>
            <button
              onClick={() => {
                if (claiming) return;
                setSelected(null);
                setClaimNote(null);
              }}
              disabled={claiming}
              aria-label="Close"
              title={claiming ? "Wait — AI is sniffing" : "Close"}
              className="rounded-full bg-black/20 px-2 py-1 text-sm text-card-foreground hover:bg-black/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Controlled-zone hover tooltip */}
      {zoneHover && claims[zoneHover.placeId] && (
        <div
          className="pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-[115%] animate-fade-in"
          style={{ left: zoneHover.x, top: zoneHover.y }}
        >
          <div
            className="rounded-xl px-3 py-2 text-xs shadow-rat backdrop-blur whitespace-nowrap"
            style={{
              background: "color-mix(in oklab, var(--hero-navy) 92%, transparent)",
              border: "1.5px solid var(--hero-cream)",
              color: "var(--hero-cream)",
            }}
          >
            <div className="flex items-center gap-1.5 font-extrabold">
              <span>{CATEGORY_META[claims[zoneHover.placeId].category].emoji}</span>
              <span className="max-w-[180px] truncate">
                {claims[zoneHover.placeId].name}
              </span>
            </div>
            <div
              className="mt-0.5 flex items-center gap-1 text-[11px]"
              style={{ color: "color-mix(in oklab, var(--hero-cream) 80%, transparent)" }}
            >
              <span>🧀</span>
              <span className="font-bold">{claims[zoneHover.placeId].crumbs}</span>
              <span>crumbs · colony turf</span>
            </div>
          </div>
          <div
            className="mx-auto h-2 w-2 rotate-45"
            style={{
              marginTop: "-4px",
              background: "color-mix(in oklab, var(--hero-navy) 92%, transparent)",
              borderRight: "1.5px solid var(--hero-cream)",
              borderBottom: "1.5px solid var(--hero-cream)",
            }}
          />
        </div>
      )}

      {/* Celebration overlay */}
      {celebration && (
        <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
          <div className="absolute inset-x-0 top-44 flex justify-center px-3">
            <div className="animate-scale-in rounded-2xl bg-[var(--accent)] px-4 py-2 text-sm font-extrabold text-[var(--accent-foreground)] shadow-rat">
              {celebration.msg}
            </div>
          </div>
          {Array.from({ length: 22 }).map((_, i) => {
            const left = Math.random() * 100;
            const delay = Math.random() * 0.25;
            const dur = 1.1 + Math.random() * 0.8;
            const rot = Math.floor(Math.random() * 360);
            const drift = (Math.random() - 0.5) * 80;
            return (
              <span
                key={i}
                className="absolute -top-6 text-2xl"
                style={{
                  left: `${left}%`,
                  animation: `ratFall ${dur}s ease-in ${delay}s forwards`,
                  // @ts-expect-error custom property for keyframes
                  "--drift": `${drift}px`,
                  transform: `rotate(${rot}deg)`,
                }}
              >
                {i % 2 === 0 ? celebration.emoji : "🐀"}
              </span>
            );
          })}
          <style>{`
            @keyframes ratFall {
              0% { transform: translate(0, -20px) rotate(0deg); opacity: 0; }
              10% { opacity: 1; }
              100% { transform: translate(var(--drift, 0px), 110vh) rotate(540deg); opacity: 0.9; }
            }
          `}</style>
        </div>
      )}

      {/* Bottom action row — three category buttons, each in its signature neon */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-5 pt-10 bg-gradient-to-t from-black/75 to-transparent">
        {/* Hover explainer — shows for 6s what each button sniffs from Google Maps */}
        {catTip && (
          <div
            className="mx-auto mb-2 max-w-md rounded-2xl border px-4 py-3 shadow-rat backdrop-blur animate-rise-in"
            style={{
              backgroundColor: "rgba(8,7,15,0.92)",
              borderColor: `${CATEGORY_COLOR[catTip]}88`,
              boxShadow: `0 0 22px -8px ${CATEGORY_COLOR[catTip]}aa`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold" style={{ color: CATEGORY_COLOR[catTip] }}>
                  {CATEGORY_TIP[catTip].title}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-white/80">
                  {CATEGORY_TIP[catTip].body}
                </p>
              </div>
              <button
                onClick={hideCatTip}
                aria-label="Close tip"
                className="text-white/60 transition hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
          {([
            { cat: "bodega" as const, label: "🏪 Bodega", fn: () => sniffPlaces("bodega") },
            { cat: "cheese" as const, label: "🧀 Cheese", fn: sniffCheese },
            { cat: "hideout" as const, label: "🕳️ Hideout", fn: findHideout },
          ]).map(({ cat, label, fn }) => {
            const c = CATEGORY_COLOR[cat];
            const active = category === cat;
            return (
              <button
                key={cat}
                onClick={fn}
                onMouseEnter={() => showCatTip(cat)}
                onMouseLeave={hideCatTip}
                onFocus={() => showCatTip(cat)}
                onBlur={hideCatTip}
                title={CATEGORY_TIP[cat].body}
                style={{
                  backgroundColor: active ? c : "rgba(8,7,15,0.85)",
                  color: active ? "#0a0a0a" : c,
                  boxShadow: active
                    ? `0 0 24px -4px ${c}cc, inset 0 0 0 1px ${c}`
                    : `inset 0 0 0 1px ${c}66, 0 0 16px -8px ${c}88`,
                }}
                className="rounded-2xl px-3 py-3.5 text-sm font-extrabold backdrop-blur transition active:scale-95 hover:brightness-110"
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-white/60">
          Drag the rat. Claim the city.
        </p>
      </div>

      <PlacesStory
        open={storyOpen}
        places={places.slice(0, 6)}
        accent={CATEGORY_COLOR[category]}
        onClose={() => setStoryOpen(false)}
        onPickPlace={(p) => focusPlace(p)}
      />
    </div>
  );
}
