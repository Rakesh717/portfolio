import { statSync } from "node:fs";
import { join } from "node:path";
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { site } from "../data/content";
import { postImage } from "../lib/share";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Field notes as an RSS feed. No dependency: it's a handful of posts and a template. */
export const GET: APIRoute = async ({ site: base }) => {
  const origin = base ?? new URL("http://localhost");
  const posts = (await getCollection("blog"))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  const items = posts
    .map((post) => {
      const link = new URL(`/blog/${post.id}`, origin).href;
      const image = postImage(post);
      return `    <item>
      <title>${esc(post.data.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${esc(post.data.description)}</description>
      <pubDate>${post.data.pubDate.toUTCString()}</pubDate>
${post.data.tags.map((t) => `      <category>${esc(t)}</category>`).join("\n")}
${image ? `      <enclosure url="${new URL(image.src, origin).href}" type="image/png" length="${statSync(join(process.cwd(), "public", image.src)).size}" />` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Field notes by ${esc(site.name)}</title>
    <link>${new URL("/blog", origin).href}</link>
    <atom:link href="${new URL("/rss.xml", origin).href}" rel="self" type="application/rss+xml" />
    <description>Essays by ${esc(site.name)} on AI, agents and building software with intention.</description>
    <language>en</language>
${posts[0] ? `    <lastBuildDate>${posts[0].data.pubDate.toUTCString()}</lastBuildDate>` : ""}
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
