import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.GREENTRACK_API_URL ?? "http://127.0.0.1:8001";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
