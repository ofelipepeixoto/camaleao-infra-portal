import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: { alias: { "next/link": fileURLToPath(new URL("./link.tsx", import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: "../../.ui-test-dist", emptyOutDir: true },
});
