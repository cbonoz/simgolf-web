import { mkdir, cp, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const outDir = "dist";
const publicDir = "public";

export async function buildProject(): Promise<void> {
  console.log("[build] Cleaning output directory...");
  await Bun.$`rm -rf ${outDir}`;
  await mkdir(outDir, { recursive: true });

  console.log("[build] Bundling TypeScript...");
  const result = await Bun.build({
    entrypoints: ["src/main.ts"],
    outdir: outDir,
    target: "browser",
    format: "esm",
    splitting: false,
    sourcemap: "external",
    minify: true,
  });

  if (!result.success) {
    console.error("[build] Bundle failed:", result.logs);
    throw new Error("Build failed");
  }

  console.log("[build] Copying public assets...");
  try {
    const entries = await readdir(publicDir, { withFileTypes: true });
    for (const entry of entries) {
      const src = join(publicDir, entry.name);
      const dest = join(outDir, entry.name);
      await cp(src, dest, { recursive: true, force: true });
    }
  } catch {
    // public dir might not exist or be empty
  }

  console.log("[build] Writing index.html...");
  const html = `<!DOCTYPE html>
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
  <script type="module" src="./main.js"></script>
</body>
</html>`;
  await writeFile(join(outDir, "index.html"), html);
}

if (import.meta.main) {
  await buildProject();
  console.log("[build] Done. Output in dist/");
}
