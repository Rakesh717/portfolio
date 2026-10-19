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
- `src/content/blog/*.md` — field notes (blog posts).

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
- `src/scripts/trek.ts` — the engine. Maps vertical scroll to a horizontal
  camera, puts stops on plateaus at their altitude, generates the ground and
  forest from a seeded RNG, runs weather (leaves, petals, snow, gusts that
  bend the trees), time of day, the HUD, and Yakku's behaviour.

## Interactions

- **Opening shot:** on the first visit of a session the camera drops from the
  sky past the peaks and lands on basecamp (skip with any key, wheel or touch).
- **Foreground:** blurred grass, branches, rocks and snow drifts pass in front
  of the camera for depth.
- **Cloud bank:** the long climb before High Camp walks you through a whiteout.
- **Hoofprints:** once the trail is snowy, Yakku leaves prints that stay put.
- **Summit:** confetti, then the camera pulls back and a trail map unfolds,
  drawing your route up the mountain. Every flag on it is clickable.
- **Sound** (off by default, "hear the mountain" in the HUD): wind that
  strengthens with altitude, birds in the forest, footsteps per surface, the
  campfire, flags in gusts, a yak bell. All synthesized in
  `src/scripts/sound.ts`, no audio files.
- Poke Yakku for a quip. Poke him ten times and he goes on strike.
- Leave him alone and he grazes. Scroll back and he turns around; travel far
  and he runs.
- Flick the notes in the trail register; copy the email at the summit.

## Accessibility and fallbacks

With `prefers-reduced-motion` or no JavaScript, the site renders as a calm,
readable vertical page with the same content. Keyboard focus brings the
focused element into view on the trail.

## QA hooks

- `/?at=summit` — start at a stop (any stop id from `content.ts`).
- `/?x=2400` — start at a camera offset in pixels.
- `/?static=1` — force the vertical fallback.
- `/?nointro` — skip the opening shot.
