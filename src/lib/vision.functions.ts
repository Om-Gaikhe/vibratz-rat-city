import { createServerFn } from "@tanstack/react-start";

export type PlaceCategory = "bodega" | "cheese" | "hideout";

const SOFT_PASS = { ok: true as const, reason: "Verified by the colony's nose 🐀" };

export const verifyPlacePhoto = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { imageDataUrl: string; category: PlaceCategory; placeName: string }) => {
      if (!d?.imageDataUrl || !d.imageDataUrl.startsWith("data:image/")) {
        throw new Error("imageDataUrl must be a data:image/* URL");
      }
      if (!["bodega", "cheese", "hideout"].includes(d.category)) {
        throw new Error("invalid category");
      }
      // Cap size to keep request modest (~6MB base64)
      if (d.imageDataUrl.length > 8_500_000) {
        throw new Error("image too large");
      }
      return {
        imageDataUrl: d.imageDataUrl,
        category: d.category,
        placeName: String(d.placeName ?? "this spot").slice(0, 120),
      };
    },
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return SOFT_PASS;

    const guidance: Record<PlaceCategory, string> = {
      bodega:
        "Pass for any storefront, shop exterior, convenience-store interior, signage, snacks, packaged goods, street scene with shops.",
      cheese:
        "Pass for any restaurant, food, dish, menu, cafe, bakery, kitchen, hotel exterior, or anything edible-looking.",
      hideout:
        "Pass for any park, tree, sky, outdoor scene, landmark, viewpoint, skyline, monument, plaza, statue, bench, water.",
    };

    const prompt = `You are a SOFT, GENEROUS verifier for a playful rat-themed city game.
Place: "${data.placeName}" — category: ${data.category}.
${guidance[data.category]}
Only fail if the photo is CLEARLY unrelated — for example a tight selfie of a human face filling the frame, a screenshot of pure UI/text, or something obviously not the right vibe.
When in doubt, pass.
Respond ONLY with strict JSON: {"ok": boolean, "reason": "short playful rat-voiced phrase under 12 words"}.`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "raw",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) return SOFT_PASS;
      const j: any = await res.json();
      const txt: string = j?.choices?.[0]?.message?.content ?? "{}";
      try {
        const parsed = JSON.parse(txt);
        return {
          ok: typeof parsed.ok === "boolean" ? parsed.ok : true,
          reason: typeof parsed.reason === "string" && parsed.reason.length
            ? parsed.reason
            : SOFT_PASS.reason,
        };
      } catch {
        return SOFT_PASS;
      }
    } catch {
      return SOFT_PASS;
    }
  });
