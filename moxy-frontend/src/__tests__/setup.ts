// src/__tests__/setup.ts
// Mock crypto.randomUUID for jsdom
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID: () => Math.random().toString(36).slice(2) },
});
