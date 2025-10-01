import templateHtml from "../template/index.html?raw"; // raw-loader для Vite
import "../template/css/index.scss"; // SCSS подключается в preview
import "../template/js/index.js"; // JS подключается в preview

const app = document.getElementById("app");

// Пример замены плейсхолдера в шаблоне
// const htmlWithProps = templateHtml.replace("{{ title }}", "Preview Header");

app.innerHTML = templateHtml;
