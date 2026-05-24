import { serve } from "bun";
import { join, extname } from "node:path";

const PORT = 5173;
const publicDir = "public";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".ts": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

function getMime(path: string): string {
  return MIME_TYPES[extname(path)] || "application/octet-stream";
}

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SimGolf Web</title>
  <style>
    body { margin: 0; background: #1a1a1a; overflow: hidden; }
    #game-container { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>`;

console.log(`[dev] Starting dev server on http://localhost:${PORT}`);

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (pathname === "/") pathname = "/index.html";

    // 1. Serve index.html for root and SPA fallback
    if (pathname === "/index.html") {
      return new Response(indexHtml, { headers: { "Content-Type": "text/html" } });
    }

    // 2. Try public/ for assets
    let filePath = join(publicDir, pathname);
    let file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file, { headers: { "Content-Type": getMime(filePath) } });
    }

    // 3. Serve and transpile src/ TypeScript files
    if (pathname.startsWith("/src/")) {
      filePath = join(".", pathname);
      file = Bun.file(filePath);
      if (await file.exists()) {
        const transpiler = new Bun.Transpiler({ loader: "ts" });
        const source = await file.text();
        const js = await transpiler.transform(source);
        return new Response(js, {
          headers: {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    // 4. SPA fallback
    return new Response(indexHtml, { headers: { "Content-Type": "text/html" } });
  },
});
