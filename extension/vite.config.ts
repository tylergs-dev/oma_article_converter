import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: "src/popup/popup.html",
        preview: "src/preview/preview.html",
        options: "src/options/options.html",
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
