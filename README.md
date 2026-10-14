# 🐀 Rat City

A playful, mobile-first city exploration app where you play as a rat scurrying through New York City — sniffing out **bodegas 🏪**, **cheese 🧀** (food spots), and **hideouts 🕳️** (parks & quiet spots), capturing territory, and climbing the colony ranks.

> **Built at the Vibratz vibe coding hackathon in New York City, hosted by Lovable and Apify — 2026.**

## What it does

- **Rat POV intro** — a cartoon dusk-skyline landing scene with the colony mascot
- **Live map** — Google Maps in a dark "Neon Sewer" theme (with a light-mode toggle)
- **Three categories, powered by Google Places** — bodegas, food spots, and hideouts near your rat, with real distances
- **Capture the city** — visit a pin, snap a photo of the famous thing there, and claim territory (with AI photo verification)
- **Scouts nearby** — see other rats scouting around the city
- **Scout pics** — an Instagram-style story viewer with real photos of each spot (powered by Apify's Google Maps scraper)

## Tech

- [TanStack Start](https://tanstack.com/start) (React 19, Vite, server functions)
- Tailwind CSS v4 + shadcn/ui
- Google Maps JavaScript API + Places API (via the Lovable Google Maps connector)
- Apify (`compass/crawler-google-places`) for place photos
- Google Gemini (via Lovable AI Gateway) for photo verification

## Run it locally

```bash
bun install
bun dev
```

You'll need a Google Maps browser key configured for the app to render the map.

---

*Hacked together in a weekend at Vibratz 2026 — NYC rats unite.* 🗽
