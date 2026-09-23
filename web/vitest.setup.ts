import "@testing-library/jest-dom/vitest";

// jsdom ships no matchMedia, and the reduced-motion check calls it on mount.
// Reporting "no preference" keeps animations in the tests' code path.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
