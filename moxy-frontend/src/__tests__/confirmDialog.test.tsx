// src/__tests__/confirmDialog.test.tsx
// In-app confirm used for removing members and deleting tasks/groups
// (native confirm() is auto-cancelled in some embedded browsers).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfirmDialog, confirmAction } from "@/components/ui/ConfirmDialog";

describe("confirmAction", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<ConfirmDialog />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const button = (label: string) =>
    [...document.querySelectorAll("button")].find((b) => b.textContent === label)!;

  // Wrapped in an object: returning the promise directly from an async
  // function would make `await ask()` wait for the user's answer
  const ask = async () => {
    let answer!: Promise<boolean>;
    await act(async () => {
      answer = confirmAction({ title: "Remove Asha?", message: "Asha will lose access.", confirmLabel: "Remove" });
    });
    return { answer };
  };

  it("shows the title, message and confirm label", async () => {
    await ask();
    expect(document.body.textContent).toContain("Remove Asha?");
    expect(document.body.textContent).toContain("Asha will lose access.");
    expect(button("Remove")).toBeTruthy();
  });

  it("resolves true on confirm and closes", async () => {
    const { answer } = await ask();
    await act(async () => button("Remove").click());
    await expect(answer).resolves.toBe(true);
    expect(document.body.textContent).not.toContain("Remove Asha?");
  });

  it("resolves false on Cancel", async () => {
    const { answer } = await ask();
    await act(async () => button("Cancel").click());
    await expect(answer).resolves.toBe(false);
  });

  it("resolves false on Escape", async () => {
    const { answer } = await ask();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    await expect(answer).resolves.toBe(false);
    expect(document.body.textContent).not.toContain("Remove Asha?");
  });
});
