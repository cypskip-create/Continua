import { test } from "node:test";
import assert from "node:assert/strict";
import { readApiData, DataApiResponseError } from "../src/api/apiResponse.ts";

test("API data permits empty lists and explicit null values", async () => {
  assert.deepEqual(await readApiData(new Response('{"data":[]}')), []);
  assert.equal(await readApiData(new Response('{"data":null}')), null);
});
test("HTML and missing envelopes are response errors, not connection failures", async () => {
  for (const text of ["<html>private upstream content</html>", "{}", "null"]) {
    await assert.rejects(readApiData(new Response(text)), error => error instanceof DataApiResponseError && error.status === 502 && error.responseStatus === 200 && !error.message.includes("private"));
  }
});
test("HTTP failures retain status and safe JSON error messages", async () => {
  await assert.rejects(readApiData(new Response('{"error":"Session expired"}',{status:401})), error => error instanceof DataApiResponseError && error.status===401 && error.message==="Session expired");
  await assert.rejects(readApiData(new Response("<html>upstream failure</html>",{status:503})), error => error instanceof DataApiResponseError && error.status===503);
});
test("hosting challenges stay explicit without parsing or solving them", async () => {
  await assert.rejects(readApiData(new Response("challenge",{status:429,headers:{"content-type":"text/html","cf-mitigated":"challenge"}})), error => error instanceof DataApiResponseError && error.status===429 && /security check/.test(error.message));
});
test("interrupted response streams remain transport errors", async () => {
  const failure=new TypeError("stream interrupted");
  const response=new Response(new ReadableStream({start(controller){controller.error(failure);}}));
  await assert.rejects(readApiData(response),error=>error===failure);
});
