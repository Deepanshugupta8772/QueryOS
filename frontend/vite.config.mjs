import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve("frontend"),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    emptyOutDir: true,
    outDir: path.resolve("frontend/dist"),
  },
});
