// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://rakeshthapa.pages.dev",
  integrations: [sitemap()],
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
