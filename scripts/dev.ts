import { serve } from "bun";
import { join, extname } from "node:path";
import { buildProject } from "./build.ts";

const PORT = 5173;
const outDir = "dist";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
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

// Initial build
await buildProject();

console.log(`[dev] Starting server on http://localhost:${PORT}`);

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = url.pathname;
    if (pathname === "/") pathname = "/index.html";

    const filePath = join(outDir, pathname);
    const file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": getMime(filePath) },
      });
    }

    // SPA fallback
    const indexFile = Bun.file(join(outDir, "index.html"));
    if (await indexFile.exists()) {
      return new Response(indexFile, { headers: { "Content-Type": "text/html" } });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log("[dev] Server running. Rebuild manually with: bun run scripts/build.ts");
