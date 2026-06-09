import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function resolvePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0]);
  const cleanPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, cleanPath === "/" ? "index.html" : cleanPath);
  return existsSync(filePath) ? filePath : join(root, "index.html");
}

createServer((request, response) => {
  const filePath = resolvePath(request.url || "/");
  const contentType = mimeTypes[extname(filePath)] || "application/octet-stream";

  response.writeHead(200, {
    "Content-Type": contentType,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  });

  createReadStream(filePath).pipe(response);
}).listen(port, "0.0.0.0", () => {
  console.log(`AI background remover running on http://localhost:${port}`);
});
