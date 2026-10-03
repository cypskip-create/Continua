import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: true,
    cors: true,
    hmr: {
      clientPort: 443,
      protocol: "wss",
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(appRoot, "src"),
    },
  },
}));
