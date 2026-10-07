import { describe, expect, it } from "vitest";
import { isAllowedBrowserOrigin } from "../src/api/corsPolicy.js";
describe("first-party browser origins", () => {
  it.each([undefined,"https://continua-delta.vercel.app","https://continua-cypskip-creates-projects.vercel.app","https://continua-feature-cypskip-creates-projects.vercel.app","http://127.0.0.1:5191"])("allows Continua origin %s", origin => expect(isAllowedBrowserOrigin(origin,[])).toBe(true));
  it.each(["https://evil.vercel.app","https://continua-delta.vercel.app.evil.com","https://continua-feature-other-projects.vercel.app"])("rejects unrelated origin %s", origin => expect(isAllowedBrowserOrigin(origin,[])).toBe(false));
  it("retains explicitly configured deployments",()=>expect(isAllowedBrowserOrigin("https://custom.example",["https://custom.example"])).toBe(true));
});
