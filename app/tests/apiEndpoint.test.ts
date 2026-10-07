import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveApiEndpoint, HOSTED_DATA_API } from "../src/api/apiEndpoint.ts";
test("hosted API uses same-origin transport while retaining the websocket upstream", () => {
  assert.deepEqual(resolveApiEndpoint(HOSTED_DATA_API, true, "https://continua-delta.vercel.app"), {rest:"https://continua-delta.vercel.app/data-api",upstream:HOSTED_DATA_API});
});
test("production cannot ship the checked-in localhost API; dev and custom backends remain intentional", () => {
  assert.equal(resolveApiEndpoint("http://localhost:4000/api/v1", true, "https://app.example").rest, "https://app.example/data-api");
  assert.equal(resolveApiEndpoint("http://localhost:4000/api/v1", false, "http://localhost:5188").rest,"http://localhost:4000/api/v1");
  assert.equal(resolveApiEndpoint("https://custom.example/api/v1",true,"https://app.example").rest,"https://custom.example/api/v1");
});
