/**
 * The trek engine.
 *
 * Vertical scroll is mapped 1:1 onto a horizontal camera. Stops sit on
 * plateaus at their altitude; the trail climbs between them. Yakku walks
 * at a fixed spot on screen while the world (forest → meadow → rock →
 * snow) slides past in parallax, the sky moves from morning to night,
 * and the weather follows the biome.
 */
import { pokes, quips, tour as tourLines, type Biome, type Stop as StopData } from "../data/content";
import { createSound, type Surface } from "./sound";

const root = document.documentElement;
const trekOn = root.classList.contains("trek-on");

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** tiny seeded RNG so the scenery is the same on every visit */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/* ------------------------------------------------------------------ */
/* Things that work with or without the trek                          */
/* ------------------------------------------------------------------ */

const say = (text: string) => window.dispatchEvent(new CustomEvent("yak:say", { detail: text }));

function initDeck() {
  const deck = document.querySelector<HTMLElement>("[data-deck]");
  if (!deck) return;
  const notes = [...deck.querySelectorAll<HTMLElement>("[data-note]")];
  const count = document.querySelector<HTMLElement>("[data-deck-count]");
  let order = notes.map((_, i) => i);
  let busy = false;

  const render = () => {
    order.forEach((n, pos) => {
      notes[n].style.setProperty("--pos", String(pos));
      notes[n].style.zIndex = String(notes.length - pos);
      notes[n].setAttribute("aria-hidden", pos === 0 ? "false" : "true");
    });
    if (count) count.textContent = `${order[0] + 1} of ${notes.length}`;
  };

  const next = (dir = 1) => {
    if (busy) return;
    busy = true;
    const top = notes[order[0]];
    top.style.setProperty("--toss", String(dir));
    top.classList.add("is-tossed");
    window.setTimeout(() => {
      top.classList.remove("is-tossed");
      top.style.removeProperty("--dx");
      order = [...order.slice(1), order[0]];
      render();
      busy = false;
    }, 320);
  };
  const prev = () => {
    if (busy) return;
    order = [order[order.length - 1], ...order.slice(0, -1)];
    render();
  };

  // drag / flick the top note
  let startX = 0;
  let dx = 0;
  let dragging = false;
  deck.addEventListener("pointerdown", (e) => {
    const note = (e.target as HTMLElement).closest<HTMLElement>("[data-note]");
    if (!note || note !== notes[order[0]]) return;
    dragging = true;
    startX = e.clientX;
    dx = 0;
    note.setPointerCapture(e.pointerId);
    note.classList.add("is-dragging");
  });
  deck.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    notes[order[0]].style.setProperty("--dx", `${dx}px`);
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const top = notes[order[0]];
    top.classList.remove("is-dragging");
    if (Math.abs(dx) > 70) next(Math.sign(dx));
    else {
      top.style.removeProperty("--dx");
      if (Math.abs(dx) < 4) next(1);
    }
  };
  deck.addEventListener("pointerup", end);
  deck.addEventListener("pointercancel", end);

  // autoplay: the deck shuffles itself, but any user input takes over.
  // manual advances (drag, tap, arrows) hold autoplay off for a while,
  // and pointing at or focusing the deck pauses it until they let go.
  const autoBtn = document.querySelector<HTMLButtonElement>("[data-deck-auto]");
  const controlsEl = document.querySelector<HTMLElement>(".deck-controls");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const AUTOPLAY_MS = 5200;
  const IDLE_MS = 11000;
  let autoTimer = 0;
  let autoPaused = reduceMotion;
  let inView = false;
  let holding = false;
  let idleUntil = 0;

  const active = () => !autoPaused && inView && !document.hidden;
  const autoUi = () => {
    if (!autoBtn) return;
    autoBtn.textContent = autoPaused ? "▶" : "❚❚";
    autoBtn.classList.toggle("is-paused", autoPaused);
    autoBtn.setAttribute("aria-pressed", String(!autoPaused));
    autoBtn.setAttribute("aria-label", autoPaused ? "Shuffle the notes automatically" : "Pause the note shuffling");
  };
  const armAuto = () => {
    if (autoTimer) {
      window.clearTimeout(autoTimer);
      autoTimer = 0;
    }
    if (active()) autoTimer = window.setTimeout(shuffle, AUTOPLAY_MS);
  };
  const shuffle = () => {
    autoTimer = 0;
    // the tick keeps running while the deck is active, but only advances
    // once the user isn't engaging: not pointing at or focusing the deck,
    // and past the idle cooldown from their last manual advance
    if (active() && !holding && performance.now() >= idleUntil && !busy) next(1);
    armAuto();
  };
  const poke = () => {
    idleUntil = performance.now() + IDLE_MS;
    armAuto();
  };

  new IntersectionObserver(
    (entries) => {
      inView = entries[0]?.isIntersecting ?? false;
      armAuto();
    },
    { threshold: 0.35 },
  ).observe(deck);
  document.addEventListener("visibilitychange", armAuto);
  deck.addEventListener("pointerdown", poke);
  deck.addEventListener("pointerenter", () => {
    holding = true;
    armAuto();
  });
  deck.addEventListener("pointerleave", () => {
    holding = false;
    armAuto();
  });
  controlsEl?.addEventListener("focusin", (e) => {
    // only keyboard focus pauses autoplay; a mouse click's stray focus shouldn't
    if ((e.target as HTMLElement)?.matches?.(":focus-visible")) {
      holding = true;
      armAuto();
    }
  });
  controlsEl?.addEventListener("focusout", () => {
    holding = false;
    armAuto();
  });
  autoBtn?.addEventListener("click", () => {
    autoPaused = !autoPaused;
    if (!autoPaused) idleUntil = 0;
    autoUi();
    armAuto();
  });
  autoUi();

  document.querySelector("[data-deck-next]")?.addEventListener("click", () => {
    poke();
    next(1);
  });
  document.querySelector("[data-deck-prev]")?.addEventListener("click", () => {
    poke();
    prev();
  });
  render();
}

function initCopy() {
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    const label = btn.querySelector<HTMLElement>("[data-copy-label]");
    const original = label?.textContent ?? "";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy!);
        // hold the width so the shorter label doesn't reflow the buttons beside it
        btn.style.minWidth = `${btn.offsetWidth}px`;
        if (label) label.textContent = "Copied to clipboard ✓";
        say("Copied! I'll guard it with my life.");
      } catch {
        window.location.href = `mailto:${btn.dataset.copy}`;
      }
      window.setTimeout(() => {
        if (label) label.textContent = original;
        btn.style.minWidth = "";
      }, 2200);
    });
  });
}

/* ------------------------------------------------------------------ */
/* The trek                                                           */
/* ------------------------------------------------------------------ */

type Laid = {
  el: HTMLElement;
  d: StopData;
  x0: number;
  w: number;
  level: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  kind: "snow" | "leaf" | "petal" | "puff" | "confetti";
  color: string;
  life: number;
  depth: number;
  /** flutter: phase and rate of the side-to-side sway */
  ph: number;
  sw: number;
};

const PALETTE: Record<Biome, { grass: string; body: string; line: string }> = {
  forest: { grass: "#86C495", body: "#5E9E78", line: "#4A8563" },
  meadow: { grass: "#BCD27E", body: "#8FAE6A", line: "#748F55" },
  rock: { grass: "#D3C6B0", body: "#A99A88", line: "#8C7E6E" },
  snow: { grass: "#FFFFFF", body: "#E2EBF2", line: "#C5D3DE" },
};

const SKY: [number, string, string][] = [
  [0, "#BFE3F0", "#FFF3DE"],
  [3, "#A7D8EE", "#FFF7EA"],
  [5.5, "#B5D6EE", "#FFF0DC"],
  [6.3, "#DCC6D2", "#FFEBD2"],
  [7, "#F2B38A", "#FFE3BC"],
  [8, "#EE9C7E", "#FFD9A8"],
  [8.6, "#7E6AA6", "#F2A27E"],
  [9, "#26244A", "#4D4275"],
];

