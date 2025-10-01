import templateHtml from "./src/index.html?raw"; // raw-loader для Vite
import "./src/css/index.scss"; // SCSS подключается в preview
import "./src/js/index.js"; // JS подключается в preview

const app = document.getElementById("app");

// Пример замены плейсхолдера в шаблоне
// const htmlWithProps = templateHtml.replace("{{ title }}", "Preview Header");

app.innerHTML = templateHtml;
