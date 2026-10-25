import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(({mode}) => {
  const publicEnv=loadEnv(mode,appRoot,'VITE_');
  if(mode==='production'&&(publicEnv.VITE_AUTH_PROVIDER!=='neon-managed'||!/^https:\/\/ep-(?:nameless-voice-b4ygobrp|purple-salad-b4qr5err)\.neonauth\.c-6\.us-east-2\.aws\.neon\.tech\/neondb\/auth$/.test(publicEnv.VITE_NEON_AUTH_BASE_URL??'')))throw Error('Production build requires the pinned Neon managed Auth provider and issuer');
  return {
  root: appRoot,
  envDir: appRoot,
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
};});
