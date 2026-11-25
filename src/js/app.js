/**
 * Application lifecycle foundation.
 *
 * This stage deliberately does not connect the legacy page, Supabase,
 * Realtime, or UI components. Those integrations are introduced in later
 * approved gates.
 */

let activeApp = null;

/**
 * Create the application lifecycle once.
 * Returns the same controller when called repeatedly, preventing duplicate
 * initialization while the application is active.
 */
export function createApp() {
  if (activeApp) return activeApp;

  let destroyed = false;
  const cleanups = new Set();

  function registerCleanup(cleanup) {
    if (typeof cleanup !== "function") {
      throw new TypeError("Cleanup must be a function");
    }
    if (destroyed) {
      cleanup();
      return () => {};
    }

    cleanups.add(cleanup);
    return () => cleanups.delete(cleanup);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    for (const cleanup of [...cleanups].reverse()) {
      try {
        cleanup();
      } catch (error) {
        // Continue releasing remaining resources if one cleanup fails.
        console.error("Application cleanup failed:", error);
      }
    }
    cleanups.clear();

    if (activeApp === controller) activeApp = null;
  }

  const controller = Object.freeze({
    registerCleanup,
    destroy,
    get destroyed() {
      return destroyed;
    }
  });

  activeApp = controller;
  return controller;
}

/** Destroy the active application instance, if one exists. */
export function destroyApp() {
  activeApp?.destroy();
}
