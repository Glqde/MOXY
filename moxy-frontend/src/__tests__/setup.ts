// src/__tests__/setup.ts
// Mock crypto.randomUUID for jsdom
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID: () => Math.random().toString(36).slice(2) },
});

// jsdom has no matchMedia (used by useIsMobile); report a desktop-size screen
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }) as MediaQueryList;
}
