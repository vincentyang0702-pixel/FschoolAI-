import "@testing-library/jest-dom";

// Dummy env so importing api/* modules (which construct a Supabase client at module
// load) doesn't throw "supabaseUrl is required" during pure-logic tests.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "test-service-key";

// jsdom doesn't implement matchMedia — components like BottomNav rely on it.
if (!window.matchMedia) {
  // @ts-ignore — minimal mock (narrow viewport → mobile layout)
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
