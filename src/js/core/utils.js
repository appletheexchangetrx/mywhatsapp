/**
 * Shared, side-effect-light utilities.
 * Keep this module independent from application state and backend services.
 */

/**
 * Escape a value for safe interpolation into HTML text/attribute contexts.
 * Prefer textContent for DOM insertion whenever possible.
 */
export function escapeHtml(value) {
  const text = value == null ? "" : String(value);
  return text.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

/**
 * Resolve an element by ID from a supplied root (defaults to document).
 * Returns null when the root or element is unavailable.
 */
export function getElement(id, root = globalThis.document) {
  if (!root || typeof root.getElementById !== "function") return null;
  return root.getElementById(String(id));
}

/** Return true when a value can be converted to a valid Date. */
export function isValidDate(value) {
  if (value == null || value === "") return false;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime());
}
