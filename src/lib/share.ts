import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CollectionEntry } from "astro:content";

/**
 * A post's share image: its own Yakku card in public/og/blog/<slug>.png when one has
 * been rendered (see src/pages/og), otherwise the site card.
 */
export function postImage(post: CollectionEntry<"blog">) {
  const src = `/og/blog/${post.id}.png`;
  if (!existsSync(join(process.cwd(), "public", src))) return undefined;
  const quip = post.data.og?.quip;
  return {
    src,
    alt: `Postcard titled "${post.data.title}", with Yakku the yak beside it${quip ? ` saying "${quip}"` : ""}`,
  };
}
