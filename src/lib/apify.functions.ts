import { createServerFn } from "@tanstack/react-start";

export type PlaceMedia = {
  placeId: string;
  name: string;
  photos: string[];
};

// Calls Apify's compass/crawler-google-places actor synchronously for a single
// place near the given coordinates and returns its photo URLs.
// Note: this actor does NOT return videos/reels — photos only.
export const fetchPlaceMedia = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { name: string; lat: number; lng: number; placeId: string }) => {
      if (!data?.name || typeof data?.lat !== "number" || typeof data?.lng !== "number") {
        throw new Error("name, lat, lng required");
      }
      return data;
    },
  )
  .handler(async ({ data }): Promise<PlaceMedia> => {
    const token = process.env.APIFY_API_TOKEN;
    if (!token) throw new Error("APIFY_API_TOKEN not configured");

    const input = {
      searchStringsArray: [data.name],
      customGeolocation: {
        type: "Point",
        coordinates: [data.lng, data.lat],
        radiusKm: 0.5,
      },
      maxCrawledPlacesPerSearch: 1,
      maxImages: 10,
      scrapeImageAuthors: false,
      language: "en",
      includeWebResults: false,
      skipClosedPlaces: false,
    };

    const url = `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${token}&timeout=90&memory=2048`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Apify failed (${res.status}): ${t.slice(0, 200)}`);
    }

    const items: any[] = await res.json();
    const first = items?.[0] ?? {};
    const raw: any[] = first.imageUrls ?? first.images ?? [];
    const photos = raw
      .map((p) => (typeof p === "string" ? p : p?.imageUrl ?? p?.url))
      .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
      .slice(0, 10);

    return { placeId: data.placeId, name: data.name, photos };
  });
