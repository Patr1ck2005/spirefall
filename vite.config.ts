import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  // strictPort: a busy 5173 must fail loudly instead of silently moving to
  // 5174 while the launcher keeps watching (and opens) a stale 5173.
  server: { port: 5173, host: "0.0.0.0", strictPort: true },
  build: { outDir: "dist", emptyOutDir: true }
});
