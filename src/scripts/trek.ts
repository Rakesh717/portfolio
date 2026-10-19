/**
 * The trek engine.
 *
 * Vertical scroll is mapped 1:1 onto a horizontal camera. Stops sit on
 * plateaus at their altitude; the trail climbs between them. Yakku walks
 * at a fixed spot on screen while the world (forest → meadow → rock →
 * snow) slides past in parallax, the sky moves from morning to night,
 * and the weather follows the biome.
 */
import { pokes, quips, type Biome, type Stop as StopData } from "../data/content";

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

  document.querySelector("[data-deck-next]")?.addEventListener("click", () => next(1));
  document.querySelector("[data-deck-prev]")?.addEventListener("click", prev);
  render();
}

function initCopy() {
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
    const label = btn.querySelector<HTMLElement>("[data-copy-label]");
    const original = label?.textContent ?? "";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy!);
        if (label) label.textContent = "Copied to clipboard ✓";
        say("Copied! I'll guard it with my life.");
      } catch {
        window.location.href = `mailto:${btn.dataset.copy}`;
      }
      window.setTimeout(() => label && (label.textContent = original), 2200);
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
  const clouds = $("#layer-clouds");
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
    mobile = VW < 768;
    ground = Math.round(VH * (mobile ? 0.86 : 0.86));
    gapW = Math.round(VW * (mobile ? 0.6 : 0.4));
    yakFrac = mobile ? 0.2 : 0.15;
    yakW = mobile ? 112 : clamp(VW * 0.13, 150, 210);
    const totalRise = VH * (mobile ? 0.8 : 0.95);
    const altMin = data[0].altitude;
    const altMax = Math.max(...data.map((d) => d.altitude));

    let x = 0;
    L = stopEls.map((el) => {
      const d = data.find((s) => s.id === el.dataset.stop)!;
      const span = Number(mobile ? el.dataset.spanM : el.dataset.span) || 1;
      const w = Math.round(span * VW);
      const laid = { el, d, x0: x, w, level: ((d.altitude - altMin) / (altMax - altMin)) * totalRise };
      x += w + gapW;
      return laid;
    });
    worldW = x - gapW;
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

    buildChunks();
    buildBackdrop();
    buildMap();
    buildSummitFlags();
  }

  /* ---------------- ground + forest ---------------- */

  function tree(sym: string, x: number, y: number, h: number, ratio: number, color: string, r: () => number, cls = "tree") {
    const w = h * ratio;
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

  function buildChunks() {
    chunksEl.innerHTML = "";
    chunks = [];
    const scale = mobile ? 0.62 : clamp(VH / 900, 0.75, 1.15);
    const bottom = VH * 1.35;

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
    }
    far.style.width = `${fw}px`;
    far.innerHTML = `<svg width="${fw}" height="${VH}" viewBox="0 0 ${fw} ${VH}">${farSvg}</svg>`;

    // mid: forested ridges with pine silhouettes
    const mw = Math.ceil(VW + maxCam * 0.3 + 300);
    const ridge = (x: number) =>
      base + VH * 0.05 - VH * (0.08 + 0.05 * Math.sin(x / 260) + 0.04 * Math.sin(x / 97 + 2) + 0.03 * Math.sin(x / 530 + 1));
    let d = `M0 ${VH}`;
    for (let x = 0; x <= mw; x += 20) d += ` L${x} ${ridge(x).toFixed(1)}`;
    d += ` L${mw} ${VH} Z`;
    let pines = "";
    for (let x = 6; x < mw; x += 9 + r() * 14) {
      const y = ridge(x) + 3;
      const h = 14 + r() * 16;
      pines += `M${(x - h * 0.3).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y - h).toFixed(1)} L${(x + h * 0.3).toFixed(1)} ${y.toFixed(1)} Z `;
    }
    mid.style.width = `${mw}px`;
    mid.innerHTML = `<svg width="${mw}" height="${VH}" viewBox="0 0 ${mw} ${VH}">
      <path d="${pines}" fill="#5F9978" stroke="#40302A" stroke-opacity=".3" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="${d}" fill="#7DB08F" stroke="#40302A" stroke-opacity=".35" stroke-width="2"/>
    </svg>`;

    // clouds
    const cw = Math.ceil(VW + maxCam * 0.18 + 400);
    let cl = "";
    for (let x = 40; x < cw; x += 320 + r() * 520) {
      const w = (mobile ? 90 : 120) + r() * 110;
      cl += `<svg class="cloud" viewBox="0 0 160 70" style="left:${x.toFixed(0)}px;top:${(VH * (0.06 + r() * 0.26)).toFixed(0)}px;width:${w.toFixed(0)}px;animation-duration:${(10 + r() * 10).toFixed(1)}s;animation-delay:${(-r() * 10).toFixed(1)}s"><use href="#s-cloud"/></svg>`;
    }
    clouds.style.width = `${cw}px`;
    clouds.innerHTML = cl;

    // near tree line: a breezy forest that thins out as the trail climbs
    const NEAR = 0.6;
    const nw = Math.ceil(VW + maxCam * NEAR + 300);
    const scale = mobile ? 0.6 : clamp(VH / 900, 0.75, 1.1);
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
    svg.innerHTML = mobile
      ? flagString(px, py, -40, py - 70, 26, size) + flagString(px, py, w + 40, py - 110, 30, size)
      : flagString(px, py, -40, ground * 0.66, 50, size) +
      flagString(px, py, -40, ground * 0.2, 40, size) +
      flagString(px, py, mobile ? w * 0.75 : w * 0.4, -40, 30, size) +
      flagString(px, py, mobile ? w * 0.2 : px * 0.5, -40, 20, size);
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
    };
    if (kind === "snow") {
      p.r = 1.6 + Math.random() * 2.8;
      p.vy = 30 + Math.random() * 40;
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
    if (ambient < target && Math.random() < 0.6) {
      const kind = biome === "snow" || biome === "rock" ? "snow" : biome === "meadow" ? (Math.random() < 0.6 ? "petal" : "leaf") : Math.random() < 0.25 ? "petal" : "leaf";
      const fromSide = Math.random() < 0.3;
      spawn(kind, fromSide ? -10 : Math.random() * VW * 1.1, fromSide ? Math.random() * VH * 0.6 : -10);
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
        p.vx = wind * p.depth + Math.sin(now / 700 + p.rot) * 14;
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
      if (p.kind === "snow" || p.kind === "puff") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
        if (p.kind === "snow") ctx.stroke();
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
    quip.textContent = text;
    quip.classList.add("show");
    window.clearTimeout(quipTimer);
    quipTimer = window.setTimeout(() => quip.classList.remove("show"), ms);
  }
  window.addEventListener("yak:say", (e) => speak((e as CustomEvent<string>).detail));

  yakBtn.addEventListener("click", () => {
    yak.classList.remove("is-boing");
    void yak.getBoundingClientRect();
    yak.classList.add("is-boing");
    window.setTimeout(() => yak.classList.remove("is-boing"), 700);
    restAt = performance.now();
    speak(pick(pokes));
  });

  /* ---------------- travel ---------------- */

  let tween: { from: number; to: number; t0: number; dur: number } | null = null;
  const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

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
      travelTo(i);
      history.replaceState(null, "", `#${el.dataset.go}`);
    })
  );

  const cancelTween = () => (tween = null);
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

  /* ---------------- main loop ---------------- */

  let cam = 0;
  let lastT = 0;
  let face = 1;
  let pose = "";
  let restAt = performance.now();
  let arrived = "";
  let summitParty = false;
  let lastAlt = -1;
  let lastPlace = "";
  let lastS = -1;

  function setPose(p: string) {
    if (p === pose) return;
    pose = p;
    yak.dataset.pose = p;
  }

  function frame(now: number) {
    const dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0.016;
    lastT = now;

    if (tween) {
      const p = clamp((now - tween.t0) / tween.dur, 0, 1);
      window.scrollTo(0, lerp(tween.from, tween.to, easeInOut(p)));
      if (p >= 1) tween = null;
    }

    const target = clamp(window.scrollY, 0, maxCam);
    const prev = cam;
    cam += (target - cam) * (1 - Math.exp(-7 * dt));
    if (Math.abs(target - cam) < 0.3) cam = target;
    const vel = (cam - prev) / dt;

    const yakX = cam + VW * yakFrac;
    const e = elev(yakX);
    const slope = (elev(yakX + 6) - elev(yakX - 6)) / 12;

    world.style.transform = `translate3d(${-cam}px, ${e}px, 0)`;
    far.style.transform = `translate3d(${-cam * 0.1}px, ${e * 0.3}px, 0)`;
    clouds.style.transform = `translate3d(${-cam * 0.18}px, ${e * 0.4}px, 0)`;
    mid.style.transform = `translate3d(${-cam * 0.3}px, ${e * 0.6}px, 0)`;
    near.style.transform = `translate3d(${-cam * 0.6}px, 0, 0)`;
    for (const b of buckets) {
      const show = b.x1 > cam * 0.6 - 200 && b.x0 < cam * 0.6 + VW + 200;
      if (show !== b.shown) {
        b.shown = show;
        b.el.style.display = show ? "" : "none";
      }
    }

    // cull chunks that are off screen
    for (const c of chunks) {
      const show = c.x1 > cam - 200 && c.x0 < cam + VW + 200;
      if (show !== c.shown) {
        c.shown = show;
        c.el.style.display = show ? "" : "none";
      }
    }

    // reveal stops as they come into view
    for (const s of L) if (!s.el.classList.contains("seen") && s.x0 < cam + VW * 0.8) s.el.classList.add("seen");

    // yak
    const speed = Math.abs(vel);
    const moving = speed > 18;
    if (vel > 25) face = 1;
    else if (vel < -25) face = -1;
    actor.classList.toggle("face-left", face < 0);
    const yakH = yakW * (210 / 260);
    const tilt = (-Math.atan(slope) * 180) / Math.PI * 0.8 * (moving ? 1 : 0.6);
    actor.style.transform = `translate3d(${yakX - yakW / 2}px, ${ground - e - yakH * (197 / 210)}px, 0) rotate(${tilt.toFixed(2)}deg)`;

    const here = stopAt(yakX);
    if (moving) {
      setPose(speed > 1500 ? "run" : "walk");
      restAt = now;
    } else {
      const still = now - restAt;
      let rest: string = here ? here.d.pose : "idle";
      if (rest === "wave" && still > 3200) rest = "idle";
      if (rest === "idle" && still > 9000) rest = "graze";
      if (still > 220) setPose(rest);
      if (here && still > 260 && arrived !== here.d.id) {
        arrived = here.d.id;
        L.forEach((s) => s.el.classList.toggle("here", s === here));
        here.el.classList.add("raised");
        const lines = quips[here.d.id];
        if (lines) speak(pick(lines));
        if (here.d.id === "summit" && !summitParty) {
          summitParty = true;
          confetti();
        }
      }
    }
    if (here?.d.id !== arrived && moving && arrived) {
      arrived = "";
      L.forEach((s) => s.el.classList.remove("here"));
    }

    // sky / time of day
    const su = stopUnits(yakX);
    if (Math.abs(su - lastS) > 0.002) {
      lastS = su;
      let k = 0;
      while (k < SKY.length - 2 && su > SKY[k + 1][0]) k++;
      const [a0, at, ab] = SKY[k];
      const [b0, bt, bb] = SKY[k + 1];
      const t = clamp((su - a0) / (b0 - a0), 0, 1);
      sky.style.background = `linear-gradient(180deg, ${mix(at, bt, t)} 0%, ${mix(ab, bb, t)} 78%)`;
      const night = clamp((su - (L.length - 1.6)) / 0.6, 0, 1);
      stars.style.opacity = String(night);
      tint.style.opacity = String(night * 0.55);
      chunksEl.style.filter = night > 0.01 ? `brightness(${1 - night * 0.38}) saturate(${1 - night * 0.3})` : "";
      root.classList.toggle("is-night", night > 0.5);
      const daySpan = L.length - 2.4;
      const sy = su < daySpan ? 0.2 - 0.1 * Math.sin((Math.PI * su) / daySpan) : 0.2 + (su - daySpan) * 0.75;
      sun.style.transform = `translate3d(${VW * (0.76 + 0.14 * (su / L.length))}px, ${VH * sy}px, 0)`;
      sun.style.opacity = String(clamp(1 - (su - daySpan - 0.5) * 2, 0, 1));
      moon.style.opacity = String(night);
      clouds.style.opacity = String(1 - night * 0.85);
      moon.style.transform = `translate3d(${VW * 0.74}px, ${VH * (0.42 - night * 0.3)}px, 0)`;
    }

    // HUD
    const alt = Math.round(altitudeAt(yakX) / 10) * 10;
    if (alt !== lastAlt) {
      lastAlt = alt;
      hudAlt.textContent = alt.toLocaleString("en-US");
    }
    const place = here ? here.d.name : `on the trail`;
    if (place !== lastPlace) {
      lastPlace = place;
      hudPlace.textContent = place;
      mapStops.forEach((li, i) => li.classList.toggle("is-here", L[i] === here));
    }
    mapYak.style.left = `${(yakX / worldW) * 100}%`;
    mapYak.style.top = `${((27 - (e / maxLevel) * 23) / 30) * 100}%`;

    weather(dt, now, vel, here?.d.biome ?? biomeAt(yakX, 0.5), e / maxLevel, moving && speed > 80, face);

    requestAnimationFrame(frame);
  }

  /* ---------------- boot ---------------- */

  let lastW = 0;
  let lastH = 0;
  function relayout() {
    const i = currentIndex();
    const off = L.length ? (window.scrollY - camFor(i)) / VW : 0;
    layout();
    lastW = VW;
    lastH = VH;
    const y = clamp(camFor(i) + off * VW, 0, maxCam);
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
