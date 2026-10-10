import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { exportApi } from "./plugins/export-api.ts";
import { falApi } from "./plugins/fal-api.ts";
import { iconifyApi } from "./plugins/iconify-api.ts";

export default defineConfig({
  // fal and export first: the iconify middleware answers 404 for every other /api/ route.
  plugins: [react(), falApi(), exportApi(), iconifyApi()],
  preview: { port: 4101, strictPort: true },
  server: { port: 4100, strictPort: true, open: false, watch: { ignored: ["**/.generations/**"] } },
});
