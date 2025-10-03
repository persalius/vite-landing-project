import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const paths = {
  landingPage: '.',
  templates: path.resolve(__dirname, "../../templates"),
};
