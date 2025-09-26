import { defineConfig } from "vite";
import { resolve } from "path";

const htmlReplacer = () => {
  return {
    name: "html-replacer",
    // Хук 'transformIndexHtml' используется для манипуляций с HTML
    // до того, как он будет передан в Rollup.
    transformIndexHtml(html) {
      // 1. Определяем, что нужно заменить
      const target = '<div id="template"></div>';

      // 2. Определяем, на что нужно заменить
      const replacement = '\n<section id="app-root">Section</section>';

      // 3. Выполняем замену
      return html.replace(target, replacement);
    },
  };
};

export default defineConfig({
  // plugins: [htmlReplacer()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        about: resolve(__dirname, "about.html"),
      },
    },
  },
});
