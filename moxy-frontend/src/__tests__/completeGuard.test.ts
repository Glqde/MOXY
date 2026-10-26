// src/__tests__/completeGuard.test.ts
// A double-click must complete one task, not that task and the one that
// slides into its place.

import { describe, it, expect, beforeEach } from "vitest";
import { acceptCompleteClick, resetCompleteGuard, COMPLETE_COOLDOWN_MS } from "@/lib/completeGuard";

describe("acceptCompleteClick", () => {
  beforeEach(() => resetCompleteGuard());

  it("takes the first click and drops the second click of a double-click", () => {
    expect(acceptCompleteClick(1000)).toBe(true);
    expect(acceptCompleteClick(1000 + 150)).toBe(false);
  });

  it("allows completing another task once the cooldown has passed", () => {
    expect(acceptCompleteClick(1000)).toBe(true);
    expect(acceptCompleteClick(1000 + COMPLETE_COOLDOWN_MS)).toBe(true);
  });

  it("dropped clicks don't extend the cooldown", () => {
    expect(acceptCompleteClick(1000)).toBe(true);
    expect(acceptCompleteClick(1500)).toBe(false);
    expect(acceptCompleteClick(1000 + COMPLETE_COOLDOWN_MS)).toBe(true);
  });
});
