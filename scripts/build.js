const fs = require("fs");
const path = require("path");
const nunjucks = require("nunjucks");

const SRC_ROOT = path.join(__dirname, "..", "src");
const TEMPLATE_DIR = path.join(SRC_ROOT, "templates");
const DIST_DIR = path.join(__dirname, "..", "dist");

// Ensure output directory exists.
fs.mkdirSync(DIST_DIR, { recursive: true });

// Configure nunjucks to look up templates from src/.
const env = nunjucks.configure(SRC_ROOT, {
  autoescape: false, // keep raw HTML for emails
});

const templates = fs
  .readdirSync(TEMPLATE_DIR)
  .filter((file) => file.toLowerCase().endsWith(".html"));

templates.forEach((file) => {
  const templatePath = path.join("templates", file); // relative to SRC_ROOT
  const rendered = env.render(templatePath);
  const outPath = path.join(DIST_DIR, file);
  fs.writeFileSync(outPath, rendered, "utf8");
  console.log(`Rendered ${templatePath} -> dist/${file}`);
});
