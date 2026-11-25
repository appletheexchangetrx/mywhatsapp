/**
 * Backward-compatible service facade.
 *
 * New application code should import from src/js/services directly.
 * Keep these exports until all legacy consumers have migrated.
 */
export { fetchMessages } from "../../src/js/services/messages.js";
export { subscribeToMessages } from "../../src/js/services/realtime.js";
export { sendWhatsAppMessage } from "../../src/js/services/whatsapp.js";
