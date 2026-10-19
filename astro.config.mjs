// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
