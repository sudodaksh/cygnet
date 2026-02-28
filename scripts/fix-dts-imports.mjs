import { readdir, readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";

const distDir = new URL("../dist/", import.meta.url);

await rewriteDeclarations(distDir);

async function rewriteDeclarations(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true });

  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);

    if (entry.isDirectory()) {
      await rewriteDeclarations(entryUrl);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".d.ts")) continue;

    const path = fileURLToPath(entryUrl);
    const source = await readFile(path, "utf8");
    const next = source.replace(
      /(["'])(\.{1,2}\/[^"']*?)\.ts\1/g,
      '$1$2.js$1',
    );

    if (next !== source) {
      await writeFile(path, next, "utf8");
    }
  }
}
