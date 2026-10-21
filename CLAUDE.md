# Working on this repo

Rakesh Thapa's portfolio: a static Astro 5 site with Tailwind v4 and MDX. The home
page is a side-scrolling Himalayan trek guided by Yakku the yak; the blog ("field
notes") turns reading a post into the same climb. Read `README.md` for how it fits
together. This file is the extra context for making changes.

## Commands

- `npm run dev` (Astro, default port 4321; any free port is fine) and `npm run build`.
- There is no test suite or linter. A passing `npm run build` is the bar, plus a
  visual check (below).
- Live site: https://rakeshthapa.pages.dev (static `dist/`, Cloudflare Pages). The
  URL is set as `site` in `astro.config.mjs`; canonical links, Open Graph URLs,
  RSS and the sitemap all depend on it.

## Commits

Conventional commits with a scope, lower case, describing the effect:
`feat(blog): …`, `fix(trek): …`, `docs(content): …`, `chore: …`. Common scopes:
trek, blog, yak, sound, deck, summit, seo, og, content. Only commit when asked.

## Keep in sync

- Copy lives in `src/data/content.ts` (site, trail stops, Yakku's quips, tour
  lines, pokes, testimonials) and `src/content/blog/*.mdx` (posts). `CONTENT.md`
  mirrors all of it; update it in the same change.
- When the structure changes (new component, new workflow), update `README.md`.
- Testimonials are real client quotes. Never edit their wording or invent new ones.

## Layout modes

`src/layouts/Base.astro` takes `mode`: `"trek"` for the home page, `"journal"`
(default) for reading pages. Trek mode adds `trek-on` to `<html>` unless the visitor
prefers reduced motion or the URL has `?static=1`; without it the home page is a
calm vertical page with the same content. Every change to the trek must keep that
fallback working.

## Home page (the trek)

- Stops are defined in `stops` in `content.ts` (id, altitude, biome, Yakku's pose)
  and rendered by `src/components/stops/*`. The engine in `src/scripts/trek.ts`
  places them on the terrain by altitude, so a new stop needs both a data entry and
  a component in `src/pages/index.astro`.
- Deep links and QA hooks: `/#notes`, `/?at=summit`, `/?x=2400`, `/?static=1`.
- Sound is synthesized in `src/scripts/sound.ts` (no audio files) and shared by the
  home page and the blog.

## Yakku

- `src/components/Yak.astro` is the SVG rig; poses come from `data-pose` CSS in
  `src/styles/global.css`: idle, walk, run, wave, sit, read, graze, celebrate,
  sleep (plus grumpy, used by a blog widget). Set the pose attribute; don't add
  inline transforms.
- The pose lists in `content.ts` (`Pose`) and `content.config.ts` (`og.pose`) are
  subsets; extend them when a new pose should be allowed there.

## Browser storage

All optional, wrapped in try/catch, and the site works without them:
`yak-sound` (sound on/off, shared by home and blog), `yak-trails` (where you
stopped on each post), `yak-summit-reveal` (summit look-back shown today).

## Blog posts

- New post: follow "Adding a post" in the README, including the `og` frontmatter
  and rendering `public/og/blog/<slug>.png`. Without that image the post shares
  with the generic site card.
- Writing style for posts: plain, conversational essay prose in Rakesh's voice.
  No em or en dashes. No LinkedIn rhythm (one-line paragraphs, punchy fragments).
  Avoid stock AI phrasing, bold-labelled bullet lists and "not X but Y" lines.
  Never invent personal anecdotes or facts about named tools; use hypotheticals.
- Each post should have something interactive and on theme (a Yakku widget in
  `src/components/blog/`), but the prose must read fine without it.
- Republished posts (`originalUrl` set) canonicalise to the original and are kept
  out of the sitemap automatically. Original posts are included.

## Design rules

- Reading comes first. Effects sit behind the paper or in the margins, never on
  the prose. Anything that peeks out as clipped fragments on narrow screens gets
  hidden at those widths instead.
- Prefer subtle over busy; if something reads as distracting, remove it rather
  than tune it.
- Tried and rejected on the blog: "camp" labels on headings, a summit pop-up and
  confetti, "Summited" stamps, prayer flags behind the article. Don't bring back.
- Respect `prefers-reduced-motion`, and keep everything usable by keyboard.
- Use the theme tokens in `src/styles/global.css` (ink, cream, paper, rust, teal,
  butter) and the three fonts: Fraunces (display), Bricolage Grotesque (body),
  Caveat (hand). Hand-drawn look: 2.5px ink outlines, slightly irregular radii,
  small tilts, offset shadows.

## Checking changes

- Look at visual changes in a real browser at the real window size and at phone
  width, and check the page doesn't scroll sideways on phones. Screenshots go in
  `.shots/` (git-ignored).
- Elements added from scripts don't get Astro's scoped styles; style them with
  `:global(...)`.
- If the dev server keeps serving old CSS after an edit (seen with
  `<style is:global>` in `src/pages/og/`), restart it.
- Share images: capture at device scale 2 so the PNG is 2400 × 1260, which is the
  size `Base.astro` declares. `src/pages/og/` only exists in dev; keep it that way
  so it never ships or lands in the sitemap.
