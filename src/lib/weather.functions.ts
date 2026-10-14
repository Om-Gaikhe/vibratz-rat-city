import { createServerFn } from "@tanstack/react-start";

export type WeatherMood =
  | "clear-day"
  | "clear-night"
  | "cloudy"
  | "rain"
  | "storm"
  | "snow"
  | "fog"
  | "unknown";

export type Weather = {
  mood: WeatherMood;
  tempC: number | null;
  description: string;
  isDay: boolean;
};

function classify(type: string | undefined, isDay: boolean): WeatherMood {
  const t = (type ?? "").toUpperCase();
  if (t.includes("THUNDER")) return "storm";
  if (t.includes("SNOW") || t.includes("FLURR") || t.includes("BLIZZ")) return "snow";
  if (t.includes("RAIN") || t.includes("SHOWER") || t.includes("DRIZZ")) return "rain";
  if (t.includes("FOG") || t.includes("MIST") || t.includes("HAZE") || t.includes("SMOKE"))
    return "fog";
  if (t.includes("CLOUD") || t.includes("OVERCAST")) return "cloudy";
  if (t.includes("CLEAR") || t.includes("SUN")) return isDay ? "clear-day" : "clear-night";
  return "unknown";
}

export const fetchWeather = createServerFn({ method: "POST" })
  .inputValidator((d: { lat: number; lng: number }) => {
    if (typeof d?.lat !== "number" || typeof d?.lng !== "number") throw new Error("lat/lng required");
    return d;
  })
  .handler(async ({ data }): Promise<Weather> => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      throw new Error("Google Maps connector not configured");
    }
    const url = `https://connector-gateway.lovable.dev/google_maps/weather/v1/currentConditions:lookup?location.latitude=${data.lat}&location.longitude=${data.lng}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
      },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Weather failed (${res.status}): ${t.slice(0, 200)}`);
    }
    const j: any = await res.json();
    const isDay = !!j.isDaytime;
    const mood = classify(j.weatherCondition?.type, isDay);
    return {
      mood,
      tempC: typeof j.temperature?.degrees === "number" ? j.temperature.degrees : null,
      description: j.weatherCondition?.description?.text ?? "Mystery skies",
      isDay,
    };
  });
