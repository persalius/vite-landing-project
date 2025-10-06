import { defineConfig } from "vite";
import path from "path";

const testPlugin = () => {
  console.log("Test plugin ---->");
};

export default defineConfig({
  plugins: [testPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        about: path.resolve(__dirname, "about.html"),
      },
    },
  },
});
