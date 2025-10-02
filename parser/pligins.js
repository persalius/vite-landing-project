import path from "path";
import fs from "fs";
import * as cheerio from "cheerio";

const templatesDir = path.resolve("../templates");
const usedTemplates = new Set();
let templatesIndex = buildTemplatesIndex(templatesDir);

// --- Строим индекс шаблонов ---
function buildTemplatesIndex(dir) {
  const index = new Map();
  const folders = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  folders.forEach((folder) => {
    const jsonPath = path.join(dir, folder.name, "template.json");
    if (!fs.existsSync(jsonPath)) return;

    const { name } = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    if (name) index.set(name, path.join(dir, folder.name));
  });

  return index;
}

// --- Watch шаблонов ---
function watchTemplatesPlugin() {
  return {
    name: "watch-templates",
    enforce: "pre",
    configureServer(server) {
      server.watcher.add(templatesDir);

      server.watcher.on("change", (file) => {
        if (file.startsWith(templatesDir)) {
          // Обновляем индекс для изменённой папки
          const folderName = path.relative(templatesDir, path.dirname(file));
          const jsonPath = path.join(templatesDir, folderName, "template.json");
          if (fs.existsSync(jsonPath)) {
            const { name } = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
            if (name)
              templatesIndex.set(name, path.join(templatesDir, folderName));
          }

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

// --- HTML шаблоны ---
function htmlTemplatesPlugin() {
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

        const templatePath = templatesIndex.get(templateName);
        if (!templatePath) return;

        const templateJsonPath = path.join(templatePath, "template.json");
        if (!fs.existsSync(templateJsonPath)) return;
        const template = JSON.parse(fs.readFileSync(templateJsonPath, "utf-8"));

        // HTML
        const templateHtmlPath = path.join(templatePath, template.entry);
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

// --- SCSS шаблоны ---
function scssTemplatesPlugin() {
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
            const templatePath = templatesIndex.get(templateName);
            if (!templatePath) return null;

            const templateJsonPath = path.join(templatePath, "template.json");
            if (!fs.existsSync(templateJsonPath)) return null;

            const { styles } = JSON.parse(
              fs.readFileSync(templateJsonPath, "utf-8")
            );
            if (!styles || styles.length === 0) return null;

            // Подключаем каждый SCSS с templateName как namespace
            return styles
              .map((file) => {
                const abs = path.join(templatePath, file);
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

export default [watchTemplatesPlugin, htmlTemplatesPlugin, scssTemplatesPlugin];