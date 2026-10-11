import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { target: "es2020" },
  server: {
    proxy: { "/api": process.env.API_PROXY_URL || "http://localhost:3000" },
  },
});
