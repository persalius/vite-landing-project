import { defineConfig } from "vite";
import { resolve } from "path";
import fs from "fs";

var cachedData = fs.readFileSync("./about.html", "utf-8");

console.log("Cached Data:", cachedData);

const htmlReplacer = () => {
  return {
    name: "html-replacer",
    transformIndexHtml(html, ctx) {
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
});
