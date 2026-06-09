import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const outPath = join(__dirname, "..", "article-to-print-extension.zip");

if (!existsSync(distDir)) {
  console.error("dist/ not found. Run npm run build first.");
  process.exit(1);
}

execSync(`rm -f "${outPath}" && cd "${distDir}" && zip -r "${outPath}" .`, {
  stdio: "inherit",
});
console.log(`Created ${outPath}`);
