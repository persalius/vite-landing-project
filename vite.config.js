import { defineConfig } from "vite";
import { resolve } from "path";

const htmlReplacer = () => {
  return {
    name: "html-replacer",
    transformIndexHtml(html) {
      const target = '<div id="template"></div>';
      const replacement = '\n<section id="app-root">Section</section>';
      return html.replace(target, replacement);
    },
  };
};

export default defineConfig({
  plugins: [htmlReplacer()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        about: resolve(__dirname, "about.html"),
      },
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
