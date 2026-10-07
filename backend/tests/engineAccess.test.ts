import { afterEach, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/storage/db.js", () => ({ query: mocks.query }));
import { requireSubscriber } from "../src/api/middleware/requireSubscriber.js";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const req = (headers: Record<string, string>) => ({ header: (key: string) => headers[key] }) as Request;
it("rejects missing sessions before querying subscription status", async () => {
  const next = vi.fn();
  await requireSubscriber(req({}), {} as Response, next);
  expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects a forged token even if the caller claims a paid plan", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
  const next = vi.fn();
  await requireSubscriber(req({ "x-user-token": "forged", "x-supabase-key": "public", "x-plan": "premium" }), {} as Response, next);
  expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
  expect(mocks.query).not.toHaveBeenCalled();
});
it.each(["free", "premium", "premium_plus"])("checks the verified user's server-side %s plan", async plan => {
  const id = "11111111-1111-4111-8111-111111111111";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id }), { status: 200 })));
  mocks.query.mockResolvedValue({ rows: [{ subscription_plan: plan }] });
  const next = vi.fn();
  await requireSubscriber(req({ "x-user-token": "verified-session", "x-supabase-key": "public" }), {} as Response, next);
  expect(mocks.query.mock.calls[0]?.[1]).toEqual([id]);
  if (plan === "free") expect(next.mock.calls[0]?.[0]).toMatchObject({ status: 403 });
  else expect(next).toHaveBeenCalledWith();
});
