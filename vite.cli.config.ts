import { defineConfig } from "vite";

// Bundles the CLI (and the app's icon modules it reuses) into one Node ESM file.
// Dependencies stay external and load from node_modules.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: "cli/iconpress.ts",
    outDir: "dist-cli",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: { output: { entryFileNames: "iconpress.js", banner: "#!/usr/bin/env node" } },
  },
});
