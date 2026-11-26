import { fingerprintPayload } from "./reliability-store.ts";
import type { MetaMessagePayload } from "./types.ts";

function assert(condition: boolean, message: string): void { if (!condition) throw new Error(message); }

Deno.test("idempotency fingerprint is stable for the same canonical payload", async () => {
  const payload: MetaMessagePayload = { messaging_product: "whatsapp", recipient_type: "individual", to: "6281234567890", type: "text", text: { body: "hello", preview_url: false } };
  const first = await fingerprintPayload(payload);
  const second = await fingerprintPayload(payload);
  assert(first === second && first.length === 64, "Expected stable SHA-256 fingerprint.");
});

Deno.test("different payloads produce different idempotency fingerprints", async () => {
  const base: MetaMessagePayload = { messaging_product: "whatsapp", recipient_type: "individual", to: "6281234567890", type: "text", text: { body: "hello" } };
  const changed: MetaMessagePayload = { ...base, text: { body: "different" } };
  assert(await fingerprintPayload(base) !== await fingerprintPayload(changed), "Payload changes must be detected.");
});
