// รัน vitest โดยแก้ปัญหา Windows ที่ path ขึ้นต้นด้วยตัวพิมพ์เล็ก (c:\) ทำให้ vitest โหลดซ้ำ 2 ชุด
import { spawnSync } from "node:child_process";
import path from "node:path";

const fix = (p) => p.replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
const cwd = fix(process.cwd());
const bin = fix(path.join(process.cwd(), "node_modules", "vitest", "vitest.mjs"));
const r = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
process.exit(r.status ?? 1);
