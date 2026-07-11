// Tiny static server for the viewer. Serves repo root so /web + /shared both resolve.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // repo root
const PORT = process.env.PORT || 8080;

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/web/index.html";
  const filePath = path.join(ROOT, urlPath);

  // block path traversal outside the repo
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`port ${PORT} already in use. Another viewer is running, or set a different port:`);
    console.error(`  PORT=8090 npm run web        (then open http://localhost:8090)`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, () => console.log(`viewer http://localhost:${PORT}`));
