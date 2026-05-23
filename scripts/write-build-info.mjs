import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const buildTime = new Date().toISOString();
const outDir = join(process.cwd(), "dist/public");

try {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "build-info.json"),
    JSON.stringify({ buildTime }, null, 2)
  );
  console.log(`[build-info] Written buildTime: ${buildTime}`);
} catch (e) {
  console.error("[build-info] Failed to write:", e);
}
