import { cp, mkdir } from "node:fs/promises";

const standalone = ".next/standalone";
await mkdir(`${standalone}/.next`, { recursive: true });
for (const path of ["public", ".next/static"]) {
  try {
    await cp(path, `${standalone}/${path}`, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
console.log("Standalone local runtime prepared in .next/standalone");
