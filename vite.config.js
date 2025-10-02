import { defineConfig } from "vite";
import path from "path";
import plugins from "./parser/plugins.js";

export default defineConfig({
  plugins: [...plugins],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        about: path.resolve(__dirname, "about.html"),
      },
    },
  },
});
