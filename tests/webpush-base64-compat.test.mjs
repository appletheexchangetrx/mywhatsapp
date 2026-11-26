import test from "node:test";
import assert from "node:assert/strict";
import { installUint8ArrayBase64Compatibility } from "../supabase/functions/_shared/webpush-base64-compat.js";

const originalFromBase64 = Object.getOwnPropertyDescriptor(Uint8Array, "fromBase64");
const originalToBase64 = Object.getOwnPropertyDescriptor(Uint8Array.prototype, "toBase64");

test("Web Push Base64 compatibility shim", async (t) => {
  t.after(() => {
    if (originalFromBase64) Object.defineProperty(Uint8Array, "fromBase64", originalFromBase64);
    else delete Uint8Array.fromBase64;
    if (originalToBase64) Object.defineProperty(Uint8Array.prototype, "toBase64", originalToBase64);
    else delete Uint8Array.prototype.toBase64;
  });

  // Reproduce the older Edge Runtime even when the test runner has native support.
  delete Uint8Array.fromBase64;
  delete Uint8Array.prototype.toBase64;
  installUint8ArrayBase64Compatibility();

  await t.test("decodes standard Base64 with padding", () => {
    assert.equal(new TextDecoder().decode(Uint8Array.fromBase64("SGVsbG8=")), "Hello");
  });

  await t.test("decodes Base64URL without padding", () => {
    assert.deepEqual([...Uint8Array.fromBase64("-_8", { alphabet: "base64url" })], [251, 255]);
  });

  await t.test("accepts standard Base64 whitespace", () => {
    assert.equal(new TextDecoder().decode(Uint8Array.fromBase64("SGVs bG8=")), "Hello");
  });

  await t.test("encodes standard Base64 and Base64URL", () => {
    const bytes = new Uint8Array([251, 255]);
    assert.equal(bytes.toBase64(), "+/8=");
    assert.equal(bytes.toBase64({ alphabet: "base64url", omitPadding: true }), "-_8");
  });

  await t.test("encodes large byte arrays without argument overflow", () => {
    const bytes = new Uint8Array(20000).fill(0xab);
    const encoded = bytes.toBase64({ alphabet: "base64url", omitPadding: true });
    assert.deepEqual([...Uint8Array.fromBase64(encoded, { alphabet: "base64url" })], [...bytes]);
  });

  await t.test("rejects invalid alphabets, characters, and lengths", () => {
    assert.throws(() => Uint8Array.fromBase64("++//", { alphabet: "base64url" }), SyntaxError);
    assert.throws(() => Uint8Array.fromBase64("A"), SyntaxError);
    assert.throws(() => Uint8Array.fromBase64("SGVsbG8=="), SyntaxError);
  });
});
