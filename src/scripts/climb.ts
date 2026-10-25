/**
 * Reading a post is a climb from Kathmandu to the summit. Everything that shows
 * altitude or progress (the trail bar, the sky, sound, the reading log)
 * goes through here so they always agree.
 */

const BASE = 1400;
const SUMMIT = 8848;

const article = () => document.querySelector<HTMLElement>("article");

/** the scroll position at which the article's end reaches the bottom of the screen */
export function climbMax() {
  const a = article();
  const end = a ? a.getBoundingClientRect().bottom + scrollY : document.documentElement.scrollHeight;
  return Math.max(0, end - innerHeight);
}

/** 0 at the trailhead → 1 once the whole article has been read */
export function progressAt(y = scrollY) {
  const max = climbMax();
  return max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
}

const altitude = (p: number) => Math.round((BASE + p * (SUMMIT - BASE)) / 10) * 10;
export const fmtAlt = (p: number) => `${altitude(p).toLocaleString("en-US")} m`;

/** how far down the screen a heading counts as "reached" */
export const READING_LINE = 0.35;

// The reading log: where you stopped on each post, and which ones you finished.
// It lives only in this browser and everything works without it.

type TrailEntry = { p: number; done: boolean };
const KEY = "yak-trails";

export function readLog(): Record<string, TrailEntry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function writeEntry(slug: string, entry: Partial<TrailEntry>) {
  try {
    const log = readLog();
    const prev = log[slug] ?? { p: 0, done: false };
    log[slug] = { ...prev, ...entry, done: prev.done || !!entry.done };
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // private mode or storage blocked: the log is a nicety, nothing depends on it
  }
}
