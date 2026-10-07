import pg from "pg";
import { expect, it } from "vitest";
import { isoTimestamp, registerDateTypes } from "../src/storage/dateTypes.js";

it("keeps PostgreSQL dates and timestamps compatible with repository text contracts", () => {
  registerDateTypes();
  expect(pg.types.getTypeParser(pg.types.builtins.DATE)("2026-10-07")).toBe(
    "2026-10-07",
  );
  expect(
    pg.types.getTypeParser(pg.types.builtins.TIMESTAMPTZ)(
      "2026-10-07 15:00:00+03",
    ),
  ).toBe("2026-10-07T12:00:00.000Z");
  expect(isoTimestamp(new Date("2026-10-07T12:00:00Z"))).toBe(
    "2026-10-07T12:00:00.000Z",
  );
  expect(isoTimestamp("infinity")).toBeNull();
});
