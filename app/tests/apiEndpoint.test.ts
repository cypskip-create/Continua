import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveApiEndpoint, HOSTED_DATA_API } from "../src/api/apiEndpoint.ts";

test('production Worker reads use its credential-holding gateway even with stale local or direct Render configuration',()=>{
  const origin='https://continua.cypriankiprop41.workers.dev';
  for(const configured of [undefined,'http://localhost:4000/api/v1',HOSTED_DATA_API])assert.deepEqual(resolveApiEndpoint(configured,true,origin),{rest:origin+'/api/v1',upstream:HOSTED_DATA_API});
});
test("hosted API uses direct CORS transport, not challenged Vercel egress", () => {
  assert.deepEqual(resolveApiEndpoint(HOSTED_DATA_API, true), {rest:HOSTED_DATA_API,upstream:HOSTED_DATA_API});
});
test("production cannot ship the checked-in localhost API; dev and custom backends remain intentional", () => {
  assert.equal(resolveApiEndpoint("http://localhost:4000/api/v1", true).rest, HOSTED_DATA_API);
  assert.equal(resolveApiEndpoint("http://localhost:4000/api/v1", false).rest,"http://localhost:4000/api/v1");
  assert.equal(resolveApiEndpoint("https://custom.example/api/v1",true).rest,"https://custom.example/api/v1");
});
