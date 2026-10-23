# Rakesh Thapa — Portfolio

A side-scrolling Himalayan trek. Scroll (or swipe, or press ← →) and Yakku
the yak walks the trail from basecamp at 1,400 m to the summit at 8,848 m:
through a breezy pine and rhododendron forest, alpine meadow, rock and snow,
from morning to a starry night. Each stop on the trail is a section of the site.

Built with [Astro](https://astro.build) and Tailwind CSS v4. All art is
hand-built SVG and every animation lives in code.

## Run it

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static build in dist/
```

## Where the copy lives

- `src/data/content.ts` — all site copy, the trail stops (altitude, biome,
  Yakku's pose), Yakku's quips and poke lines.
- `src/content/blog/*.mdx` — field notes (blog posts). Frontmatter schema is in
  `src/content.config.ts`.
- `CONTENT.md` — every piece of copy in one readable file, kept in sync with
  the two above.

## How it fits together

- `src/components/Trek.astro` — the world shell: sky, sun/moon/stars,
  parallax mountain, ridge and forest layers, the yak, and the HUD
  (altimeter + trail map, which is the navigation).
- `src/components/stops/*` — one component per stop: Basecamp (intro),
  Trailhead (notice board), Camp ×4 (experience), Fireside (testimonial
  deck), Notes (clothesline of postcards), Summit (contact), Night (footer).
- `src/components/Yak.astro` — the side-view mascot rig. Poses are driven
  by `data-pose` in `src/styles/global.css`: idle, walk, run, wave, sit,
  read, graze, celebrate, sleep.
- `src/components/YakRun.astro` — Yakku's trail run, the small endless
  runner on the 404 page: jump cairns, mani stones, chortens, prayer
  wheels, rhododendrons and sleeping trail dogs from Lukla upward; altitude is
  the score and trek stops are milestones. Obstacles are `<template>`s with a
  `data-biomes` list, so the snowy stretch only has stone ones. Hidden without JavaScript and under reduced motion.
- `src/scripts/trek.ts` — the engine. Maps vertical scroll to a horizontal
  camera, puts stops on plateaus at their altitude, generates the ground and
  forest from a seeded RNG, runs weather (leaves, petals, snow, gusts that
  bend the trees), time of day, the HUD, and Yakku's behaviour.

## Interactions

- **Guided tour:** the tour button in the HUD has Yakku walk the whole trail
  and talk you through each stop (lines in `tour` in `content.ts`). P plays
  and pauses it, Esc stops it.
- **Quick walk:** W takes Yakku back to the trailhead and walks him the whole
  trail to night camp, with no reading stops and no quips. Any key or scroll stops it.
- **Foreground:** blurred grass, branches, rocks and snow drifts pass in front
  of the camera for depth.
- **Cloud bank:** the long climb before High Camp walks you through a whiteout.
- **Hoofprints:** once the trail is snowy, Yakku leaves prints that stay put.
- **Summit:** confetti, then the camera pulls back and a trail map unfolds,
  drawing your route up the mountain. Every flag on it is clickable. The
  look-back plays once a day.
- **Sound** (off by default, "hear the mountain" in the HUD): wind that
  strengthens with altitude, birds in the forest, footsteps per surface, the
  campfire, flags in gusts, a yak bell. All synthesized in
  `src/scripts/sound.ts`, no audio files.
- Poke Yakku for a quip. Poke him ten times and he goes on strike.
- Leave him alone and he grazes. Scroll back and he turns around; travel far
  and he runs.
- Flick the notes in the trail register; copy the email at the summit.

## Field notes (the blog)

Reading a post is a climb too. `src/pages/blog/[slug].astro` puts the article
on a sheet of paper in front of a world that changes as you scroll:

- `ReadingWorld` — sky from morning to dusk, parallax peaks, snow; on wide
  screens a setting sun and clouds you climb through. All behind the paper.
- `TrailProgress` — Yakku walks a trail bar with an altitude readout
  (1,400 m → 8,848 m). `TrailMap` lists the sections in the margin.
- `ReadingLog` — remembers where you stopped (localStorage) and offers to pick
  up there; the index shows how far you got.
- `TrailSound` — optional sound, sharing the home page's on/off setting.
- `ProseExtras` — heading anchors, code copy buttons, drop cap.
- In-article widgets (`YakSays`, `AgentRun`, `TwoBrain`, …) live in
  `src/components/blog/` and are imported by the `.mdx` posts.

Shared scroll and altitude maths is in `src/scripts/climb.ts`; read time is in
`src/lib/reading.ts`.

### Adding a post

1. Add `src/content/blog/<slug>.mdx` with `title`, `description`, `pubDate`,
   `tags`, and `og: { pose, quip }` (Yakku's pose and line on the share image).
   Republished posts also set `originalUrl` and `originalSite`; they then point
   their canonical link at the original and stay out of the sitemap.
2. Render its share image (below) and list it in `CONTENT.md`.

## Share images and SEO

- `public/og.png` is the site card; `public/og/blog/<slug>.png` is each post's.
  Both are 2400 × 1260 and drawn by `src/pages/og/[variant].astro`, which only
  exists in dev. Open `/og/card` or `/og/<slug>`, capture the 1200 × 630
  viewport at device scale 2, and save over the PNG. A post without its own
  image falls back to the site card (`src/lib/share.ts`).
- `src/layouts/Base.astro` writes the meta tags (Open Graph, X, robots,
  article dates) and any JSON-LD a page passes in.
- The sitemap filter is in `astro.config.mjs`.
- `src/pages/404.astro` builds `dist/404.html`, which Cloudflare Pages serves
  with a real 404 status for unknown paths. Without that file Pages treats the
  site as a single-page app and answers every path with the home page and a
  200. It passes `noindex` to `Base.astro`, which also drops its canonical link.
- `src/pages/404.astro` builds `dist/404.html`, which Cloudflare Pages serves
  with a real 404 status for unknown paths. Without that file Pages treats the
  site as a single-page app and answers every path with the home page and a
  200. It passes `noindex` to `Base.astro`, which also drops its canonical link.

## Accessibility and fallbacks

With `prefers-reduced-motion` or no JavaScript, the site renders as a calm,
readable vertical page with the same content. Keyboard focus brings the
focused element into view on the trail.

## QA hooks

- `/?at=summit` — start at a stop (any stop id from `content.ts`).
- `/?x=2400` — start at a camera offset in pixels.
- `/#notes` — deep link to a stop by id, same as `?at=`.
- `/?static=1` — force the vertical fallback.
