import { defineConfig } from "vite";
import path from "path";
import fs from "fs";
import * as cheerio from "cheerio";

const usedTemplates = new Set();

function watchTemplatesPlugin() {
  const templatesDir = path.resolve("../templates");

  return {
    name: "watch-templates",
    enforce: "pre",
    configureServer(server) {
      server.watcher.add(path.resolve(templatesDir, "**/*"));

      server.watcher.on("change", (file) => {
        if (file.startsWith(templatesDir)) {
          // Сообщаем Vite обновить страницу
          server.ws.send({
            type: "full-reload",
            path: "*",
          });
        }
      });
    },
  };
}

function htmlTemplatesPlugin() {
  const templatesDir = path.resolve("../templates");

  return {
    name: "html-template-plugin",
    enforce: "pre",
    transformIndexHtml(html) {
      if (usedTemplates && typeof usedTemplates.clear === "function") {
        usedTemplates.clear();
      }

      const $ = cheerio.load(html, { decodeEntities: false });

      $("div.template").each((_, el) => {
        const templateName = $(el).attr("data-template");
        if (!templateName) return;
        usedTemplates.add(templateName);

        const templateJsonPath = path.join(
          templatesDir,
          templateName,
          "template.json"
        );
        if (!fs.existsSync(templateJsonPath)) return;
        const template = JSON.parse(fs.readFileSync(templateJsonPath, "utf-8"));

        // HTML
        const templateHtmlPath = path.join(
          templatesDir,
          templateName,
          template.entry
        );
        if (fs.existsSync(templateHtmlPath)) {
          let templateHtml = fs.readFileSync(templateHtmlPath, "utf-8");

          const attrs = $(el).attr();
          Object.keys(attrs).forEach((key) => {
            if (key === "data-template" || key === "class") return;
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
            templateHtml = templateHtml.replace(regex, attrs[key]);
          });

          $(el).replaceWith(templateHtml);
        }

        // JS
        if (template.scripts) {
          template.scripts.forEach(
            ({ file, container, position = "end", targetComment }) => {
              const scriptPath = path.join(templatesDir, templateName, file);
              if (!fs.existsSync(scriptPath)) return;
              const scriptTag = `<script type="module" src="/templates/${templateName}/${file}"></script>`;

              switch (position) {
                case "start":
                case "end": {
                  const $container = container ? $(container) : $("body");
                  if (!$container.length) return;
                  position === "start"
                    ? $container.prepend(scriptTag)
                    : $container.append(scriptTag);
                  break;
                }
                case "comment": {
                  if (!targetComment) return;
                  const containers = container ? [container] : ["head", "body"];
                  containers.forEach((tag) => {
                    const $container = $(tag);
                    $container.contents().each((_, node) => {
                      if (
                        node.type === "comment" &&
                        node.data.trim() === targetComment
                      ) {
                        $(node).replaceWith(scriptTag);
                      }
                    });
                  });
                  break;
                }
              }
            }
          );
        }
      });

      return $.html();
    },
  };
}

function scssTemplatesPlugin() {
  const templatesDir = path.resolve("templates");

  return {
    name: "scss-templates",
    enforce: "pre",
    resolveId(id) {
      if (id === "virtual:templates.scss") return id;
    },
    load(id, data, res) {
      if (id === "virtual:templates.scss") {
        if (!usedTemplates || usedTemplates.size === 0) return "";

        const imports = Array.from(usedTemplates)
          .map((templateName) => {
            const templateJson = path.join(
              templatesDir,
              templateName,
              "template.json"
            );
            if (!fs.existsSync(templateJson)) return null;

            const { styles } = JSON.parse(
              fs.readFileSync(templateJson, "utf-8")
            );
            if (!styles || styles.length === 0) return null;

            // Подключаем каждый SCSS с templateName как namespace
            return styles
              .map((file) => {
                const abs = path.join(templatesDir, templateName, file);
                const rel = path
                  .relative(process.cwd(), abs)
                  .replace(/\\/g, "/");
                return `@use "${rel}" as ${templateName};`;
              })
              .join("\n");
          })
          .filter(Boolean)
          .join("\n");

        return imports;
      }
    },
  };
}

export default defineConfig({
  plugins: [
    watchTemplatesPlugin(),
    htmlTemplatesPlugin({ usedTemplates }),
    scssTemplatesPlugin({ usedTemplates }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        about: path.resolve(__dirname, "about.html"),
      },
    },
  },
});
