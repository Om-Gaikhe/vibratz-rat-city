import { createServerFn } from "@tanstack/react-start";

export type PlaceCategory = "bodega" | "cheese" | "hideout";

export type Place = {
  id: string;
  name: string;
  address: string;
  rating: number | null;
  lat: number;
  lng: number;
  category: PlaceCategory;
};

// Keep "Bodega" as alias for backwards compatibility
export type Bodega = Place;

const CATEGORY_TYPES: Record<PlaceCategory, string[]> = {
  bodega: ["convenience_store"],
  cheese: ["restaurant", "meal_takeaway", "bakery"],
  hideout: ["park", "tourist_attraction"],
};

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      lat: number;
      lng: number;
      radius?: number;
      category?: PlaceCategory;
    }) => {
      if (typeof data?.lat !== "number" || typeof data?.lng !== "number") {
        throw new Error("lat and lng are required numbers");
      }
      const radius = typeof data.radius === "number" ? data.radius : 700;
      if (radius < 50 || radius > 5000) throw new Error("radius out of range");
      const category: PlaceCategory = data.category ?? "bodega";
      if (!CATEGORY_TYPES[category]) throw new Error("unknown category");
      return { lat: data.lat, lng: data.lng, radius, category };
    },
  )
  .handler(async ({ data }): Promise<{ places: Place[]; category: PlaceCategory }> => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      throw new Error(
        "Google Maps connector not configured. Please add the Google Maps Platform connector.",
      );
    }

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/places/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.rating,places.location",
        },
        body: JSON.stringify({
          includedTypes: CATEGORY_TYPES[data.category],
          maxResultCount: 15,
          locationRestriction: {
            circle: {
              center: { latitude: data.lat, longitude: data.lng },
              radius: data.radius,
            },
          },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Places API failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const json: any = await res.json();
    const places: Place[] = (json.places ?? [])
      .map((p: any) => ({
        id: p.id,
        name: p.displayName?.text ?? "Mystery spot",
        address: p.formattedAddress ?? "",
        rating: typeof p.rating === "number" ? p.rating : null,
        lat: p.location?.latitude,
        lng: p.location?.longitude,
        category: data.category,
      }))
      .filter((b: Place) => typeof b.lat === "number" && typeof b.lng === "number");

    return { places: places.slice(0, 15), category: data.category };
  });

// Backwards-compatible alias used by existing imports
export const searchBodegas = searchPlaces;
