// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";
import { readdirSync, readFileSync } from "node:fs";

// posts republished from elsewhere canonicalise to the original, so they stay out of the
// sitemap; posts first published here belong in it
const republished = readdirSync("src/content/blog")
  .filter((f) => /\.mdx?$/.test(f) && /^originalUrl:/m.test(readFileSync(`src/content/blog/${f}`, "utf8")))
  .map((f) => f.replace(/\.mdx?$/, ""));

export default defineConfig({
  site: "https://rakeshthapa.is-a.dev",
  integrations: [mdx(), sitemap({
      filter: (page) => !republished.some((slug) => new RegExp(`/blog/${slug}/?$`).test(page)),
    })],
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
    server: {
      // allow viewing the dev server through `cloudflared` quick tunnels,
      // whose subdomain changes on every restart
      allowedHosts: [".trycloudflare.com"],
    },
  },
});
