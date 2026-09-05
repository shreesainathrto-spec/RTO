/**
 * Vercel SPA Configuration for TanStack Start + React Router
 *
 * This configuration builds a pure client-side SPA (no SSR, no server bundle).
 * - TanStack Router handles all routing in the browser
 * - React runs entirely on the client
 * - Firebase handles all backend operations
 * - Vercel serves static files from dist/client
 *
 * Key: NOT using @lovable.dev/vite-tanstack-config because it defaults to SSR.
 * Instead, we use standard Vite + React plugins for SPA mode.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss(), tsconfigPaths()],
  build: {
    // Build client-side bundle only (no SSR)
    outDir: "dist/client",
    ssr: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Organized asset output
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
    // Use esbuild for minification (no additional deps needed)
    minify: "esbuild",
    target: "ES2022",
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    // SPA dev server config
    middlewareMode: false,
    hmr: true,
  },
});
