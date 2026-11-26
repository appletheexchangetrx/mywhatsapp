import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeBase64Compat,
  encodeBase64Compat,
  installBase64Compat,
} from "../supabase/functions/_shared/webpush-base64.js";

test("decodes standard base64 with and without padding", () => {
  assert.deepEqual([...decodeBase64Compat("AQIDBA==")], [1, 2, 3, 4]);
  assert.deepEqual([...decodeBase64Compat("AQIDBA")], [1, 2, 3, 4]);
});

test("decodes base64url used by Web Push subscription keys", () => {
  assert.deepEqual(
    [...decodeBase64Compat("-_8", { alphabet: "base64url" })],
    [251, 255],
  );
});

test("encodes standard and unpadded base64url", () => {
  const bytes = new Uint8Array([251, 255, 1]);
  assert.equal(encodeBase64Compat(bytes), "+/8B");
  assert.equal(
    encodeBase64Compat(bytes, { alphabet: "base64url", omitPadding: true }),
    "-_8B",
  );
});

test("round-trips binary data including non-ASCII bytes", () => {
  const source = Uint8Array.from({ length: 256 }, (_, index) => index);
  const encoded = encodeBase64Compat(source, {
    alphabet: "base64url",
    omitPadding: true,
  });
  assert.deepEqual(
    [...decodeBase64Compat(encoded, { alphabet: "base64url" })],
    [...source],
  );
});

test("rejects malformed base64 input", () => {
  assert.throws(() => decodeBase64Compat("a"), /length/);
  assert.throws(() => decodeBase64Compat("ab*c"), /character/);
});

test("installs missing Uint8Array methods without replacing native methods", () => {
  const originalFrom = Uint8Array.fromBase64;
  const originalTo = Uint8Array.prototype.toBase64;
  try {
    delete Uint8Array.fromBase64;
    delete Uint8Array.prototype.toBase64;
    installBase64Compat();
    assert.deepEqual([...Uint8Array.fromBase64("Zm9v")], [102, 111, 111]);
    assert.equal(
      new Uint8Array([102, 111, 111]).toBase64(),
      "Zm9v",
    );
  } finally {
    if (originalFrom) {
      Object.defineProperty(Uint8Array, "fromBase64", {
        configurable: true,
        writable: true,
        value: originalFrom,
      });
    } else {
      delete Uint8Array.fromBase64;
    }
    if (originalTo) {
      Object.defineProperty(Uint8Array.prototype, "toBase64", {
        configurable: true,
        writable: true,
        value: originalTo,
      });
    } else {
      delete Uint8Array.prototype.toBase64;
    }
  }
});
