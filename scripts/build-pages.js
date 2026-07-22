import fs from "node:fs";
import path from "node:path";

const outDir = "dist";
const entries = ["index.html", "styles.css", "app.js", "data", "functions"];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  const source = path.join(process.cwd(), entry);
  const target = path.join(process.cwd(), outDir, entry);
  if (!fs.existsSync(source)) continue;
  fs.cpSync(source, target, { recursive: true });
}

console.log(`Built Cloudflare Pages output in ${outDir}/`);
