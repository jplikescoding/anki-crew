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

// jsdom does no layout, so it has no scrollIntoView; the feed calls it to jump
// to the first unread comment.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
