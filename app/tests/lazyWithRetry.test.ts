import test from "node:test";
import assert from "node:assert/strict";
import { retryModuleLoad } from "../src/lib/lazyWithRetry.ts";
test("transient page downloads retry once and recover", async () => {
  let calls = 0;
  const result = await retryModuleLoad(async () => {
    if (++calls === 1)
      throw new TypeError(
        "Failed to fetch dynamically imported module: fixture",
      );
    return "loaded";
  }, 0);
  assert.equal(result, "loaded");
  assert.equal(calls, 2);
});
test("persistent transport errors are bounded and application errors are not replayed", async () => {
  let calls = 0;
  await assert.rejects(
    retryModuleLoad(async () => {
      calls++;
      throw new TypeError("Importing a module script failed");
    }, 0),
  );
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    retryModuleLoad(async () => {
      calls++;
      throw new Error("Application exception");
    }, 0),
  );
  assert.equal(calls, 1);
});
