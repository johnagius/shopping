import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend builds to ./dist, which the Worker serves as static assets.
// During `vite dev`, /api requests are proxied to a locally running Worker
// (`npm run dev:worker`) if you have one up; otherwise the UI runs against
// whatever VITE_API_BASE you configure.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
