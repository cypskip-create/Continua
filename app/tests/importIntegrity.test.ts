import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("every statically imported app-local module survives legacy cleanup", () => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const missing: string[] = [];
  for (const file of fs
    .readdirSync(root, { recursive: true })
    .filter(
      (f): f is string => typeof f === "string" && /\.(tsx?|m?js)$/.test(f),
    )) {
    const full = path.join(root, file),
      text = fs.readFileSync(full, "utf8");
    for (const match of text.matchAll(
      /(?:from\s*|import\s*\()\s*["']([^"']+)["']/g,
    )) {
      const spec = match[1];
      if (!(spec.startsWith(".") || spec.startsWith("@/"))) continue;
      const target = spec.startsWith("@/")
        ? path.join(root, spec.slice(2))
        : path.resolve(path.dirname(full), spec);
      if (
        ![
          target,
          target + ".ts",
          target + ".tsx",
          target + ".js",
          path.join(target, "index.ts"),
          path.join(target, "index.tsx"),
        ].some((f) => fs.existsSync(f))
      )
        missing.push(`${file}: ${spec}`);
    }
  }
  assert.deepEqual(missing, []);
});
