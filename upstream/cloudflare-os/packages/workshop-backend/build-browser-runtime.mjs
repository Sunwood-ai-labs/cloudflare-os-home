import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageDir = dirname(fileURLToPath(import.meta.url));
const outputFile = resolve(packageDir, "src/generated/browser-export-runtime.txt");
const result = await build({
  entryPoints: [resolve(packageDir, "src/browser-export-runtime.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2025",
  minify: true,
  write: false,
});
const contents = new TextDecoder().decode(result.outputFiles[0].contents);

if (!existsSync(outputFile) || readFileSync(outputFile, "utf8") !== contents) {
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, contents);
}
