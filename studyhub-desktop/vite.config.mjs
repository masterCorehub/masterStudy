import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  optimizeDeps: {
    // AppShell has a large dependency graph (editors, PDF, diagrams and AI).
    // Waiting for the complete crawl kept the dev server listening without
    // answering HTTP requests, which left Electron on a blank page.
    holdUntilCrawlEnd: false,
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "zustand",
      "zustand/middleware",
      "@supabase/supabase-js",
    ],
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
