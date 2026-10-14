import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RatPovScene } from "@/components/RatPovScene";
import { MapScene } from "@/components/MapScene";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rat City — Take it over, one crumb at a time" },
      {
        name: "description",
        content:
          "A cheeky rat-colony adventure across the city. Sniff out cheese, find a hideout, and scurry through the tunnels.",
      },
      { property: "og:title", content: "Rat City" },
      {
        property: "og:description",
        content: "Welcome to the colony, little one. The city is ours tonight.",
      },
    ],
  }),
  component: Index,
});

type Stage = "pov" | "leaving" | "map" | "returning";

function Index() {
  const [stage, setStage] = useState<Stage>("pov");

  const enter = () => {
    setStage("leaving");
    setTimeout(() => setStage("map"), 900);
  };

  const back = () => {
    setStage("returning");
    setTimeout(() => setStage("pov"), 700);
  };

  const showPov = stage === "pov" || stage === "leaving";
  const showMap = stage === "map" || stage === "returning";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      {showMap && <MapScene entering={stage === "map"} onBack={back} />}
      {showPov && <RatPovScene onEnter={enter} leaving={stage === "leaving"} />}
      {/* Transition veil */}
      <div
        className={`pointer-events-none fixed inset-0 z-50 bg-black transition-opacity duration-500 ${
          stage === "leaving" || stage === "returning" ? "opacity-60" : "opacity-0"
        }`}
      />
    </main>
  );
}
