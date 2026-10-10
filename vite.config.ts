import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { falApi } from "./plugins/fal-api.ts";
import { iconifyApi } from "./plugins/iconify-api.ts";

export default defineConfig({
  // falApi first: the iconify middleware answers 404 for every other /api/ route.
  plugins: [react(), falApi(), iconifyApi()],
  server: { port: 5178, open: false, watch: { ignored: ["**/.generations/**"] } },
});