const LUNGTA = ["#4CC9F0", "#FFFDF6", "#EF476F", "#06D6A0", "#FFD166"];

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(lerp((pa >> shift) & 255, (pb >> shift) & 255, t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function boot() {
  const data = (JSON.parse($("#trek-config").textContent || "{}") as { stops: StopData[] }).stops;
  const reduced = false; // trek mode is only enabled when motion is OK

  const trek = $("#trek");
  const world = $("#world");
  const chunksEl = $("#chunks");
  const spacer = $("#trek-spacer");
  const sky = $("#sky");
  const sun = $("#sun");
  const moon = $("#moon");
  const stars = $("#stars");
  const far = $("#layer-far");
  const mid = $("#layer-mid");
  const near = $("#layer-near");
  const front = $("#layer-front");
  const fog = $<HTMLCanvasElement>("#fog");
  const fogCtx = fog.getContext("2d")!;
  const prints = $("#prints") as unknown as SVGSVGElement;
  const trailmap = $("#trailmap");
  const trailmapSvg = $("#trailmap-svg") as unknown as SVGSVGElement;
  const soundBtn = $("#hud-sound");
  const clouds = $("#layer-clouds");
  const mist = $("#layer-mist");
  const tint = $("#night-tint");
  const canvas = $<HTMLCanvasElement>("#weather");
  const ctx = canvas.getContext("2d")!;
  const actor = $("#yak-actor");
  const yak = $("#yakku") as unknown as SVGSVGElement;
  const yakBtn = $("#yak-btn");
  const quip = $("#quip");
  const hudAlt = $("#hud-alt");
  const hudPlace = $("#hud-place");
  const mapLine = $("#hud-map-line") as unknown as SVGSVGElement;
  const mapYak = $("#hud-map-yak");
  const mapStops = [...document.querySelectorAll<HTMLElement>(".hud-map-stops li")];
  const stopEls = [...document.querySelectorAll<HTMLElement>(".stop")];

  let VW = 0;
  let VH = 0;
  // the scroll position, kept from scroll events: reading window.scrollY in the
  // frame loop forces a style and layout pass (the yak's SVG legs animate on the
  // main thread, so style is always dirty there), and the frame's own writes then
  // cost a second one before paint
  let scrollPos = window.scrollY;
  window.addEventListener("scroll", () => (scrollPos = window.scrollY), { passive: true });
  let mobile = false;
  let ground = 0;
  let gapW = 0;
  let worldW = 0;
  let maxCam = 0;
  let maxLevel = 1;
  let yakFrac = 0.16;
  let yakW = 180;
  let L: Laid[] = [];
  let chunks: { el: HTMLElement; x0: number; x1: number; shown: boolean }[] = [];
  let buckets: { el: HTMLElement; x0: number; x1: number; shown: boolean }[] = [];
  let frontBuckets: { el: HTMLElement; x0: number; x1: number; shown: boolean }[] = [];
  let fogA = 0;
  let fogB = 0;
  // Basecamp's clearing, in screen x at the start (which is also x in every
  // parallax layer there): nothing tall grows behind the name and intro
  let clearA = 0;
  let clearB = 0;
  // the words' bottom edge: on phones, trees that stay below it can stay (the
  // words end well above the ground there); on wider screens the clearing runs
  // all the way down
  let clearY = 0;
  let nameR = 0;
  const inClearing = (x: number, top: number) => x > clearA && x < clearB && top < clearY;
  let dpr = 1;

  /* ---------------- geometry ---------------- */

  function elev(x: number) {
    if (x <= L[0].x0 + L[0].w) return L[0].level;
    for (let i = 1; i < L.length; i++) {
      const s = L[i];
      const p = L[i - 1];
      if (x < s.x0) {
        const a = p.x0 + p.w;
        return lerp(p.level, s.level, smooth(clamp((x - a) / (s.x0 - a), 0, 1)));
      }
      if (x <= s.x0 + s.w) return s.level;
    }
    return L[L.length - 1].level;
  }

  function altitudeAt(x: number) {
    if (x <= L[0].x0 + L[0].w) return L[0].d.altitude;
    for (let i = 1; i < L.length; i++) {
      const s = L[i];
      const p = L[i - 1];
      if (x < s.x0) {
        const a = p.x0 + p.w;
        return lerp(p.d.altitude, s.d.altitude, smooth(clamp((x - a) / (s.x0 - a), 0, 1)));
      }
      if (x <= s.x0 + s.w) return s.d.altitude;
    }
    return L[L.length - 1].d.altitude;
  }

  /** fractional stop index — drives sky + time of day */
  function stopUnits(x: number) {
    for (let i = 0; i < L.length - 1; i++) {
      if (x < L[i + 1].x0) return i + clamp((x - L[i].x0) / (L[i + 1].x0 - L[i].x0), 0, 1);
    }
    return L.length - 1;
  }

  function biomeAt(x: number, r: number): Biome {
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      if (x <= s.x0 + s.w) {
        if (x >= s.x0 || i === 0) return s.d.biome;
        const p = L[i - 1];
        const t = (x - (p.x0 + p.w)) / (s.x0 - (p.x0 + p.w));
        return r < t ? s.d.biome : p.d.biome;
      }
    }
    return L[L.length - 1].d.biome;
  }

  const stopAt = (x: number) => L.find((s) => x >= s.x0 && x <= s.x0 + s.w) ?? null;

  /* ---------------- layout ---------------- */

  function layout() {
    VW = window.innerWidth;
    VH = window.innerHeight;
    // phones — and portrait tablets: the compact layout reads better when the
    // viewport is tall and narrow, so tablets under 1024px in portrait get it too
    mobile = VW < 768 || (VH > VW && VW < 1024);
    ground = Math.round(VH * (mobile ? 0.88 : 0.9));
    gapW = Math.round(VW * (mobile ? 0.6 : 0.4));
    yakFrac = mobile ? 0.2 : 0.15;
    yakW = mobile ? 112 : clamp(VW * 0.13, 150, 280);
    const totalRise = VH * (mobile ? 0.8 : 0.95);
    const altMin = data[0].altitude;
    const altMax = Math.max(...data.map((d) => d.altitude));

    let x = 0;
    L = stopEls.map((el, i) => {
      const d = data.find((s) => s.id === el.dataset.stop)!;
      const span =
        Number(
          mobile ? (VW >= 768 ? el.dataset.spanT : el.dataset.spanM) : el.dataset.span,
        ) || 1;
      const w = Math.round(span * VW);
      if (i > 0) x += Math.round(gapW * (Number(el.dataset.gap) || 1));
      const laid = { el, d, x0: x, w, level: ((d.altitude - altMin) / (altMax - altMin)) * totalRise };
      x += w;
      return laid;
    });
    worldW = x;
    // the cloud bank fills the long climb before High Camp
    const hc = L.findIndex((s) => s.d.id === "camp-4");
    if (hc > 0) {
      fogA = L[hc - 1].x0 + L[hc - 1].w;
      fogB = L[hc].x0;
    }
    maxCam = worldW - VW;
    maxLevel = Math.max(...L.map((s) => s.level));

    root.style.setProperty("--vw", `${VW}px`);
    root.style.setProperty("--vh", `${VH}px`);
    root.style.setProperty("--ground", `${ground}px`);
    root.style.setProperty("--yak-w", `${yakW}px`);
    const lane = Math.round(VW * yakFrac + yakW * 0.75 + 30);
    root.style.setProperty("--lane", `${lane}px`);
    // the speech bubble stays in Yakku's lane so it never covers content
    const quipLeft = VW * yakFrac - yakW / 2 + (mobile ? yakW * 0.92 : yakW * 0.1);
    root.style.setProperty("--quip-max", `${Math.round(mobile ? VW - quipLeft - 14 : lane - quipLeft - 18)}px`);

    L.forEach((s) => {
      s.el.style.left = `${s.x0}px`;
      s.el.style.width = `${s.w}px`;
      s.el.style.top = `${-s.level}px`;
      s.el.style.setProperty("--stop-w", `${s.w}px`);
    });
    spacer.style.height = `calc(${maxCam}px + 100lvh)`;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(VW * dpr);
    canvas.height = Math.round(VH * dpr);
    buildFog();

    measureClearing();
    buildChunks();
    buildBackdrop();
    buildMap();
    buildSummitFlags();
  }

  /* ---------------- ground + forest ---------------- */

  let treeTop = 0; // the top of the last tree drawn, in its parent's coordinates
  function tree(sym: string, x: number, y: number, h: number, ratio: number, color: string, r: () => number, cls = "tree") {
    const w = h * ratio;
    treeTop = y - h;
    const dur = (3.2 + r() * 2.6).toFixed(2);
    const delay = (-r() * 5).toFixed(2);
    return `<svg class="${cls}" viewBox="0 0 ${ratio * 150} 150" style="left:${(x - w / 2).toFixed(1)}px;top:${(y - h).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;color:${color};animation-duration:${dur}s;animation-delay:${delay}s" preserveAspectRatio="none"><use href="#${sym}"/></svg>`;
  }

  function flagString(x1: number, y1: number, x2: number, y2: number, sag: number, size: number) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2 + sag;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(3, Math.floor(len / (size * 1.45)));
    let out = `<path d="M${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" fill="none" stroke="#40302A" stroke-width="2"/>`;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const px = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2;
      const py = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2;
      const tx = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx);
      const ty = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy);
      const ang = (Math.atan2(ty, tx) * 180) / Math.PI;
      out += `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${ang.toFixed(1)})"><rect class="lf" style="animation-delay:${(-i * 0.37).toFixed(2)}s" x="${-size / 2}" y="0" width="${size}" height="${size * 1.15}" rx="1.5" fill="${LUNGTA[i % 5]}" stroke="#40302A" stroke-width="1.8"/></g>`;
    }
    return out;
  }

  // the ink box of the intro's words: the text itself and the hint's arrow,
  // since block elements run wider than what's in them. Returns true when it
  // moved enough to rebuild the scenery around it.
  function measureClearing() {
    const s = L.find((l) => l.d.id === "basecamp");
    const box = s?.el.querySelector<HTMLElement>(".base");
    if (!s || !box) {
      clearA = clearB = nameR = 0;
      return false;
    }
    // measure the words where they'll settle, not where the entrance
    // animation starts them (lifted and tilted until the stop is seen)
    box.style.transition = "none";
    box.style.transform = "none";
    const sr = s.el.getBoundingClientRect();
    const o = sr.left - s.x0;
    // at the start the world isn't shifted vertically, so this is screen y there
    const oy = sr.top + s.level;
    const name = box.querySelector(".base-name");
    const range = document.createRange();
    const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const rects: [DOMRect, boolean][] = [...box.querySelectorAll("svg")].map((el) => [el.getBoundingClientRect(), false]);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) rects.push([r, !!name?.contains(n)]);
    }
    let a = Infinity;
    let b = -Infinity;
    let y = 0;
    let nr = 0;
    for (const [r, inName] of rects) {
      if (!r.width) continue;
      a = Math.min(a, r.left - o);
      b = Math.max(b, r.right - o);
      y = Math.max(y, r.bottom - oy);
      if (inName) nr = Math.max(nr, r.right - o);
    }
    box.style.transform = "";
    box.getBoundingClientRect(); // settle the transform before transitions come back
    box.style.transition = "";
    if (a > b) return false;
    const moved =
      Math.abs(a - 40 - clearA) > 16 || Math.abs(b + 40 - clearB) > 16 || (mobile && Math.abs(y + 24 - clearY) > 16);
    clearA = a - 40;
    clearB = b + 40;
    clearY = mobile ? y + 24 : Infinity;
    nameR = nr;
    // how much height the Basecamp signpost has under the words
    root.style.setProperty("--sign-room", `${Math.round(ground - y)}px`);
    return moved;
  }

  function buildChunks() {
    chunksEl.innerHTML = "";
    chunks = [];
    const scale = mobile ? 0.62 : clamp(VH / 900, 0.75, 1.3);
    const bottom = VH * 3.5; // deep enough for the summit zoom-out

    L.forEach((s, i) => {
      const next = L[i + 1];
      const x0 = s.x0;
      const x1 = next ? next.x0 : s.x0 + s.w;
      const w = x1 - x0 + 2;
      const minY = ground - Math.max(s.level, next?.level ?? 0);
      const yTop = Math.floor(minY - 320 * scale - 40);
      const H = bottom - yTop;
      const r = rng(1234 + i * 97);

      const gy = (x: number) => ground - elev(x) - yTop;

      // ground outline
      let top = "";
      for (let x = x0; x <= x1 + 16; x += 16) top += `${top ? "L" : "M"}${(x - x0).toFixed(0)} ${gy(Math.min(x, x1)).toFixed(1)} `;
      const body = `${top} L ${w} ${H} L 0 ${H} Z`;
      let band = "";
      for (let x = x0; x <= x1 + 16; x += 16) band += `${band ? "L" : "M"}${(x - x0).toFixed(0)} ${(gy(Math.min(x, x1)) + 16).toFixed(1)} `;

      const pa = PALETTE[s.d.biome];
      const pb = PALETTE[(next ?? s).d.biome];
      const split = (s.w / w).toFixed(3);
      const gid = `g${i}`;

      let trees = "";
      let front = "";
      let x = x0 + r() * 40;
      while (x < x1) {
        const local = x - s.x0;
        const inStop = local <= s.w;
        const frac = local / s.w;
        const open = !inStop || frac < (mobile ? 0.12 : 0.2) || frac > 0.93;
        const b = biomeAt(x, r());
        const y = gy(x) + 6;
        const lvl = elev(x) / maxLevel;
        const t0 = trees.length;
        if (open && (!inStop || r() < 0.85)) {
          const pick = r();
          if (b === "forest") {
            if (pick < 0.68) {
              const greens = ["#2F7D5B", "#3E9470", "#2A6E50", "#4AA27A"];
              trees += tree("s-pine", x, y, (120 + r() * 110) * scale, 0.53, greens[Math.floor(r() * 4)], r);
            } else trees += tree("s-rhodo", x, y, (80 + r() * 40) * scale, 1, "#4E9A6E", r);
          } else if (b === "meadow") {
            if (pick < 0.4) trees += tree("s-rhodo", x, y, (70 + r() * 40) * scale, 1, "#5FA474", r);
            else if (pick < 0.7) trees += tree("s-pine", x, y, (100 + r() * 70) * scale, 0.53, "#3E8A66", r);
            else trees += tree("s-rock", x, y + 4, (34 + r() * 24) * scale, 1.6, "#A79C90", r, "tree still");
          } else if (b === "rock") {
            if (pick < 0.5) trees += tree("s-rock", x, y + 4, (36 + r() * 34) * scale, 1.6, pick < 0.25 ? "#A79C90" : "#948A80", r, "tree still");
            else if (pick < 0.65) trees += tree("s-cairn", x, y + 2, (44 + r() * 20) * scale, 0.63, "", r, "tree still");
            else if (pick < 0.85) trees += tree("s-pine-snow", x, y, (90 + r() * 60) * scale, 0.53, "#2F7D5B", r);
          } else {
            if (lvl < 0.78 && pick < 0.45) trees += tree("s-pine-snow", x, y, (90 + r() * 80) * scale, 0.53, "#2A6E50", r);
            else if (pick < 0.85) trees += tree("s-rock-snow", x, y + 4, (34 + r() * 40) * scale, 1.6, "#9A8F84", r, "tree still");
          }
        }
        if (trees.length > t0 && inClearing(x, yTop + treeTop)) trees = trees.slice(0, t0);
        // grass at the trail edge
        if ((b === "forest" || b === "meadow") && r() < 0.55) {
          const gc = b === "forest" ? "#3F7F5A" : "#6E8C4A";
          const gs = (18 + r() * 14) * scale;
          front += `<use href="#s-grass" x="${(x - x0 + 30 * r()).toFixed(1)}" y="${(gy(x) - gs * 0.62).toFixed(1)}" width="${gs * 1.4}" height="${gs}" style="color:${gc}"/>`;
        }
        x += (inStop ? 55 : 34 + r() * 46) * (mobile ? 0.8 : 1) * (0.7 + r() * 0.6);
      }

      // prayer flags across the climb between stops
      let flags = "";
      if (next) {
        const a = s.x0 + s.w - 30 - x0;
        const bx = next.x0 + 30 - x0;
        const ph = 150 * scale;
        const ya = gy(s.x0 + s.w - 30);
        const yb = gy(next.x0 + 30);
        flags = `<svg class="flags" style="left:0;top:0;width:${w}px;height:${H}px" viewBox="0 0 ${w} ${H}">
          <path d="M${a} ${ya + 4} V ${ya - ph} M${bx} ${yb + 4} V ${yb - ph}" stroke="#40302A" stroke-width="4" stroke-linecap="round"/>
          ${flagString(a, ya - ph + 4, bx, yb - ph + 4, 46 * scale, 15 * scale)}
        </svg>`;
      }

      const el = document.createElement("div");
      el.className = "chunk";
      el.style.cssText = `left:${x0}px;top:${yTop}px;width:${w}px;height:${H}px`;
      el.innerHTML = `${trees}
        <svg class="ground" viewBox="0 0 ${w} ${H}" preserveAspectRatio="none">
          <defs>
            <linearGradient id="${gid}b" x1="0" x2="${w}" y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="${pa.body}"/><stop offset="${split}" stop-color="${pa.body}"/><stop offset="1" stop-color="${pb.body}"/>
            </linearGradient>
            <linearGradient id="${gid}g" x1="0" x2="${w}" y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="${pa.grass}"/><stop offset="${split}" stop-color="${pa.grass}"/><stop offset="1" stop-color="${pb.grass}"/>
            </linearGradient>
            <linearGradient id="${gid}l" x1="0" x2="${w}" y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stop-color="${pa.line}"/><stop offset="${split}" stop-color="${pa.line}"/><stop offset="1" stop-color="${pb.line}"/>
            </linearGradient>
          </defs>
          <path d="${body}" fill="url(#${gid}b)"/>
          <path d="${top}" fill="none" stroke="url(#${gid}g)" stroke-width="30"/>
          <path d="${band}" fill="none" stroke="url(#${gid}l)" stroke-width="3" stroke-dasharray="2 16" stroke-linecap="round"/>
          <path d="${top}" fill="none" stroke="#40302A" stroke-width="3" stroke-linejoin="round"/>
          ${front}
        </svg>${flags}`;
      chunksEl.appendChild(el);
      chunks.push({ el, x0, x1: x0 + w, shown: true });
    });
  }

  /* ---------------- distant mountains, ridges, clouds ---------------- */

  // Peaks you'd know, drawn from their outlines (x across, height up, as
  // fractions of a box): Machhapuchhre's split fishtail summit just past the
  // words at Basecamp, and Everest between Nuptse and Lhotse for the high
  // camps. Everything else in the range is generated.
  const FISHTAIL: [number, number][] = [
    [0, 0], [0.12, 0.16], [0.24, 0.34], [0.34, 0.6], [0.42, 0.84], [0.47, 1], [0.51, 0.9], [0.55, 0.95],
    [0.62, 0.72], [0.7, 0.5], [0.8, 0.3], [0.9, 0.14], [1, 0],
  ];
  // back to front: Lhotse, Everest, then Nuptse's long wall
  const EVEREST: [number, number][][] = [
    [[0.46, 0], [0.6, 0.48], [0.68, 0.76], [0.73, 0.86], [0.77, 0.78], [0.87, 0.44], [1, 0]],
    [[0.14, 0], [0.3, 0.46], [0.4, 0.78], [0.47, 1], [0.53, 0.88], [0.61, 0.66], [0.76, 0]],
    [[-0.02, 0], [0.08, 0.34], [0.15, 0.52], [0.2, 0.6], [0.245, 0.56], [0.29, 0.62], [0.34, 0.55], [0.44, 0.44], [0.54, 0.24], [0.62, 0]],
  ];

  // a snow cap on everything above `line`, with a ragged lower edge
  function snowCaps(P: [number, number][], line: number, jag: number) {
    const caps: string[] = [];
    let seg: [number, number][] = [];
    const close = () => {
      const a = seg[0];
      const b = seg[seg.length - 1];
      const n = Math.max(3, Math.round((b[0] - a[0]) / 26));
      for (let k = 1; k < n; k++) seg.push([lerp(b[0], a[0], k / n), line + (k % 2 ? jag : -jag * 0.7)]);
      caps.push(seg.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z");
      seg = [];
    };
    for (let i = 1; i < P.length; i++) {
      const [ax, ay] = P[i - 1];
      const [bx, by] = P[i];
      if (ay < line !== by < line) {
        const c: [number, number] = [ax + ((bx - ax) * (line - ay)) / (by - ay), line];
        if (by < line) seg = [c];
        else {
          seg.push(c);
          close();
        }
      }
      if (by < line) seg.push([bx, by]);
    }
    return caps.join(" ");
  }

  function landmarks(unit: number, base: number, fw: number) {
    const ink = `stroke="#40302A" stroke-opacity=".35" stroke-linejoin="round"`;
    const mountain = (shape: [number, number][], x0: number, w: number, h: number, snow: number) => {
      const P = shape.map(([fx, fy]) => [x0 + fx * w, base - fy * h] as [number, number]);
      const d = P.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
      return (
        `<path d="${d}" fill="#D3DEEC" stroke-width="2.2" ${ink}/>` +
        `<path d="${snowCaps(P, base - snow * h, Math.max(8, h * 0.035))}" fill="#FFFFFF" stroke-width="2" ${ink}/>`
      );
    };
    let out = "";

    // Fishtail: right of the words, under the sun; on narrow screens it waits
    // just off to the right and drifts in as you walk
    const fh = unit * (mobile ? 0.46 : 0.56);
    const fwid = fh * 1.45;
    const fx0 = Math.max(clearB, VW * 0.4) + 90 - fwid * 0.47;
    out += mountain(FISHTAIL, fx0, fwid, fh, 0.6);

    // Everest group: for the high camps, two thirds of the way up
    const eh = unit * 0.64;
    const ew = eh * 2;
    const ex0 = Math.min(Math.max(maxCam * 0.1 * 0.65 + VW * 0.6 - ew / 2, fx0 + fwid * 0.8), fw - ew - 40);
    const snows = [0.6, 0.62, 0.42];
    EVEREST.forEach((shape, i) => (out += mountain(shape, ex0, ew, eh, snows[i])));
    return out;
  }

  function buildBackdrop() {
    const r = rng(42);
    const base = ground - VH * 0.04;

    // far: the snowy Himalaya, two rows
    const fw = Math.ceil(VW + maxCam * 0.1 + 300);
    let farSvg = "";
    for (const row of [0, 1]) {
      const fill = row === 0 ? "#DCE6F2" : "#BFCFE4";
      const hMin = row === 0 ? 0.32 : 0.18;
      const hMax = row === 0 ? 0.56 : 0.38;
      // size peaks from one unit so their shape holds on tall or huge screens
      const unit = Math.min(VH, Math.max(VW * 0.7, 600));
      let x = -120 - r() * 80;
      let pts: [number, number][] = [[x, VH]];
      const caps: string[] = [];
      while (x < fw + 200) {
        const h = unit * lerp(hMin, hMax, r());
        const wPeak = h * (1.35 + r() * 0.8);
        const vx = x;
        const vy = base - unit * 0.06 * r();
        const px = x + wPeak * (0.4 + r() * 0.2);
        const py = base - h;
        const ex = x + wPeak;
        pts.push([vx, vy], [lerp(vx, px, 0.55), lerp(vy, py, 0.55) + 12 * r()], [px, py]);
        // snow cap with a jagged lower edge
        const t = 0.34 + r() * 0.1;
        const lx = lerp(px, vx, t);
        const ly = lerp(py, vy, t);
        const rx = lerp(px, ex, t);
        const ry = lerp(py, base, t);
        caps.push(
          `M${px} ${py} L${lx} ${ly} L${lerp(lx, rx, 0.25)} ${ly - 10} L${lerp(lx, rx, 0.45)} ${ly + 6} L${lerp(lx, rx, 0.65)} ${ry - 12} L${lerp(lx, rx, 0.82)} ${ry + 4} L${rx} ${ry} Z`
        );
        x = ex;
      }
      pts.push([x, base], [x, VH]);
      const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(0)} ${p[1].toFixed(0)}`).join(" ") + " Z";
      farSvg += `<path d="${d}" fill="${fill}" stroke="#40302A" stroke-opacity=".35" stroke-width="2.2" stroke-linejoin="round"/>`;
      farSvg += `<path d="${caps.join(" ")}" fill="#FFFFFF" stroke="#40302A" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round"/>`;
      // the peaks you'd know stand between the two rows
      if (row === 0) farSvg += landmarks(unit, base, fw);
    }
    far.style.width = `${fw}px`;
    far.innerHTML = `<svg width="${fw}" height="${VH}" viewBox="0 0 ${fw} ${VH}">${farSvg}</svg>`;

    // mid: two rows of forested hills, the back row paler with distance. At
    // Basecamp they part into a valley behind the words, so the name sits on
    // open sky and the hills frame it instead of crowding it.
    const mw = Math.ceil(VW + maxCam * 0.3 + 300);
    const vc = (clearA + clearB) / 2;
    const vw = Math.max((clearB - clearA) * 0.28, VW * 0.14);
    const valley = (x: number) => (clearB > clearA ? Math.exp(-(((x - vc) / vw) ** 2) * 1.6) : 0);
    const backRidge = (x: number) =>
      base + VH * 0.05 - VH * (0.14 + 0.035 * Math.sin(x / 310 + 4) + 0.025 * Math.sin(x / 123 + 1)) * (1 - 0.45 * valley(x));
    const frontRidge = (x: number) =>
      base + VH * 0.05 - VH * (0.08 + 0.05 * Math.sin(x / 260) + 0.04 * Math.sin(x / 97 + 2) + 0.03 * Math.sin(x / 530 + 1)) * (1 - 0.75 * valley(x));
    const hill = (ridge: (x: number) => number) => {
      let d = `M0 ${VH}`;
      for (let x = 0; x <= mw; x += 20) d += ` L${x} ${ridge(x).toFixed(1)}`;
      return `${d} L${mw} ${VH} Z`;
    };
    // pines grow in groves with clearings between, tallest mid-grove
    const grove = (ridge: (x: number) => number, hMin: number, hVar: number, phase: number) => {
      let d = "";
      for (let x = 6; x < mw; x += 7 + r() * 12) {
        const g = Math.sin(x / 90 + phase) + 0.6 * Math.sin(x / 37 + phase * 3);
        const k = smooth(clamp((g + 0.2) / 0.9, 0, 1)) * (1 - valley(x));
        if (r() > k) continue;
        const y = ridge(x) + 3;
        const h = (hMin + r() * hVar) * (0.55 + 0.45 * k);
        const w = h * 0.3;
        // two tiers, so they read as spruce rather than sawtooth
        d += `M${(x - w).toFixed(1)} ${y.toFixed(1)} L${(x - w * 0.45).toFixed(1)} ${(y - h * 0.45).toFixed(1)} L${(x - w * 0.7).toFixed(1)} ${(y - h * 0.45).toFixed(1)} L${x.toFixed(1)} ${(y - h).toFixed(1)} L${(x + w * 0.7).toFixed(1)} ${(y - h * 0.45).toFixed(1)} L${(x + w * 0.45).toFixed(1)} ${(y - h * 0.45).toFixed(1)} L${(x + w).toFixed(1)} ${y.toFixed(1)} Z `;
      }
      return d;
    };
    // terraced fields stepped into the slopes down in the valley, where people
    // farm; they give out a couple of screens up the trail
    const terraces = (ridge: (x: number) => number, gap: number, rows: number, phase: number) => {
      let d = "";
      const end = VW * 2.2;
      for (let i = 1; i <= rows; i++) {
        let on = false;
        for (let x = 0; x <= Math.min(mw, end); x += 12) {
          const patch = Math.sin(x / 70 + phase + i * 1.7) + 0.5 * Math.sin(x / 29 + i) > 0.15 - (1 - x / end) * 0.4;
          const top = ridge(x);
          const y = top + gap * i * (0.8 + 0.2 * Math.sin(x / 150 + i));
          if (patch && y < base + VH * 0.04 && valley(x) < 0.6) {
            d += `${on ? "L" : "M"}${x} ${y.toFixed(1)} `;
            on = true;
          } else on = false;
        }
      }
      return d;
    };
    const tGap = clamp(VH * 0.024, 12, 22);
    // low scrub on the slopes: small clumps of rounded shrubs in the hill's own
    // green, a shade darker, so they read as part of the hill
    const scrub = (ridge: (x: number) => number, size: number) => {
      let d = "";
      for (let x = 20 + r() * 40; x < mw; x += 26 + r() * 70) {
        if (r() > 0.75 * (1 - valley(x))) continue;
        const y0 = ridge(x) + size * (0.4 + r() * 2.2);
        if (y0 > base + VH * 0.035) continue;
        for (let n = 2 + Math.floor(r() * 3), bx = x; n > 0; n--) {
          const w = size * (0.6 + r() * 0.7);
          const h = w * (0.45 + r() * 0.15);
          const y = y0 + (r() - 0.5) * 2;
          d += `M${(bx - w / 2).toFixed(1)} ${y.toFixed(1)} Q ${(bx - w / 2).toFixed(1)} ${(y - h).toFixed(1)} ${bx.toFixed(1)} ${(y - h).toFixed(1)} Q ${(bx + w / 2).toFixed(1)} ${(y - h).toFixed(1)} ${(bx + w / 2).toFixed(1)} ${y.toFixed(1)} Z `;
          bx += w * (0.45 + r() * 0.2);
        }
      }
      return d;
    };
    const scrubSize = mobile ? 9 : clamp(VH * 0.014, 9, 15);
    mid.style.width = `${mw}px`;
    mid.innerHTML = `<svg width="${mw}" height="${VH}" viewBox="0 0 ${mw} ${VH}" stroke-linejoin="round" stroke-linecap="round">
      <path d="${grove(backRidge, 12, 12, 2.1)}" fill="#8CB89B" stroke="#40302A" stroke-opacity=".2" stroke-width="1.2"/>
      <path d="${hill(backRidge)}" fill="#A6C8AF" stroke="#40302A" stroke-opacity=".22" stroke-width="2"/>
      <path d="${terraces(backRidge, tGap * 0.8, 3, 1.1)}" fill="none" stroke="#40302A" stroke-opacity=".15" stroke-width="1.4"/>
      <path d="${scrub(backRidge, scrubSize * 0.7)}" fill="#97BEA2" stroke="#40302A" stroke-opacity=".12" stroke-width="1.2"/>
      <path d="${grove(frontRidge, 18, 20, 0.4)}" fill="#5F9978" stroke="#40302A" stroke-opacity=".3" stroke-width="1.5"/>
      <path d="${hill(frontRidge)}" fill="#7DB08F" stroke="#40302A" stroke-opacity=".35" stroke-width="2"/>
      <path d="${terraces(frontRidge, tGap, 4, 3.4)}" fill="none" stroke="#40302A" stroke-opacity=".2" stroke-width="1.6"/>
      <path d="${scrub(frontRidge, scrubSize)}" fill="#6FA584" stroke="#40302A" stroke-opacity=".18" stroke-width="1.4"/>
    </svg>`;

    // morning mist lying in the valley at Basecamp; frame() thins it as the trail climbs
    if (clearB > clearA) {
      const blobs = [0.06, 0.27, 0.5, 0.72, 0.93]
        .map((x, i) => `radial-gradient(ellipse ${20 + (i % 2) * 5}% ${55 + (i % 3) * 5}% at ${x * 100}% ${55 + ((i * 7) % 3) * 6}%, #fff 40%, transparent 72%)`)
        .join(", ");
      mist.style.cssText = `width:${Math.round(VW * 1.3)}px;height:${Math.round(VH * 0.15)}px;top:${Math.round(base - VH * 0.26)}px;left:${Math.round(-VW * 0.15)}px;background:${blobs}`;
    } else mist.style.cssText = "display:none";

    // clouds
    const cw = Math.ceil(VW + maxCam * 0.18 + 400);
    const skyScale = clamp(VW / 1500, 1, 1.7);
    const cloud = (x: number, y: number, w: number) =>
      `<svg class="cloud" viewBox="0 0 160 70" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${w.toFixed(0)}px;animation-duration:${(10 + r() * 10).toFixed(1)}s;animation-delay:${(-r() * 10).toFixed(1)}s"><use href="#s-cloud"/></svg>`;
    // the first screen's clouds are placed so none drifts behind the name:
    // one high on the left, one under the sun, a small one far right
    // (on phones, just one by the sun)
    let cl = mobile
      ? cloud(VW * 0.58, VH * 0.15, 90)
      : cloud(VW * 0.05, VH * 0.13, 150 * skyScale) +
        cloud(Math.min(Math.max(nameR + 80, VW * 0.68), VW - 170 * skyScale), VH * 0.23, 190 * skyScale) +
        cloud(VW * 0.87, VH * 0.1, 105 * skyScale);
    for (let x = VW * 1.15; x < cw; x += 320 + r() * 520) {
      const w = ((mobile ? 90 : 120) + r() * 110) * skyScale;
      cl += cloud(x, VH * (0.06 + r() * 0.26), w);
    }
    clouds.style.width = `${cw}px`;
    clouds.innerHTML = cl;

    // near tree line: a breezy forest that thins out as the trail climbs
    const NEAR = 0.6;
    const nw = Math.ceil(VW + maxCam * NEAR + 300);
    const scale = mobile ? 0.6 : clamp(VH / 900, 0.75, 1.25);
    near.style.width = `${nw}px`;
    near.innerHTML = "";
    buckets = [];
    const bw = Math.max(VW, 600);
    for (let b0 = 0; b0 < nw; b0 += bw) {
      let html = "";
      for (let x = b0 + r() * 12; x < Math.min(b0 + bw, nw); x += 14 + r() * 22) {
        // where on the trail this patch of forest is seen
        const worldX = clamp((x - VW / 2) / NEAR + VW / 2, 0, worldW);
        const b = biomeAt(worldX, r());
        const lvl = elev(worldX) / maxLevel;
        const chance = b === "forest" ? 0.95 : b === "meadow" ? 0.6 : b === "rock" ? 0.4 : lvl < 0.8 ? 0.3 : 0.12;
        if (r() > chance) continue;
        const y = ground + 10;
        const lx = x - b0;
        const h0 = html.length;
        if (b === "forest" || (b === "meadow" && r() < 0.55)) {
          const greens = ["#5AA884", "#4E9B78", "#66B38E", "#468F6E"];
          if (r() < 0.82) html += tree("s-pine", lx, y, (80 + r() * 110) * scale, 0.53, greens[Math.floor(r() * 4)], r);
          else html += tree("s-rhodo", lx, y, (60 + r() * 40) * scale, 1, "#66AA7E", r);
        } else if (b === "meadow") html += tree("s-rhodo", lx, y, (50 + r() * 40) * scale, 1, "#77B283", r);
        else if (b === "rock") {
          const k = r();
          if (k < 0.5) html += tree("s-rock", lx, y - 4, (30 + r() * 40) * scale, 1.6, k < 0.25 ? "#B5A898" : "#A39584", r, "tree still");
          else if (k < 0.7) html += tree("s-cairn", lx, y - 4, (36 + r() * 24) * scale, 0.63, "", r, "tree still");
          else html += tree("s-pine-snow", lx, y, (60 + r() * 60) * scale, 0.53, "#4E8F72", r);
        } else if (lvl < 0.8 && r() < 0.6) html += tree("s-pine-snow", lx, y, (70 + r() * 70) * scale, 0.53, "#4E8F72", r);
        else html += tree("s-rock-snow", lx, y - 4, (30 + r() * 46) * scale, 1.6, "#A39584", r, "tree still");
        if (html.length > h0 && inClearing(x, treeTop)) html = html.slice(0, h0);
      }
      const el = document.createElement("div");
      el.className = "near-bucket";
      el.style.cssText = `left:${b0}px;width:${bw}px`;
      el.innerHTML = html;
      near.appendChild(el);
      buckets.push({ el, x0: b0, x1: b0 + bw, shown: true });
    }

    // stars
    let st = "";
    for (let i = 0; i < 70; i++) {
      const s = 1.5 + r() * 2.5;
      st += `<i style="left:${(r() * 100).toFixed(2)}%;top:${(r() * 60).toFixed(2)}%;width:${s.toFixed(1)}px;height:${s.toFixed(1)}px;animation-delay:${(-r() * 3).toFixed(2)}s"></i>`;
    }
    stars.innerHTML = st;
  }

  function buildSummitFlags() {
    const summit = L.find((s) => s.d.id === "summit");
    const pole = summit?.el.querySelector<HTMLElement>("[data-flag-anchor]");
    if (!summit || !pole) return;
    summit.el.querySelector(".summit-flags")?.remove();
    // offset* ignores the grow-in transform on plants
    const px = pole.offsetLeft + pole.offsetWidth / 2;
    const py = pole.offsetTop + 8;
    const size = mobile ? 12 : 17;
    const w = summit.w;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "summit-flags");
    svg.setAttribute("viewBox", `0 0 ${w} ${VH}`);
    // every string is pegged to the ground, some on each side of the pole. Desktop: two
    // down the slope just climbed, one short and steep to the right that stops shy of
    // the contact copy. Phones: one between Yakku's cairn and the pole, one down the far side.
    const groundAt = (x: number) => ground + summit.level - elev(summit.x0 + x);
    const copy = summit.el.querySelector<HTMLElement>(".summit");
    const copyLeft = copy ? (copy.offsetParent as HTMLElement).offsetLeft + copy.offsetLeft : w * 0.45;
    const yakRight = VW * yakFrac + yakW * 0.55;
    const ends = mobile
      ? [px - (px - yakRight) * 0.45, w + gapW * 0.5]
      : [-gapW * 0.35, -gapW * 1.1, px + (copyLeft - px) * 0.72];
    svg.innerHTML = ends
      .map((x, i) => {
        const y = groundAt(x) - 3;
        const sag = Math.min(60, Math.abs(x - px) * 0.06) + i * 6;
        const stake = `<path d="M${x.toFixed(1)} ${(y - 16).toFixed(1)} V ${(y + 4).toFixed(1)}" stroke="#40302A" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="${(x + 5).toFixed(1)}" cy="${(y + 3).toFixed(1)}" rx="8" ry="5" fill="#A79C90" stroke="#40302A" stroke-width="2"/>`;
        return flagString(px, py, x, y - 14, sag, size) + stake;
      })
      .join("");
    summit.el.querySelector(".scene")!.prepend(svg);
  }

  /* ---------------- trail map ---------------- */

  function buildMap() {
    let d = "";
    for (let i = 0; i <= 100; i++) {
      const x = (i / 100) * worldW;
      d += `${i ? "L" : "M"}${i} ${(27 - (elev(x) / maxLevel) * 23).toFixed(2)} `;
    }
    mapLine.innerHTML = `<path d="${d}" fill="none" stroke="#40302A" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    mapStops.forEach((li, i) => {
      const s = L[i];
      if (!s) return;
      const x = s.x0 + VW * yakFrac;
      li.style.left = `${(x / worldW) * 100}%`;
      li.style.top = `${((27 - (s.level / maxLevel) * 23) / 30) * 100}%`;
    });
  }

  /* ---------------- cloud bank ---------------- */

  // A bank three viewports wide: billowy leading edge, a solid core the width
  // of the screen, billowy trailing edge, with wisps streaming through it. It
  // is all soft gradients, so it's painted once per layout into small bitmaps
  // and composited on a low-res canvas each frame that the browser scales up.
  // Repainting a masked, three-viewport layer every frame lagged on phones.
  type Wisp = { alpha: number; dur: number; rev: boolean; blobs: [number, number, number, number, string][] };
  // [radius x, radius y, centre x, centre y] as fractions of a one-viewport tile
  const WISPS: Wisp[] = [
    {
      alpha: 1,
      dur: 11,
      rev: false,
      blobs: [
        [0.28, 0.2, 0.18, 0.2, "255,255,255,0.9"],
        [0.32, 0.24, 0.62, 0.48, "255,255,255,0.85"],
        [0.26, 0.2, 0.3, 0.85, "255,255,255,0.9"],
        [0.22, 0.16, 0.88, 0.82, "255,255,255,0.85"],
      ],
    },
    {
      alpha: 0.75,
      dur: 15,
      rev: true,
      blobs: [
        [0.36, 0.14, 0.4, 0.14, "232,238,245,0.9"],
        [0.3, 0.18, 0.08, 0.58, "240,244,249,0.85"],
        [0.34, 0.16, 0.75, 0.72, "236,241,247,0.9"],
      ],
    },
    {
      // low, dense foreground scud that rushes past
      alpha: 0.9,
      dur: 7,
      rev: false,
      blobs: [
        [0.3, 0.22, 0.2, 0.96, "255,255,255,0.95"],
        [0.24, 0.18, 0.7, 1, "255,255,255,0.95"],
        [0.14, 0.3, 0.96, 0.4, "255,255,255,0.7"],
      ],
    },
  ];
  // billows on the bank's edges: [x, y, w, h] as in CSS background-position / size
  const BILLOWS = [
    [0.17, 0.22, 0.16, 0.38],
    [0.21, 0.62, 0.14, 0.34],
    [0.13, 0.92, 0.18, 0.4],
    [0.81, 0.18, 0.15, 0.36],
    [0.85, 0.56, 0.17, 0.4],
    [0.79, 0.9, 0.14, 0.34],
  ];
  let fogS = 1; // canvas px per css px
  let fogMask: HTMLCanvasElement | null = null;
  let fogPats: CanvasPattern[] = [];
  let fogTileW = 1; // css px per wisp tile, after rounding to whole canvas px

  function softEllipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rgba: string, from = 0) {
    c.save();
    c.translate(x, y);
    c.scale(rx, ry);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    const [r, gg, b, a] = rgba.split(",");
    g.addColorStop(from, `rgba(${r},${gg},${b},${a})`);
    g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    c.fillStyle = g;
    c.fillRect(-1, -1, 2, 2);
    c.restore();
  }

  function buildFog() {
    fogS = Math.min(0.5, 480 / VW);
    fog.width = Math.max(1, Math.round(VW * fogS));
    fog.height = Math.max(1, Math.round(VH * fogS));
    const tw = Math.max(1, Math.round(VW * fogS));
    const th = Math.max(1, Math.round(VH * 1.24 * fogS));
    fogTileW = tw / fogS;

    // the bank's shape: faded ends plus billows, as an alpha mask
    const m = document.createElement("canvas");
    m.width = tw * 3;
    m.height = th;
    const mc = m.getContext("2d")!;
    const lg = mc.createLinearGradient(0, 0, m.width, 0);
    lg.addColorStop(0.04, "rgba(0,0,0,0)");
    lg.addColorStop(0.29, "#000");
    lg.addColorStop(0.71, "#000");
    lg.addColorStop(0.96, "rgba(0,0,0,0)");
    mc.fillStyle = lg;
    mc.fillRect(0, 0, m.width, m.height);
    for (const [px, py, sw, sh] of BILLOWS) {
      const w = sw * m.width;
      const h = sh * m.height;
      softEllipse(mc, (m.width - w) * px + w / 2, (m.height - h) * py + h / 2, w / 2, h / 2, "0,0,0,1", 0.4);
    }
    fogMask = m;

    // wisp tiles, painted wrapped around the edges so they repeat without seams
    fogPats = WISPS.map((wisp) => {
      const t = document.createElement("canvas");
      t.width = tw;
      t.height = th;
      const tc = t.getContext("2d")!;
      for (const [rx, ry, cx, cy, col] of [...wisp.blobs].reverse()) {
        for (const k of [-1, 0, 1]) softEllipse(tc, (cx + k) * tw, cy * th, rx * tw, ry * th, col);
      }
      return fogCtx.createPattern(t, "repeat-x")!;
    });
  }

  function drawFog(bankX: number, now: number) {
    if (!fogMask) return;
    const c = fogCtx;
    const s = fogS;
    const x0 = bankX * s;
    const y0 = -0.12 * VH * s;
    const w = fogMask.width;
    const h = fogMask.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.clearRect(0, 0, fog.width, fog.height);
    c.save();
    c.beginPath();
    c.rect(x0, y0, w, h);
    c.clip();
    const bg = c.createLinearGradient(0, y0, 0, y0 + h);
    bg.addColorStop(0, "rgba(238,243,248,0.82)");
    bg.addColorStop(0.65, "rgba(250,251,252,0.97)");
    c.fillStyle = bg;
    c.fillRect(0, 0, fog.width, fog.height);
    // wisps stream past faster than the bank, nearer layers faster still,
    // and bob a little on their own
    WISPS.forEach((wisp, i) => {
      const off = (cam * (0.25 + i * 0.35)) % fogTileW;
      const ph = (now / 1000 / wisp.dur) % 2;
      let p = ph < 1 ? ph : 2 - ph;
      if (wisp.rev) p = 1 - p;
      const ty = y0 - 0.03 * h * smooth(p);
      fogPats[i].setTransform(new DOMMatrix([1, 0, 0, 1, x0 - off * s, ty]));
      c.globalAlpha = wisp.alpha;
      c.fillStyle = fogPats[i];
      c.fillRect(0, ty, fog.width, h);
    });
    c.globalAlpha = 1;
    c.globalCompositeOperation = "destination-in";
    c.drawImage(fogMask, x0, y0);
    c.restore();
    c.globalCompositeOperation = "source-over";
  }

  /* ---------------- weather ---------------- */

  const parts: Particle[] = [];
  let wind = 0.3;
  let gust = 0;
  let gustUntil = 0;
  let nextGust = performance.now() + 5000;

  function spawn(kind: Particle["kind"], x: number, y: number) {
    const leafColors = ["#7DBE8C", "#B5CF7A", "#FFD166"];
    const p: Particle = {
      x,
      y,
      vx: 0,
      vy: 0,
      r: 2,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 3,
      kind,
      color: "#FFFFFF",
      life: 1,
      depth: 0.5 + Math.random() * 0.7,
      ph: Math.random() * 6.28,
      sw: 0.7 + Math.random() * 0.9,
    };
    if (kind === "snow") {
      // most flakes are far off: small, slow and faint; the few near ones are big, quick and inked
      p.depth = 0.3 + Math.random() ** 1.5 * 1.05;
      p.r = 0.8 + p.depth * 2.6 + Math.random() * 0.6;
      p.vy = 26 + p.depth * 34 + Math.random() * 10;
      p.vr = 0;
    } else if (kind === "leaf" || kind === "petal") {
      p.r = 4 + Math.random() * 3;
      p.vy = 24 + Math.random() * 26;
      p.color = kind === "petal" ? (Math.random() < 0.5 ? "#EF476F" : "#F47A95") : leafColors[Math.floor(Math.random() * 3)];
    } else if (kind === "confetti") {
      p.r = 4 + Math.random() * 4;
      p.vx = (Math.random() - 0.5) * 260;
      p.vy = -120 - Math.random() * 380;
      p.color = [...LUNGTA, "#E85D2F"][Math.floor(Math.random() * 6)];
      p.depth = 1;
    } else if (kind === "puff") {
      p.r = 3 + Math.random() * 4;
      p.vx = (Math.random() - 0.5) * 30;
      p.vy = -20 - Math.random() * 20;
      p.depth = 1;
    }
    parts.push(p);
  }

  function confetti() {
    for (let i = 0; i < 140; i++) spawn("confetti", VW * (0.2 + Math.random() * 0.6), VH * (0.25 + Math.random() * 0.3));
  }

  function weather(dt: number, now: number, camVel: number, biome: Biome, level: number, moving: boolean, faceDir: number) {
    // breeze + gusts
    if (now > nextGust) {
      gustUntil = now + 2600;
      nextGust = now + 8000 + Math.random() * 7000;
      root.classList.add("gust");
    }
    if (gustUntil && now > gustUntil) {
      gustUntil = 0;
      root.classList.remove("gust");
    }
    gust += ((gustUntil ? 1 : 0) - gust) * (1 - Math.exp(-2.5 * dt));
    wind = 18 + gust * 120;

    const density =
      biome === "snow" ? 70 + level * 90 : biome === "rock" ? 22 : biome === "meadow" ? 14 : 10;
    const target = Math.round((density * VW) / 1440);
    const ambient = parts.filter((p) => p.kind !== "confetti" && p.kind !== "puff").length;
    const deficit = target - ambient;
    if (deficit > 0 && Math.random() < 0.6) {
      // the sky fills from wherever the air is coming from: upwind, or ahead of the yak when he walks
      const drift = wind * 0.8 - camVel * 0.5;
      const fromSide = Math.random() < Math.min(0.75, 0.15 + Math.abs(drift) / 260);
      // far short (a deep link, a teleport): fill the whole view at once, fading in
      const scatter = deficit > target * 0.5;
      for (let n = Math.min(scatter ? 6 : 2, deficit); n > 0; n--) {
        const kind = biome === "snow" || biome === "rock" ? "snow" : biome === "meadow" ? (Math.random() < 0.6 ? "petal" : "leaf") : Math.random() < 0.25 ? "petal" : "leaf";
        if (scatter) spawn(kind, Math.random() * VW, Math.random() * VH * 0.9);
        else if (fromSide) spawn(kind, drift >= 0 ? -10 : VW + 10, Math.random() * VH * 0.7);
        else spawn(kind, (Math.random() * 1.3 - 0.15) * VW, -10);
        const p = parts[parts.length - 1];
        p.life = 0.01;
        p.vx = wind * p.depth;
      }
    }

    if (moving && Math.random() < 0.35) {
      spawn("puff", VW * yakFrac - faceDir * yakW * 0.3 + (Math.random() - 0.5) * 20, ground - 4);
      parts[parts.length - 1].color = biome === "snow" ? "#FFFFFF" : biome === "rock" ? "#D8D0C4" : "#E9DCC2";
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VW, VH);

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.kind === "confetti") {
        p.vy += 520 * dt;
        p.vx *= 0.99;
        p.life -= dt * 0.33;
      } else if (p.kind === "puff") {
        p.life -= dt * 1.6;
        p.r += dt * 10;
      } else {
        // ease into the wind rather than snapping to it, so a gust sweeps through and lets go
        const sway = Math.sin((now / 1000) * p.sw * 1.6 + p.ph) * (p.kind === "snow" ? 6 + p.depth * 12 : 14);
        p.vx += (wind * p.depth + sway - p.vx) * (1 - Math.exp(-(p.kind === "snow" ? 2.2 : 4) * dt));
        p.life = Math.min(1, p.life + dt * 1.5);
      }
      p.x += (p.vx - camVel * p.depth * 0.6) * dt;
      p.y += p.vy * dt * (p.kind === "snow" ? p.depth : 1);
      p.rot += p.vr * dt;

      if (p.y > VH + 20 || p.x < -60 || p.x > VW + 60 || p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = p.kind === "puff" ? Math.max(p.life, 0) * 0.8 : Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = "rgba(64,48,42,0.35)";
      ctx.lineWidth = 1.2;
      if (p.kind === "snow") {
        // distance reads as haze: far flakes fade back, only the near ones get an ink outline
        ctx.globalAlpha *= Math.min(1, 0.5 + p.depth * 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
        if (p.depth > 0.75) {
          ctx.globalAlpha *= Math.min(1, (p.depth - 0.75) * 3);
          ctx.stroke();
        }
      } else if (p.kind === "puff") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        if (p.kind === "confetti") ctx.rect(-p.r / 2, -p.r, p.r, p.r * 1.8);
        else ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, 6.283);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // wind streaks during a gust
    if (gust > 0.08) {
      ctx.globalAlpha = gust * 0.55;
      ctx.strokeStyle = "#FFFDF6";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let k = 0; k < 4; k++) {
        const y = VH * (0.18 + k * 0.13);
        const off = ((now / 3 + k * 340) % (VW + 400)) - 200;
        ctx.beginPath();
        ctx.moveTo(off, y);
        ctx.bezierCurveTo(off + 60, y - 14, off + 120, y + 14, off + 180, y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- the yak ---------------- */

  let quipTimer = 0;
  let lastLine = "";
  const pick = (arr: readonly string[]) => {
    let line = arr[Math.floor(Math.random() * arr.length)];
    if (arr.length > 1 && line === lastLine) line = arr[(arr.indexOf(line) + 1) % arr.length];
    lastLine = line;
    return line;
  };
  function speak(text: string, ms = 3400) {
    if (tween?.quiet) return; // the quick walk (W) is a silent stroll
    quip.textContent = text;
    quip.classList.add("show");
    window.clearTimeout(quipTimer);
    quipTimer = window.setTimeout(() => quip.classList.remove("show"), ms);
  }
  window.addEventListener("yak:say", (e) => speak((e as CustomEvent<string>).detail));

  const sound = createSound();
  const setSoundUi = () => {
    soundBtn.setAttribute("aria-pressed", String(sound.on));
    soundBtn.classList.toggle("is-on", sound.on);
  };
  const isShortcut = (e: KeyboardEvent, key: string) => {
    const t = e.target as HTMLElement;
    return (
      e.key.toLowerCase() === key &&
      !(e.metaKey || e.ctrlKey || e.altKey) &&
      !/INPUT|TEXTAREA|SELECT/.test(t.tagName) &&
      !t.isContentEditable
    );
  };
  const isMuteKey = (e: KeyboardEvent) => isShortcut(e, "m");
  // remember the choice, but browsers only allow audio after a gesture
  const wake = (e: Event) => {
    // a press on the button itself is handled by its click, or it'd turn on then straight off
    if (e.target instanceof Node && soundBtn.contains(e.target)) return;
    if (e instanceof KeyboardEvent && isMuteKey(e)) return;
    stopWaking();
    sound.enable();
    setSoundUi();
  };
  const stopWaking = () => {
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
  };
  if (localStorage.getItem("yak-sound") === "on") {
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
  }
  const toggleSound = () => {
    stopWaking();
    if (sound.on) sound.disable();
    else sound.enable();
    localStorage.setItem("yak-sound", sound.on ? "on" : "off");
    setSoundUi();
    if (sound.on) speak("Listen… that's the mountain.");
  };
  soundBtn.addEventListener("click", toggleSound);
  // M mutes or unmutes from anywhere
  window.addEventListener("keydown", (e) => {
    if (!isMuteKey(e) || e.repeat) return;
    e.preventDefault();
    toggleSound();
  });
  document.addEventListener("visibilitychange", () => sound.suspend(document.hidden));

  // poke him. poke him ten times and see what happens.
  let pokeCount = 0;
  let lastPoke = 0;
  let grumpyUntil = 0;
  const warnings: Record<number, string> = {
    5: "Okay, that's plenty of boops.",
    7: "I'm warning you.",
    9: "One. More. Time.",
  };
  yakBtn.addEventListener("click", () => {
    const now = performance.now();
    if (now < grumpyUntil) {
      speak("…");
      return;
    }
    pokeCount = now - lastPoke > 4000 ? 1 : pokeCount + 1;
    lastPoke = now;
    restAt = now;
    if (pokeCount >= 10) {
      pokeCount = 0;
      grumpyUntil = now + 9000;
      setPose("grumpy");
      sound.bleat();
      speak("That's it. I'm on strike.", 4200);
      window.setTimeout(() => {
        if (performance.now() >= grumpyUntil - 50) speak("…fine. Friends again?");
      }, 9100);
      return;
    }
    yak.classList.remove("is-boing");
    void yak.getBoundingClientRect();
    yak.classList.add("is-boing");
    window.setTimeout(() => yak.classList.remove("is-boing"), 700);
    sound.bell();
    speak(warnings[pokeCount] ?? pick(pokes));
  });

  /* ---------------- travel ---------------- */

  let tween: { from: number; to: number; t0: number; dur: number; ease?: (t: number) => number; quiet?: boolean } | null = null;
  const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  // gentler peak (about 1.6x the average speed, vs 3x) so a long tween stays a walk, not a run
  const easeSine = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

  function camFor(i: number) {
    return clamp(L[i].x0, 0, maxCam);
  }
  function travelTo(i: number, instant = false) {
    const to = camFor(clamp(i, 0, L.length - 1));
    if (instant) {
      window.scrollTo(0, to);
      cam = to;
      return;
    }
    const from = window.scrollY;
    tween = { from, to, t0: performance.now(), dur: clamp(Math.abs(to - from) * 0.28, 500, 2600) };
  }
  const indexOf = (id: string) => L.findIndex((s) => s.d.id === id);
  const currentIndex = () => {
    const y = window.scrollY;
    let best = 0;
    L.forEach((s, i) => {
      if (Math.abs(camFor(i) - y) < Math.abs(camFor(best) - y)) best = i;
    });
    return best;
  };

  document.querySelectorAll<HTMLElement>("[data-go]").forEach((el) =>
    el.addEventListener("click", (e) => {
      const i = indexOf(el.dataset.go!);
      if (i < 0) return;
      e.preventDefault();
      pauseTour();
      travelTo(i);
      history.replaceState(null, "", `#${el.dataset.go}`);
    })
  );

  const cancelTween = () => {
    tween = null;
    cancelShot();
  };
  window.addEventListener("wheel", cancelTween, { passive: true });
  window.addEventListener("touchstart", cancelTween, { passive: true });

  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const y = tween ? tween.to : window.scrollY;
      let i: number;
      if (e.key === "ArrowRight") {
        i = L.findIndex((_, k) => camFor(k) > y + 8);
        if (i < 0) i = L.length - 1;
      } else {
        i = -1;
        L.forEach((_, k) => camFor(k) < y - 8 && (i = k));
        if (i < 0) i = 0;
      }
      travelTo(i);
    } else cancelTween();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" && e.key !== "Enter" && e.key !== "Shift") cancelShot();
  });

  // trackpad sideways swipes and horizontal touch swipes walk the trail too
  window.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) {
        e.preventDefault();
        window.scrollBy(0, e.deltaX);
      }
    },
    { passive: false }
  );
  let tx = 0;
  let ty = 0;
  let swipe: boolean | null = null;
  window.addEventListener(
    "touchstart",
    (e) => {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
      swipe = null;
    },
    { passive: true }
  );
  window.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      const dx = t.clientX - tx;
      const dy = t.clientY - ty;
      if (swipe === null && Math.abs(dx) + Math.abs(dy) > 8) swipe = Math.abs(dx) > Math.abs(dy);
      if (swipe && !(e.target as HTMLElement).closest("[data-deck]")) {
        e.preventDefault();
        window.scrollBy(0, -dx * 1.4);
        tx = t.clientX;
        ty = t.clientY;
      }
    },
    { passive: false }
  );

  // keyboard focus: bring whatever got focus into view
  document.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement;
    if (!el.closest(".stop")) return;
    trek.scrollLeft = 0;
    trek.scrollTop = 0;
    const r = el.getBoundingClientRect();
    if (r.left < VW * 0.05 || r.right > VW * 0.97) {
      const worldX = r.left + cam;
      const to = clamp(worldX - VW * (mobile ? 0.08 : 0.3), 0, maxCam);
      tween = { from: window.scrollY, to, t0: performance.now(), dur: 450 };
    }
  });

  /* ---------------- guided tour: Yakku walks you up and talks you through it ---------------- */

  const tourBtn = $<HTMLButtonElement>("#hud-tour");
  const tourLabel = $("#hud-tour-label");
  type Tour = {
    i: number; // stop
    k: number; // page within the stop (phones read wide stops a screen at a time)
    phase: "walk" | "read";
    to: number; // camera position for this page
    t: number; // ms spent reading so far
    dwell: number; // ms to stay on this page
    cues: { at: number; text: string; ms: number }[];
  };
  let tour: Tour | null = null;
  let tourPaused = false;
  let tourDone = false;
  let tourP = -1;
  // some stops need longer than their text suggests: the notes shuffle, the summit pulls back
  const TOUR_MIN: Record<string, number> = { hikers: 9000, summit: 9500 };

  // the notes hang on one long line: stop once, halfway along, rather than page through
  const TOUR_CENTER = new Set(["notes"]);

  function tourPages(i: number) {
    const a = camFor(i);
    const b = clamp(L[i].x0 + L[i].w - VW, a, maxCam);
    if (TOUR_CENTER.has(L[i].d.id)) return [(a + b) / 2];
    const n = b - a > VW * 0.15 ? Math.ceil((b - a) / VW) + 1 : 1;
    return Array.from({ length: n }, (_, k) => (n === 1 ? a : lerp(a, b, k / (n - 1))));
  }

  /** words of the stop's copy currently on screen, to size the reading pause */
  function wordsInView(el: HTMLElement) {
    let n = 0;
    const walker = document.createTreeWalker(el.querySelector(".content") ?? el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent!.trim();
      if (!text) continue;
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width && r.right > VW * 0.04 && r.left < VW * 0.96 && r.bottom > 0 && r.top < VH) n += text.split(/\s+/).length;
    }
    return n;
  }

  function tourWalk(t: Tour) {
    const pages = tourPages(t.i);
    t.k = Math.min(t.k, pages.length - 1);
    t.to = pages[t.k];
    t.phase = "walk";
    const from = window.scrollY;
    const d = Math.abs(t.to - from);
    if (d < 3) return tourRead(t);
    // forward is a stroll; heading back to the start is a quick hop
    tween =
      t.to > from
        ? { from, to: t.to, t0: performance.now(), dur: clamp((d / (mobile ? 680 : 1050)) * 1000, 800, 9000), ease: easeSine }
        : { from, to: t.to, t0: performance.now(), dur: clamp(d * 0.28, 500, 2600) };
  }

  function tourRead(t: Tour) {
    const s = L[t.i];
    const n = tourPages(t.i).length;
    const all = tourLines[s.d.id] ?? [];
    const lines = all.filter((_, j) => Math.min(n - 1, Math.floor((j * n) / all.length)) === t.k);
    let at = 200; // let him settle before he talks
    t.cues = lines.map((text) => {
      const ms = clamp(900 + text.length * 34, 2000, 4200);
      const cue = { at, text, ms };
      at += ms + 120;
      return cue;
    });
    // skim pace (~650 wpm): the tour is a walkthrough, and they can pause to read closer
    const read = clamp(800 + wordsInView(s.el) * 92, 2000, 8000);
    // the summit only needs its long hold when the look-back is going to play
    const min = s.d.id === "summit" && !(revealDue() && !summitParty) ? 0 : TOUR_MIN[s.d.id] ?? 0;
    t.dwell = Math.max(read, at + 200, t.k === n - 1 ? min : 0);
    t.phase = "read";
    t.t = 0;
  }

  function tourTick(dt: number) {
    if (!tour || tourPaused) return;
    const t = tour;
    if (t.phase === "walk") {
      if (tween) return;
      // something cut the walk short (a stray key, a tap): carry on walking
      if (Math.abs(scrollPos - t.to) > 3) return tourWalk(t);
      tourRead(t);
    }
    // they scrolled off on their own: hand them the controls
    if (Math.abs(scrollPos - t.to) > 40) return pauseTour();
    const before = t.t;
    t.t += dt * 1000;
    for (const c of t.cues) if (c.at >= before && c.at < t.t) speak(c.text, c.ms);
    setTourProgress(t.t / t.dwell);
    if (t.t < t.dwell) return;
    if (t.k < tourPages(t.i).length - 1) t.k++;
    else if (t.i < L.length - 1) {
      t.i++;
      t.k = 0;
    } else return endTour(true);
    setTourProgress(0);
    tourWalk(t);
  }

  function startTour() {
    const y = window.scrollY;
    const steps = L.flatMap((_, i) => tourPages(i).map((x, k) => ({ i, k, x })));
    // pick up from here: the page we're on, else the next one ahead; from the very end, start over
    let st = steps.find((p) => Math.abs(p.x - y) < 40) ?? steps.find((p) => p.x > y);
    if (!st || st === steps[steps.length - 1]) st = steps[0];
    tour = { i: st.i, k: st.k, phase: "walk", to: st.x, t: 0, dwell: 1, cues: [] };
    tourPaused = false;
    tourDone = false;
    cancelShot();
    setTourProgress(0);
    tourWalk(tour);
    setTourUi();
  }

  /** user input pauses; the button's pause also stops him mid-stride */
  function pauseTour(halt = false) {
    if (!tour || tourPaused) return;
    tourPaused = true;
    if (halt) tween = null;
    setTourUi();
  }

  function resumeTour() {
    if (!tour) return startTour();
    // still on the page we paused on: finish reading it; wandered off: carry on from there
    if (tour.phase === "read" && Math.abs(scrollPos - tour.to) <= 40) {
      tourPaused = false;
      setTourUi();
    } else startTour();
  }

  function endTour(done = false) {
    tour = null;
    tourPaused = false;
    tourDone = done;
    setTourProgress(0);
    setTourUi();
  }

  function setTourProgress(p: number) {
    const v = Math.round(clamp(p, 0, 1) * 200) / 200;
    if (v === tourP) return;
    tourP = v;
    tourBtn.style.setProperty("--p", String(v));
  }

  function setTourUi() {
    const state = !tour ? "idle" : tourPaused ? "paused" : "playing";
    const label = state === "playing" ? "pause tour" : state === "paused" ? "resume tour" : tourDone ? "tour again" : "take the tour";
    tourBtn.dataset.state = state;
    tourBtn.setAttribute("aria-pressed", String(state === "playing"));
    tourBtn.setAttribute("aria-label", label[0].toUpperCase() + label.slice(1));
    tourLabel.textContent = label;
    root.classList.toggle("is-touring", state === "playing");
  }

  const toggleTour = () => {
    if (tour && !tourPaused) pauseTour(true);
    else resumeTour();
  };
  tourBtn.addEventListener("click", toggleTour);

  // P plays/pauses, Esc stops; anything that moves the camera hands control back
  const NAV_KEYS = new Set(["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Tab"]);
  window.addEventListener("keydown", (e) => {
    if (isShortcut(e, "p") && !e.repeat) {
      e.preventDefault();
      toggleTour();
    } else if (e.key === "Escape" && tour) endTour();
    else if (NAV_KEYS.has(e.key) && !(e.key === " " && (e.target as HTMLElement).closest("button, a"))) pauseTour();
  });
  window.addEventListener("wheel", () => pauseTour(), { passive: true });
  window.addEventListener("touchmove", () => pauseTour(), { passive: true });
  setTourUi();

  // steady pace: ease in and out over the first and last 6%, constant speed in between
  // (a sine ease peaks at 1.6x the average, which reads as a sprint mid-trail)
  const easeSteady = (t: number) => {
    const a = 0.06;
    const v = 1 / (1 - a);
    if (t < a) return (v * t * t) / (2 * a);
    if (t > 1 - a) return 1 - (v * (1 - t) ** 2) / (2 * a);
    return v * (t - a / 2);
  };

  // W: back to the trailhead, then one unbroken walk to the end of the trail. No reading stops, no chatter;
  // any key, wheel or touch stops it (the travel handlers above drop the tween)
  window.addEventListener("keydown", (e) => {
    if (!isShortcut(e, "w") || e.repeat) return;
    e.preventDefault();
    if (tour) endTour();
    cancelShot();
    quip.classList.remove("show");
    window.scrollTo(0, 0);
    cam = 0;
    // slower than the tour's stroll, so he walks the whole way and never breaks into a run
    tween = { from: 0, to: maxCam, t0: performance.now(), dur: (maxCam / (mobile ? 430 : 680)) * 1000, ease: easeSteady, quiet: true };
  });

  /* ---------------- main loop ---------------- */

  let cam = 0;
  let lastT = 0;
  let face = 1;
  let pose = "";
  let isMoving = false; // hysteresis: entering and leaving "moving" at different speeds stops sit/stand flip-flop
  let gaitRun = false; // same trick between walk and run
  let smSpeed = 0; // low-passed travel speed: thresholds on the raw signal chatter with bursty scroll input
  let walkAnims: CSSAnimation[] = [];
  let walkAnimsPose = "";
  let restAt = performance.now();
  let arrived = "";
  let summitParty = false;
  // the summit look-back ("look how far you've climbed") plays once a day, not every climb
  const today = () => new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
  const revealDue = () => {
    try {
      return localStorage.getItem("yak-summit-reveal") !== today();
    } catch {
      return true;
    }
  };
  let lastAlt = -1;
  let lastPlace = "";
  let lastS = -1;

  function setPose(p: string) {
    if (p === pose) return;
    pose = p;
    yak.dataset.pose = p;
  }

  /* ---------------- camera shots: the opening drop + the summit look-back ---------------- */

  type Shot = {
    kind: "reveal";
    t0: number;
    inDur: number;
    hold: number;
    outDur: number;
    s: number;
    fx: number;
    fy: number;
    dy: number;
    cancelAt?: number;
    cancelK?: number;
    k: number;
  };
  let shot: Shot | null = null;

  function cancelShot() {
    if (!shot || shot.cancelAt !== undefined) return;
    shot.cancelAt = performance.now();
    shot.cancelK = shot.k;
  }

  function shotK(now: number) {
    const sh = shot!;
    let k: number;
    if (sh.cancelAt !== undefined) {
      const t = (now - sh.cancelAt) / 650;
      k = t >= 1 ? -1 : sh.cancelK! * (1 - easeInOut(t));
    } else {
      const t = now - sh.t0;
      if (t < sh.inDur) k = easeInOut(t / sh.inDur);
      else if (t < sh.inDur + sh.hold) k = 1;
      else {
        const o = (t - sh.inDur - sh.hold) / sh.outDur;
        k = o >= 1 ? -1 : 1 - easeInOut(o);
      }
    }
    if (k < 0) {
      shot = null;
      return 0;
    }
    sh.k = k;
    return k;
  }

  function startReveal() {
    try {
      localStorage.setItem("yak-summit-reveal", today());
    } catch {}
    // pull back from the summit so the slope you just climbed comes into view
    const sum = L[indexOf("summit")];
    const yx = sum.x0 + VW * yakFrac;
    shot = {
      kind: "reveal",
      t0: performance.now(),
      inDur: 1800,
      hold: tour ? 3600 : 6200, // the tour keeps moving; TOUR_MIN.summit covers the whole shot
      outDur: 1600,
      s: mobile ? 0.45 : 0.5,
      fx: yx - VW * 0.35,
      fy: ground - sum.level - VH * 0.1,
      dy: 0,
      k: 0,
    };
    sound.whoosh();
  }

  /* ---------------- the trail map that unfolds at the top ---------------- */

  const TRAIL = "M150 520 C 260 512 330 500 360 486 C 300 470 250 456 262 440 C 300 424 400 418 446 400 C 380 380 330 362 352 344 C 400 328 470 318 500 300 C 452 280 420 262 436 244 C 470 228 520 220 540 204 C 506 186 484 168 500 152 C 520 138 540 128 548 112 C 538 98 540 84 552 70";
  let mapRaf = 0;
  function showTrailmap() {
    trailmap.classList.add("show");
    trailmapSvg.setAttribute("viewBox", mobile ? "70 30 700 530" : "0 0 1000 560");
    const flags = data.filter((d) => d.id !== "night");
    const altMin = flags[0].altitude;
    const altMax = flags[flags.length - 1].altitude;
    let pines = "";
    for (let x = 70; x < 940; x += 18 + ((x * 7) % 11)) {
      const y = 548 - ((x * 13) % 9);
      pines += `M${x - 7} ${y} L${x} ${y - 20} L${x + 7} ${y} Z `;
    }
    trailmapSvg.innerHTML = `
      <defs><mask id="tm-mask"><path id="tm-reveal" d="${TRAIL}" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round"/></mask></defs>
      <path d="M20 556 L 250 300 L 320 336 L 552 52 L 640 150 L 700 118 L 990 556 Z" fill="#DCE6F2" stroke="#40302A" stroke-width="3" stroke-linejoin="round"/>
      <path d="M552 52 L 488 132 L 512 124 L 530 146 L 556 120 L 584 142 L 606 120 L 640 150 Z" fill="#fff" stroke="#40302A" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M250 300 L 222 332 L 244 326 L 262 340 L 284 322 L 320 336 Z M700 118 L 676 146 L 694 140 L 712 152 L 728 134 Z" fill="#fff" stroke="#40302A" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="${pines}" fill="#4E9B78" stroke="#40302A" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M20 556 H 990" stroke="#40302A" stroke-width="3"/>
      <path id="tm-trail" d="${TRAIL}" fill="none" stroke="#E85D2F" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round" mask="url(#tm-mask)"/>
      <g id="tm-flags"></g>
      <image id="tm-yak" href="${getComputedStyle(mapYak, "::before").backgroundImage.slice(5, -2)}" width="34" height="34" x="-17" y="-30"/>`;
    const trail = trailmapSvg.querySelector<SVGPathElement>("#tm-trail")!;
    const revealPath = trailmapSvg.querySelector<SVGPathElement>("#tm-reveal")!;
    const yakImg = trailmapSvg.querySelector<SVGImageElement>("#tm-yak")!;
    const flagLayer = trailmapSvg.querySelector("#tm-flags")!;
    const len = trail.getTotalLength();
    revealPath.style.strokeDasharray = `${len}`;
    revealPath.style.strokeDashoffset = `${len}`;

    const marks = flags.map((d, i) => {
      const t = (d.altitude - altMin) / (altMax - altMin);
      const p = trail.getPointAtLength(t * len);
      const left = i % 2 === 0;
      // every label is two lines: name over altitude, both aligned to the
      // same edge so the numbers line up beside each flag
      const tx = left ? p.x - 10 : p.x + 28;
      const anchor = left ? "end" : "start";
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "tm-flag");
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", `Go to ${d.name}`);
      g.innerHTML = `<path d="M${p.x} ${p.y} V ${p.y - 34}" stroke="#40302A" stroke-width="2.5"/>
        <path d="M${p.x} ${p.y - 34} L ${p.x + 22} ${p.y - 28} L ${p.x} ${p.y - 20} Z" fill="${d.color}" stroke="#40302A" stroke-width="2" stroke-linejoin="round"/>
        <text x="${tx}" y="${p.y - 30}" text-anchor="${anchor}">${d.name}</text>
        <text class="tm-alt" x="${tx}" y="${p.y - 14}" text-anchor="${anchor}">${d.altitude.toLocaleString("en-US")} m</text>`;
      const go = () => {
        cancelShot();
        travelTo(indexOf(d.id));
      };
      g.addEventListener("click", go);
      g.addEventListener("keydown", (e) => (e as KeyboardEvent).key === "Enter" && go());
      flagLayer.appendChild(g);
      return { t, g };
    });

    const t0 = performance.now();
    const DRAW = 3200;
    cancelAnimationFrame(mapRaf);
    const step = (now: number) => {
      const t = clamp((now - t0) / DRAW, 0, 1);
      const eased = 1 - (1 - t) ** 2.2;
      revealPath.style.strokeDashoffset = String(len * (1 - eased));
      const p = trail.getPointAtLength(eased * len);
      yakImg.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      for (const m of marks) if (!m.g.classList.contains("on") && eased >= m.t - 0.01) m.g.classList.add("on");
      if (t < 1) mapRaf = requestAnimationFrame(step);
      else confettiBurst();
    };
    mapRaf = requestAnimationFrame(step);
  }
  function confettiBurst() {
    for (let i = 0; i < 50; i++) spawn("confetti", VW * (0.45 + Math.random() * 0.1), VH * 0.3);
    sound.chime();
  }
  function hideTrailmap() {
    trailmap.classList.remove("show");
    cancelAnimationFrame(mapRaf);
  }
  $("#trailmap-close").addEventListener("click", () => cancelShot());
  trailmap.addEventListener("click", (e) => {
    if (e.target === trailmap) cancelShot();
  });

  /* ---------------- hoofprints in the snow ---------------- */

  const NS = "http://www.w3.org/2000/svg";
  let stepAcc = 0;
  let stepFoot = 0;
  function hoofprint(x: number, slope: number) {
    const g = document.createElementNS(NS, "g");
    const y = ground - elev(x) + (stepFoot % 2 ? 6 : 10);
    const ang = (-Math.atan(slope) * 180) / Math.PI;
    g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
    g.innerHTML = '<ellipse cx="-3.4" rx="3.2" ry="2"/><ellipse cx="3.4" rx="3.2" ry="2"/>';
    prints.appendChild(g);
    if (prints.childElementCount > 700) prints.firstElementChild?.remove();
  }

  /* ---------------- main loop ---------------- */

  let fogSaid = 0;
  let fogShown = false;

  function frame(now: number) {
    const dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0.016;
    // the tour keeps wall-clock time, so reading pauses hold on slow devices too
    // (capped, so returning to a backgrounded tab doesn't skip a stop)
    const tourDt = lastT ? Math.min((now - lastT) / 1000, 0.25) : 0.016;
    lastT = now;

    if (tween) {
      const p = clamp((now - tween.t0) / tween.dur, 0, 1);
      scrollPos = clamp(lerp(tween.from, tween.to, (tween.ease ?? easeInOut)(p)), 0, maxCam);
      window.scrollTo(0, scrollPos);
      if (p >= 1) tween = null;
    }
    tourTick(tourDt);

    const target = clamp(scrollPos, 0, maxCam);
    const prev = cam;
    cam += (target - cam) * (1 - Math.exp(-7 * dt));
    if (Math.abs(target - cam) < 0.3) cam = target;
    const vel = (cam - prev) / dt;

    const yakX = cam + VW * yakFrac;
    const e = elev(yakX);
    const slope = (elev(yakX + 6) - elev(yakX - 6)) / 12;

    // camera: normally Yakku's feet sit at a fixed screen spot; shots blend away from that
    const k = shot ? shotK(now) : 0;
    const reveal = shot?.kind === "reveal" ? k : 0;
    let sc = 1;
    let fx = yakX;
    let fy = ground - e;
    let sx = VW * yakFrac;
    let sy = ground;
    if (shot && shot.kind === "reveal") {
      sc = Math.exp(lerp(0, Math.log(shot.s), k));
      fx = lerp(fx, shot.fx, k);
      fy = lerp(fy, shot.fy, k);
      sx = lerp(sx, VW / 2, k);
      sy = lerp(sy, VH * 0.6, k);
    } else if (shot) {
      sc = lerp(1, shot.s, k);
    }
    const tx = sx - fx * sc;
    const ty = sy - fy * sc;
    world.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${sc})`;

    const farS = 1 - reveal * 0.18;
    far.style.transformOrigin = `${VW / 2 + cam * 0.1}px ${ground}px`;
    // the big peaks stand low and far at Basecamp and rise steadily with the
    // altitude, reaching full height around High Camp
    const rise = lerp(0.62, 1, clamp(e / (maxLevel * 0.8), 0, 1));
    far.style.transform = `translate3d(${-cam * 0.1}px, ${e * 0.3}px, 0) scale(${farS}, ${(farS * rise).toFixed(4)})`;
    // the valley mist burns off by the Trailhead
    const near0 = smooth(clamp(cam / (L[1]?.x0 || VW), 0, 1));
    // on a phone the band sits right under the words, so it stays lighter there
    const mistOp = ((1 - near0) * (mobile ? 0.55 : 1)).toFixed(3);
    if (mist.style.opacity !== mistOp) {
      mist.style.opacity = mistOp;
      mist.style.visibility = near0 >= 1 ? "hidden" : "";
    }
    if (near0 < 1) mist.style.transform = `translate3d(${-cam * 0.1}px, ${e * 0.3}px, 0)`;
    clouds.style.transform = `translate3d(${-cam * 0.18}px, ${e * 0.4}px, 0)`;
    mid.style.transform = `translate3d(${-cam * 0.3}px, ${e * 0.6}px, 0)`;
    // the near tree line sits at Yakku's level; where the trail ahead drops
    // below him (down from the summit) it drops too, so nothing floats
    let drop = 0;
    for (let f = 0.35; f <= 1; f += 0.325) drop = Math.max(drop, e - elev(cam + VW * f));
    near.style.transform = `translate3d(${-cam * 0.6}px, ${drop.toFixed(1)}px, 0)`;
    front.style.transform = `translate3d(${-cam * 1.4}px, 0px, 0)`;
    const layerFade = String(1 - reveal);
    mid.style.opacity = layerFade;
    near.style.opacity = layerFade;
    front.style.opacity = layerFade;
    if (shot?.kind === "reveal" && reveal > 0.9 && !trailmap.classList.contains("show")) showTrailmap();
    if (trailmap.classList.contains("show") && (!shot || shot.kind !== "reveal" || shot.cancelAt !== undefined)) hideTrailmap();

    for (const b of buckets) {
      const show = b.x1 > cam * 0.6 - 200 && b.x0 < cam * 0.6 + VW + 200;
      if (show !== b.shown) {
        b.shown = show;
        b.el.style.display = show ? "" : "none";
      }
    }
    for (const b of frontBuckets) {
      const show = b.x1 > cam * 1.4 - 400 && b.x0 < cam * 1.4 + VW + 200;
      if (show !== b.shown) {
        b.shown = show;
        b.el.style.display = show ? "" : "none";
      }
    }

    // cull chunks that are off screen (the visible range grows when zoomed out)
    const v0 = -tx / sc;
    const v1 = (VW - tx) / sc;
    for (const c of chunks) {
      const show = c.x1 > v0 - 200 && c.x0 < v1 + 200;
      if (show !== c.shown) {
        c.shown = show;
        c.el.style.display = show ? "" : "none";
      }
    }

    // reveal stops as they come into view
    for (const s of L) if (!s.el.classList.contains("seen") && s.x0 < v1 - VW * 0.2) s.el.classList.add("seen");

    // yak
    smSpeed += (Math.abs(vel) - smSpeed) * (1 - Math.exp(-9 * dt));
    const speed = smSpeed;
    isMoving = isMoving ? speed > 15 : speed > 60;
    const moving = isMoving;
    const grumpy = now < grumpyUntil;
    if (vel > 25) face = 1;
    else if (vel < -25) face = -1;
    actor.classList.toggle("face-left", grumpy && !moving ? true : face < 0);
    const yakH = yakW * (210 / 260);
    const tilt = (-Math.atan(slope) * 180) / Math.PI * 0.8 * (moving ? 1 : 0.6);
    actor.style.transform = `translate3d(${yakX - yakW / 2}px, ${ground - e - yakH * (197 / 210)}px, 0) rotate(${tilt.toFixed(2)}deg)`;

    const here = stopAt(yakX);
    // flags go up the moment he walks into camp; the quip still waits for him to stop
    if (here && !here.el.classList.contains("raised")) here.el.classList.add("raised");
    const surface: Surface = here?.d.biome === "snow" || (!here && biomeAt(yakX, 0.5) === "snow") ? "snow" : biomeAt(yakX, 0.5) === "rock" ? "rock" : "grass";

    // footsteps: a sound on every step, and hoofprints once there's snow underfoot
    if (moving) {
      stepAcc += Math.abs(cam - prev);
      const stride = yakW * 0.3;
      if (stepAcc > stride) {
        stepAcc = 0;
        stepFoot++;
        // deep snow and thin air: he starts to struggle above about half height
        sound.step(surface, surface === "snow" ? clamp((elev(yakX) / maxLevel - 0.45) / 0.5, 0, 1) : 0);
        if (surface === "snow" && elev(yakX) / maxLevel > 0.55) {
          const foot = stepFoot % 2 ? yakW * 0.24 : -yakW * 0.2;
          hoofprint(yakX + foot * face, slope);
        }
      }
    }

    if (moving) {
      gaitRun = gaitRun ? speed > 1100 : speed > 1900;
      setPose(gaitRun ? "run" : "walk");
      restAt = now;
      if (grumpy && speed > 200 && now - lastPoke > 600) {
        grumpyUntil = 0;
        speak("Fine. FINE. I'm walking.");
      }
    } else {
      const still = now - restAt;
      let rest: string = here ? here.d.pose : "idle";
      if (rest === "wave" && still > 3200) rest = "idle";
      if (rest === "idle" && still > 9000) rest = "graze";
      if (grumpy) rest = "grumpy";
      if (still > 220) setPose(rest);
      if (here && still > 260 && arrived !== here.d.id) {
        arrived = here.d.id;
        L.forEach((s) => s.el.classList.toggle("here", s === here));
        here.el.classList.add("raised");
        const lines = quips[here.d.id];
        if (lines && !grumpy && !tour) speak(pick(lines));
        if (here.d.id === "summit" && !summitParty) {
          summitParty = true;
          confetti();
          sound.chime();
          window.setTimeout(() => {
            if (revealDue() && stopAt(cam + VW * yakFrac)?.d.id === "summit" && Math.abs(scrollPos - cam) < 4) startReveal();
          }, 1700);
        }
      }
    }
    if (here?.d.id !== arrived && moving && arrived) {
      arrived = "";
      L.forEach((s) => s.el.classList.remove("here"));
    }

    // leg cadence follows the real travel speed: no moonwalking while the camera eases out
    if (pose === "walk" || pose === "run") {
      if (pose !== walkAnimsPose) {
        walkAnimsPose = pose;
        walkAnims = yak
          .getAnimations({ subtree: true })
          .filter((a): a is CSSAnimation => a instanceof CSSAnimation && /^(yStep|yBob|ySkirt)$/.test(a.animationName));
      }
      const rate = clamp(speed / (pose === "run" ? 1500 : 300), 0.2, 2.6);
      for (const a of walkAnims) a.playbackRate = rate;
    } else if (walkAnimsPose) {
      walkAnimsPose = "";
      walkAnims = [];
    }

    // the cloud bank before High Camp
    let fogK = 0;
    let fogP = 0;
    if (fogB > fogA) {
      const c = (fogA + fogB) / 2;
      const hw = (fogB - fogA) / 2 + VW * 0.15;
      fogP = clamp((yakX - c) / hw, -1, 1);
      fogK = smooth(clamp((1 - Math.abs(yakX - c) / hw) * 1.7, 0, 1)) * (1 - reveal);
      if (fogK > 0.6 && fogSaid === 0) {
        fogSaid = 1;
        speak(tour ? "Can't see a thing… stay close!" : "Can't see a thing… keep scrolling!");
      } else if (fogSaid === 1 && fogK < 0.05 && yakX > c) {
        fogSaid = 2;
        speak("Whoa. SNOW.");
      }
    }
    // slide the bank in from the right as the yak climbs into it and out to
    // the left as it walks clear; the core covers the screen while |p| < 0.3
    const fogOn = fogK > 0.001;
    if (fogOn) {
      const slide = Math.sign(fogP) * smooth(clamp((Math.abs(fogP) - 0.3) / 0.7, 0, 1));
      drawFog(-VW * (1 + 2 * slide), now);
      const op = (0.94 * (1 - reveal)).toFixed(3);
      if (fog.style.opacity !== op) fog.style.opacity = op;
    }
    if (fogOn !== fogShown) {
      fogShown = fogOn;
      fog.style.visibility = fogOn ? "visible" : "hidden";
    }

    // sky / time of day
    const su = stopUnits(yakX);
    if (Math.abs(su - lastS) > 0.002) {
      lastS = su;
      let kk = 0;
      while (kk < SKY.length - 2 && su > SKY[kk + 1][0]) kk++;
      const [a0, at, ab] = SKY[kk];
      const [b0, bt, bb] = SKY[kk + 1];
      const t = clamp((su - a0) / (b0 - a0), 0, 1);
      sky.style.background = `linear-gradient(180deg, ${mix(at, bt, t)} 0%, ${mix(ab, bb, t)} 78%)`;
      const night = clamp((su - (L.length - 1.6)) / 0.6, 0, 1);
      stars.style.opacity = String(night);
      tint.style.opacity = String(night * 0.55);
      chunksEl.style.filter = night > 0.01 ? `brightness(${1 - night * 0.38}) saturate(${1 - night * 0.3})` : "";
      front.style.filter = night > 0.01 ? `brightness(${1 - night * 0.5})` : "";
      root.classList.toggle("is-night", night > 0.5);
      const daySpan = L.length - 2.4;
      const sy2 = su < daySpan ? 0.2 - 0.1 * Math.sin((Math.PI * su) / daySpan) : 0.2 + (su - daySpan) * 0.75;
      sun.style.transform = `translate3d(${VW * (0.76 + 0.14 * (su / L.length))}px, ${VH * sy2}px, 0)`;
      sun.style.opacity = String(clamp(1 - (su - daySpan - 0.5) * 2, 0, 1));
      moon.style.opacity = String(night);
      clouds.style.opacity = String(1 - night * 0.85);
      moon.style.transform = `translate3d(${VW * 0.74}px, ${VH * (0.42 - night * 0.3)}px, 0)`;
    }

    // HUD
    // on a stop's plateau show its exact altitude (8,848 m, not 8,850);
    // while climbing between stops, round to keep the number steady
    const alt = here ? here.d.altitude : Math.round(altitudeAt(yakX) / 10) * 10;
    if (alt !== lastAlt) {
      lastAlt = alt;
      hudAlt.textContent = alt.toLocaleString("en-US");
    }
    const place = here ? here.d.name : fogK > 0.5 ? "in the clouds" : "on the trail";
    if (place !== lastPlace) {
      lastPlace = place;
      hudPlace.textContent = place;
      mapStops.forEach((li, i) => li.classList.toggle("is-here", L[i] === here));
    }
    mapYak.style.left = `${(yakX / worldW) * 100}%`;
    mapYak.style.top = `${((27 - (e / maxLevel) * 23) / 30) * 100}%`;

    const biome = here?.d.biome ?? biomeAt(yakX, 0.5);
    weather(dt, now, vel, biome, e / maxLevel, moving && speed > 80 && k < 0.05, face);
    sound.update({
      level: e / maxLevel,
      gust,
      fog: fogK,
      birds: biome === "forest" || biome === "meadow",
      fire: here?.d.id === "hikers" ? 1 : 0,
      pose,
    });

    requestAnimationFrame(frame);
  }

  /* ---------------- boot ---------------- */

  let lastW = 0;
  let lastH = 0;
  function relayout() {
    const i = currentIndex();
    const off = L.length ? (window.scrollY - camFor(i)) / VW : 0;
    layout();
    prints.innerHTML = "";
    lastW = VW;
    lastH = VH;
    let y = clamp(camFor(i) + off * VW, 0, maxCam);
    if (tour) {
      // keep the tour on its page; a walk in progress just re-aims
      const pages = tourPages(tour.i);
      tour.k = Math.min(tour.k, pages.length - 1);
      tour.to = pages[tour.k];
      if (tour.phase === "read") y = tour.to;
      else tween = null;
    }
    window.scrollTo(0, y);
    cam = y;
  }

  layout();
  lastW = VW;
  lastH = VH;

  let rt = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(rt);
    rt = window.setTimeout(() => {
      // ignore mobile URL-bar jitter
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 140) return;
      relayout();
    }, 160);
  });
  document.fonts?.ready.then(() => buildSummitFlags());
  // the clearing is measured from the words, which change size when the web
  // fonts swap in (fonts.ready can settle before they're even requested)
  const intro = document.querySelector(".s-base .base");
  if (intro && "ResizeObserver" in window) {
    let pending = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        const moved = measureClearing();
        if (moved) {
          buildChunks();
          buildBackdrop();
        }
      });
    }).observe(intro);
  }

  // deep links: /#notes, /?at=summit, /?x=1200 (QA)
  const sp = new URLSearchParams(location.search);
  const startId = sp.get("at") || location.hash.slice(1);
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (sp.has("x")) {
    window.scrollTo(0, Number(sp.get("x")));
    cam = clamp(window.scrollY, 0, maxCam);
  } else if (startId && indexOf(startId) >= 0) travelTo(indexOf(startId), true);
  else {
    window.scrollTo(0, 0);
    cam = 0;
  }

  void reduced;
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */

initDeck();
initCopy();
if (trekOn) boot();
else
  document.querySelectorAll<HTMLElement>("[data-go]").forEach((el) =>
    el.addEventListener("click", (e) => {
      const target = document.getElementById(el.dataset.go!);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth" });
    })
  );
