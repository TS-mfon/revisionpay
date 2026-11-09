import { expect, it } from "vitest";
import { safeReturnPath } from "../apps/web/src/lib/navigation";

it("preserves the unfinished agreement through sign-in and rejects external destinations", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  for (const path of [
    "/agreements/new",
    "/agreements/new?draft=" + id,
    "/agreements/" + id + "?view=freelancer",
  ])
    expect(safeReturnPath(path)).toBe(path);
  for (const path of [
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/settings?returnTo=https://evil.example",
    "/api/owner/redeem",
    "/agreements/new?draft=bad",
  ])
    expect(safeReturnPath(path)).toBe("/workspace");
});
