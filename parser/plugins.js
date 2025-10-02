import path from "path";
import fs from "fs";
import * as cheerio from "cheerio";

const templatesDir = path.resolve("../templates");
const usedTemplates = new Set();
let templatesIndex = buildTemplatesIndex(templatesDir);

// --- Общая функция для сканирования HTML файлов ---
function scanHtmlForTemplates() {
  if (usedTemplates.size) return; // Уже заполнено

  const htmlFiles = ["index.html", "about.html"];

  htmlFiles.forEach((htmlFile) => {
    try {
      const htmlPath = path.resolve(htmlFile);
      if (fs.existsSync(htmlPath)) {
        const htmlContent = fs.readFileSync(htmlPath, "utf-8");
        const $ = cheerio.load(htmlContent, { decodeEntities: false });

        $("div.template").each((_, el) => {
          const templateName = $(el).attr("data-template");
          if (templateName) {
            usedTemplates.add(templateName);
          }
        });
      }
    } catch (error) {
      console.warn(`Error processing ${htmlFile}:`, error.message);
    }
  });
}

// --- Строим индекс шаблонов ---
function buildTemplatesIndex(dir) {
  const index = new Map();

  // Проверяем, существует ли директория шаблонов
  if (!fs.existsSync(dir)) {
    console.warn(`Templates directory not found: ${dir}`);
    return index;
  }

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
    configureServer(server) {
      // Проверяем существование директории шаблонов
      if (fs.existsSync(templatesDir)) {
        server.watcher.add(templatesDir);
      }

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
  let isProduction = false;
  let bundleInfo = new Map(); // Хранилище информации о bundle для production

  return {
    name: "html-template-plugin",
    enforce: "pre",

    configResolved(config) {
      isProduction = config.command === "build";
    },

    generateBundle(options, bundle) {
      if (isProduction) {
        // Собираем информацию о сгенерированных файлах
        Object.entries(bundle).forEach(([fileName, chunk]) => {
          if (chunk.type === "chunk" && fileName.includes("templates/")) {
            // Извлекаем оригинальный путь из facadeModuleId
            const originalPath = chunk.facadeModuleId;
            if (originalPath) {
              bundleInfo.set(originalPath, fileName);
            }
          }
        });
      }
    },

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

        // JS - добавляем скрипты в HTML
        if (template.scripts) {
          template.scripts.forEach(
            ({ file, container = "body", position = "end", targetComment }) => {
              const fileName = path.basename(file, ".js");

              let scriptSrc;
              if (isProduction) {
                // В production ищем обработанный файл в bundle
                const originalFilePath = path.join(templatePath, file);
                const bundledFileName = bundleInfo.get(originalFilePath);

                if (bundledFileName) {
                  scriptSrc = `/${bundledFileName}`;
                } else {
                  // Fallback: используем предполагаемый путь
                  scriptSrc = `/assets/templates/${templateName}/js/${fileName}.js`;
                }
              } else {
                // В dev режиме используем middleware путь
                scriptSrc = `/templates/${templateName}/js/${fileName}.js`;
              }

              const scriptTag = `<script type="module" src="${scriptSrc}"></script>`;

              if (position === "end") {
                $(container).append(scriptTag);
              } else if (position === "start") {
                $(container).prepend(scriptTag);
              } else if (position === "comment") {
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
    enforce: "post",
    resolveId(id) {
      if (id === "virtual:templates.scss") return id;
    },
    load(id) {
      if (id === "virtual:templates.scss") {
        // Если шаблоны не найдены, сканируем HTML файлы
        scanHtmlForTemplates();

        if (!usedTemplates || usedTemplates.size === 0) {
          console.log("No templates found");
          return "";
        }

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

        console.log("Generated SCSS imports:", imports);
        return imports;
      }
    },
  };
}

// --- JavaScript шаблоны ---
function templateJsPlugin() {
  return {
    name: "template-js",
    enforce: "pre",

    buildStart(opts) {
      // Добавляем JS файлы шаблонов как входные точки для полной обработки Vite
      if (!fs.existsSync(templatesDir)) {
        return;
      }

      const folders = fs
        .readdirSync(templatesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());

      const inputs = {};

      folders.forEach((folder) => {
        const jsonPath = path.join(templatesDir, folder.name, "template.json");
        if (!fs.existsSync(jsonPath)) return;

        try {
          const templateConfig = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
          const { name: templateName, scripts } = templateConfig;
          if (!scripts || !templateName) return;

          scripts.forEach(({ file }) => {
            const sourcePath = path.join(templatesDir, folder.name, file);
            if (!fs.existsSync(sourcePath)) return;

            const fileName = path.basename(file, ".js");
            const inputKey = `templates/${templateName}/js/${fileName}`;
            inputs[inputKey] = sourcePath;
          });
        } catch (error) {
          console.warn(
            `Error reading template.json for ${folder.name}:`,
            error.message
          );
        }
      });

      // Добавляем найденные файлы как входные точки
      if (Object.keys(inputs).length) {
        // Обновляем входные точки Rollup
        opts.input = opts.input || {};
        if (typeof opts.input === "string") {
          opts.input = { main: opts.input };
        }
        Object.assign(opts.input, inputs);
      }
    },

    configureServer(server) {
      // Middleware для обслуживания JS файлов шаблонов в dev режиме
      server.middlewares.use("/templates", (req, res, next) => {
        const requestedPath = decodeURIComponent(req.url);

        // Парсим путь: /templateName/relativePath
        const pathParts = requestedPath.split("/").filter(Boolean);
        if (pathParts.length < 2) {
          console.log("Invalid path structure");
          return next();
        }

        const templateName = pathParts[0];
        const relativeFilePath = pathParts.slice(1).join("/");

        // Получаем путь к шаблону из индекса
        const templatePath = templatesIndex.get(templateName);
        if (!templatePath) {
          console.log(`Template not found in index: ${templateName}`);
          return next();
        }

        // Читаем конфигурацию шаблона
        const templateJsonPath = path.join(templatePath, "template.json");
        if (!fs.existsSync(templateJsonPath)) {
          console.log(`Template config not found: ${templateJsonPath}`);
          return next();
        }

        let filePath;
        try {
          const templateConfig = JSON.parse(
            fs.readFileSync(templateJsonPath, "utf-8")
          );

          // Если запрашивается JS файл, ищем его в scripts
          if (relativeFilePath.startsWith("js/")) {
            const requestedFileName = path.basename(relativeFilePath);
            const script = templateConfig.scripts?.find(
              (s) => path.basename(s.file) === requestedFileName
            );

            if (script) {
              filePath = path.join(templatePath, script.file);
            } else {
              console.log(`Script not found in config: ${requestedFileName}`);
              return next();
            }
          } else {
            // Для других файлов используем прямой путь
            filePath = path.join(templatePath, relativeFilePath);
          }
        } catch (error) {
          console.error(`Error reading template config: ${error.message}`);
          return next();
        }

        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, "utf-8");

            // Определяем MIME тип
            let contentType = "text/plain";
            if (filePath.endsWith(".js")) {
              contentType = "application/javascript; charset=utf-8";
            }

            res.setHeader("Content-Type", contentType);
            res.setHeader("Cache-Control", "no-cache");
            res.end(content);
            return;
          } catch (error) {
            console.error(
              `Error serving template file ${filePath}:`,
              error.message
            );
          }
        }
        next();
      });
    },
  };
}

export default [
  watchTemplatesPlugin(),
  htmlTemplatesPlugin(),
  scssTemplatesPlugin(),
  templateJsPlugin(),
];
