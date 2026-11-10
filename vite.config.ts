import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The whole prototype ships as one screen; one ~1.2 MB chunk (330 kB gzipped) is expected.
  build: { chunkSizeWarningLimit: 1400 },
});
