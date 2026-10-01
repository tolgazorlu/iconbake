import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { iconifyApi } from "./plugins/iconify-api.ts";

export default defineConfig({
  plugins: [react(), iconifyApi()],
  server: { port: 5178, open: false },
});
