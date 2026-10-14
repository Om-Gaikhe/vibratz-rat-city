import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { fetchPlaceMedia } from "@/lib/apify.functions";
import type { Place } from "@/lib/bodegas.functions";

type Props = {
  places: Place[];
  open: boolean;
  onClose: () => void;
  onPickPlace?: (p: Place) => void;
  accent: string;
};

type MediaState = {
  loading: boolean;
  photos: string[];
  error?: string;
};

const STORY_MS = 4500;

export default function PlacesStory({ places, open, onClose, onPickPlace, accent }: Props) {
  const fetchMedia = useServerFn(fetchPlaceMedia);
  const [placeIdx, setPlaceIdx] = useState(0);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [media, setMedia] = useState<Record<string, MediaState>>({});
  const [paused, setPaused] = useState(false);
  const tickRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const [progress, setProgress] = useState(0);

  const place = places[placeIdx];
  const state = place ? media[place.id] : undefined;
  const photos = state?.photos ?? [];

  // Reset on open
  useEffect(() => {
    if (open) {
      setPlaceIdx(0);
      setPhotoIdx(0);
      setProgress(0);
      elapsedRef.current = 0;
    }
  }, [open]);

  // Fetch media for current place
  useEffect(() => {
    if (!open || !place) return;
    if (media[place.id]) return;
    setMedia((m) => ({ ...m, [place.id]: { loading: true, photos: [] } }));
    fetchMedia({ data: { name: place.name, lat: place.lat, lng: place.lng, placeId: place.id } })
      .then((r) => {
        setMedia((m) => ({ ...m, [place.id]: { loading: false, photos: r.photos } }));
      })
      .catch((e) => {
        setMedia((m) => ({
          ...m,
          [place.id]: { loading: false, photos: [], error: e?.message ?? "Couldn't load" },
        }));
      });
  }, [open, place, media, fetchMedia]);

  // Auto-advance
  useEffect(() => {
    if (!open || paused || !place) return;
    if (state?.loading || photos.length === 0) return;

    startRef.current = performance.now() - elapsedRef.current;
    const tick = () => {
      const e = performance.now() - startRef.current;
      elapsedRef.current = e;
      const p = Math.min(1, e / STORY_MS);
      setProgress(p);
      if (p >= 1) {
        elapsedRef.current = 0;
        advance(1);
      } else {
        tickRef.current = requestAnimationFrame(tick);
      }
    };
    tickRef.current = requestAnimationFrame(tick);
    return () => {
      if (tickRef.current) cancelAnimationFrame(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paused, place, photoIdx, state?.loading, photos.length]);

  function advance(dir: 1 | -1) {
    elapsedRef.current = 0;
    setProgress(0);
    if (dir === 1) {
      if (photoIdx + 1 < photos.length) {
        setPhotoIdx(photoIdx + 1);
      } else if (placeIdx + 1 < places.length) {
        setPlaceIdx(placeIdx + 1);
        setPhotoIdx(0);
      } else {
        onClose();
      }
    } else {
      if (photoIdx > 0) {
        setPhotoIdx(photoIdx - 1);
      } else if (placeIdx > 0) {
        setPlaceIdx(placeIdx - 1);
        setPhotoIdx(0);
      }
    }
  }

  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") advance(1);
      else if (e.key === "ArrowLeft") advance(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photoIdx, placeIdx, photos.length]);

  if (!open || !place) return null;

  const currentPhoto = photos[photoIdx];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close scout"
        className="absolute right-3 top-3 z-[60] flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/30 active:scale-95"
      >
        <span aria-hidden>✕</span>
        <span className="hidden sm:inline">Close</span>
      </button>

      <div
        className="relative h-full max-h-[100dvh] w-full max-w-md overflow-hidden bg-black sm:h-[90vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={(e) => {
          setPaused(true);
          const t = e.touches[0];
          touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
        }}
        onTouchEnd={(e) => {
          setPaused(false);
          const start = touchRef.current;
          touchRef.current = null;
          if (!start) return;
          const end = e.changedTouches[0];
          const dx = end.clientX - start.x;
          const dy = end.clientY - start.y;
          const dt = Date.now() - start.t;
          if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx) * 1.5) {
            onClose();
            return;
          }
          if (dt < 600 && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
            advance(dx < 0 ? 1 : -1);
          }
        }}
      >
        {/* Progress bars (per photo in this place) */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-2">
          {(photos.length ? photos : [0]).map((_, i) => (
            <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                className="h-full bg-white"
                style={{
                  width: i < photoIdx ? "100%" : i === photoIdx ? `${progress * 100}%` : "0%",
                  transition: i === photoIdx ? "none" : "width 0.2s",
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute inset-x-0 top-3 z-20 flex items-center gap-2 px-3 pt-2 pr-20">
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-black"
              style={{ backgroundColor: accent, color: "#0a0a0a" }}
            >
              🐀
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{place.name}</div>
              <div className="truncate text-[11px] text-white/70">
                {placeIdx + 1} / {places.length} · scouting · swipe →
              </div>
            </div>
          </div>
        </div>

        {/* Media */}
        <div className="absolute inset-0 grid place-items-center">
          {state?.loading ? (
            <div className="flex flex-col items-center gap-3 text-white/80">
              <div
                className="h-10 w-10 animate-spin rounded-full border-2 border-white/30"
                style={{ borderTopColor: accent }}
              />
              <div className="text-xs uppercase tracking-widest">Sniffing photos…</div>
            </div>
          ) : state?.error || photos.length === 0 ? (
            <div className="max-w-xs px-6 text-center text-white/80">
              <div className="text-4xl">📷</div>
              <div className="mt-2 text-sm font-semibold">No street pics yet</div>
              <div className="mt-1 text-[11px] text-white/60">
                {state?.error ?? "This spot hasn't been scouted on Google."}
              </div>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={currentPhoto}
              src={currentPhoto}
              alt={place.name}
              className="h-full w-full object-cover"
              onError={() => advance(1)}
            />
          )}
        </div>

        {/* Tap zones (invisible halves for quick taps) */}
        <button
          onClick={() => advance(-1)}
          className="absolute inset-y-0 left-0 z-10 w-1/3"
          aria-label="Previous"
        />
        <button
          onClick={() => advance(1)}
          className="absolute inset-y-0 right-0 z-10 w-1/3"
          aria-label="Next"
        />

        {/* Visible chevron controls */}
        <button
          onClick={() => advance(-1)}
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 active:scale-90"
        >
          <span aria-hidden className="text-xl leading-none">‹</span>
        </button>
        <button
          onClick={() => advance(1)}
          aria-label="Next photo"
          className="absolute right-2 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 active:scale-90"
        >
          <span aria-hidden className="text-xl leading-none">›</span>
        </button>

        {/* Footer caption + CTA */}
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 to-transparent p-4 pt-10">
          {place.address ? (
            <div className="mb-3 line-clamp-2 text-[12px] text-white/85">{place.address}</div>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onPickPlace?.(place);
                onClose();
              }}
              className="flex-1 rounded-full px-4 py-2.5 text-sm font-extrabold"
              style={{ backgroundColor: accent, color: "#0a0a0a" }}
            >
              Sniff this spot →
            </button>
            <button
              onClick={() => advance(1)}
              className="rounded-full bg-white/15 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/25"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
