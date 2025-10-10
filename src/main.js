import "./scss/main.scss";
import { checkUtils } from "./utils.js";

const array = new Set();

checkUtils(array);
console.log(array.values());
