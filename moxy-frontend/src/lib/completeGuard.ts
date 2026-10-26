// src/lib/completeGuard.ts
// Completing a task moves its card to the Completed section and the next
// card slides into its place — so the second click of a double-click would
// complete that one too. Clicks this soon after a completion are ignored,
// whichever card they land on.

export const COMPLETE_COOLDOWN_MS = 600;

let lastAccepted = -Infinity;

export function acceptCompleteClick(now: number = Date.now()): boolean {
  if (now - lastAccepted < COMPLETE_COOLDOWN_MS) return false;
  lastAccepted = now;
  return true;
}

export function resetCompleteGuard(): void {
  lastAccepted = -Infinity;
}
