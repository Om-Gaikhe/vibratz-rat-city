import heroAsset from "@/assets/rat-hero-cutout.png.asset.json";
import nycBgAsset from "@/assets/nyc-map-bg.png.asset.json";

const FEATURES = [
  {
    icon: "🧀",
    title: "Sniff out cheese",
    line: "The best grub and warm beds in the city. Eat like a king rat.",
  },
  {
    icon: "🕳️",
    title: "Find a hideout",
    line: "Quiet corners, pretty sunsets, safe spots to lay low.",
  },
  {
    icon: "🏪",
    title: "Raid the bodegas",
    line: "Every corner store nearby. A rat's favorite hunting ground.",
  },
];

export function RatPovScene({
  onEnter,
  leaving,
}: {
  onEnter: () => void;
  leaving: boolean;
}) {


  return (
    <div
      className={`fixed inset-0 overflow-y-auto overflow-x-hidden bg-sunset ${
        leaving ? "animate-scene-out" : "animate-scene-in"
      }`}
    >
      {/* NYC map background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${nycBgAsset.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundRepeat: "no-repeat",
        }}
        aria-hidden
      />
      {/* Atmospheric overlay to blend with sunset palette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.55 0.18 35 / 0.35) 0%, oklch(0.35 0.15 30 / 0.55) 55%, oklch(0.2 0.1 30 / 0.85) 100%)",
          mixBlendMode: "multiply",
        }}
        aria-hidden
      />

      {/* Warm sun glow over the skyline */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full animate-sun-pulse pointer-events-none"
        style={{
          top: "2%",
          width: "90vw",
          height: "60vw",
          maxWidth: 620,
          maxHeight: 420,
          background:
            "radial-gradient(ellipse at center, oklch(0.9 0.18 80 / 0.5) 0%, transparent 65%)",
          filter: "blur(10px)",
          mixBlendMode: "screen",
        }}
        aria-hidden
      />



      {/* Content stack */}
      <div className="relative z-10 mx-auto flex min-h-full max-w-xl flex-col px-6 pb-8 pt-10 sm:pt-16 text-center">
        <p
          className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]/90 text-stroke-dark animate-rise-in"
          style={{ animationDelay: "100ms" }}
        >
          Rat City
        </p>
        <h1
          className="mt-3 text-3xl sm:text-5xl font-extrabold leading-tight text-white text-stroke-dark animate-rise-in"
          style={{ animationDelay: "250ms" }}
        >
          Welcome to the colony,
          <br />
          <span className="text-[var(--accent)]">little one.</span>
        </h1>
        <p
          className="mx-auto mt-4 max-w-sm text-sm sm:text-base text-white/85 text-stroke-dark animate-rise-in"
          style={{ animationDelay: "450ms" }}
        >
          The humans built this city. Tonight, it's ours.
          <br />
          Time to take it over — one crumb at a time.
        </p>

        {/* Hero sticker — merged into the cityscape (no frame) */}
        <div
          className="mx-auto mt-6 animate-rise-in animate-rat-breathe select-none"
          style={{
            width: "clamp(220px, 60vw, 360px)",
            aspectRatio: "1 / 1",
            animationDelay: "550ms",
            filter:
              "drop-shadow(0 22px 18px rgba(0,0,0,0.55)) drop-shadow(0 0 30px oklch(0.85 0.18 75 / 0.35))",
          }}
          aria-hidden
        >
          <img
            src={heroAsset.url}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
            style={{ mixBlendMode: "normal" }}
          />
        </div>


        <p
          className="mb-3 text-xs sm:text-sm text-white/80 text-stroke-dark animate-rise-in"
          style={{ animationDelay: "650ms" }}
        >
          Here's what you can sniff out tonight, little one:
        </p>

        <div
          className="flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible animate-rise-in"
          style={{ animationDelay: "800ms" }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="min-w-[78%] sm:min-w-0 shrink-0 rounded-2xl border border-white/10 bg-black/35 p-4 text-left backdrop-blur-md"
              style={{
                boxShadow:
                  "0 8px 24px -8px rgba(0,0,0,0.5), 0 0 0 1px oklch(0.82 0.18 80 / 0.08), 0 0 24px -8px oklch(0.82 0.18 80 / 0.25)",
              }}
            >
              <div className="text-2xl" aria-hidden>
                {f.icon}
              </div>
              <div className="mt-1.5 text-sm font-bold text-[var(--accent)]">
                {f.title}
              </div>
              <div className="mt-1 text-xs leading-snug text-white/80">
                {f.line}
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-6 flex justify-center animate-rise-in"
          style={{ animationDelay: "1000ms" }}
        >
          <button
            onClick={onEnter}
            className="group relative inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-8 py-4 text-lg font-bold text-[var(--accent-foreground)] shadow-rat transition active:scale-95 hover:brightness-110"
          >
            <span>Enter the colony</span>
            <span className="transition group-hover:translate-x-1">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
