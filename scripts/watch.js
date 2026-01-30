const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const SRC_DIR = path.join(__dirname, "..", "src");
const DIST_DIR = path.join(__dirname, "..", "dist");
const BUILD_SCRIPT = path.join(__dirname, "build.js");
const PREVIEW_PORT = 3000;

// Debounce build triggers to avoid running multiple times per save.
const debounce = (fn, delay = 150) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

let building = false;
let queued = false;

// Track live-reload clients (Server-Sent Events).
const sseClients = new Set();
const sendReload = () => {
  if (!sseClients.size) return;
  const payload = "data: reload\n\n";
  sseClients.forEach((res) => res.write(payload));
};

const runBuild = () => {
  if (building) {
    queued = true;
    return;
  }

  building = true;
  const startedAt = new Date().toLocaleTimeString();
  console.log(`[${startedAt}] Running build...`);

  const proc = spawn("node", [BUILD_SCRIPT], { stdio: "inherit" });

  proc.on("exit", (code) => {
    const endedAt = new Date().toLocaleTimeString();
    if (code === 0) {
      console.log(`[${endedAt}] Build finished`);
      sendReload();
    } else {
      console.error(`[${endedAt}] Build failed with code ${code}`);
    }
    building = false;
    if (queued) {
      queued = false;
      runBuild();
    }
  });
};

const watchHandler = debounce((eventType, filename) => {
  if (!filename) return;
  const shouldRebuild = /\.(html|njk|txt|json|css|js|ts)$/i.test(filename);
  if (shouldRebuild) runBuild();
});

// Initial build before starting the watcher.
runBuild();

console.log(`Watching ${SRC_DIR} for changes...`);

// Use recursive watch on platforms that support it (Windows/macOS).
fs.watch(SRC_DIR, { recursive: true }, watchHandler);

// --- Simple preview server with live reload (no extra deps needed) ---
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".txt": "text/plain; charset=utf-8",
};

const injectReloadSnippet = (html) =>
  `${html}\n<script>
  (() => {
    const es = new EventSource('/__reload');
    es.onmessage = (e) => { if (e.data === 'reload') location.reload(); };
    es.onerror = () => { es.close(); setTimeout(() => location.reload(), 500); };
  })();
</script>`;

const defaultHtmlPath = () => {
  const htmlFiles = fs
    .readdirSync(DIST_DIR)
    .filter((f) => f.toLowerCase().endsWith(".html"));
  return htmlFiles[0] || "";
};

const server = http.createServer((req, res) => {
  // SSE endpoint for reload notifications
  if (req.url === "/__reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = urlPath === "/" ? defaultHtmlPath() : urlPath.slice(1);
  const filePath = path.join(DIST_DIR, safePath);

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = mimeTypes[ext] || "application/octet-stream";
    res.setHeader("Content-Type", type);

    if (ext === ".html") {
      res.end(injectReloadSnippet(data.toString("utf8")));
    } else {
      res.end(data);
    }
  });
});

server.listen(PREVIEW_PORT, () => {
  const entry = defaultHtmlPath() || "[your-file].html";
  console.log(
    `Preview server running at http://localhost:${PREVIEW_PORT}/${entry}`
  );
});
