/**
 * Compatibility helpers for runtimes that do not yet implement the
 * Uint8Array base64 methods used by @daaku/webpush.
 *
 * Implements the standard and URL-safe alphabets without relying on
 * Uint8Array.fromBase64()/toBase64(), while retaining native methods when
 * they are already available.
 */

export function decodeBase64Compat(input, options = {}) {
  if (typeof input !== "string") {
    throw new TypeError("Base64 input must be a string");
  }

  const alphabet = options.alphabet ?? "base64";
  if (alphabet !== "base64" && alphabet !== "base64url") {
    throw new TypeError("Unsupported base64 alphabet");
  }

  const compact = input.replace(/[\\t\\n\\f\\r ]/g, "");
  const pattern = alphabet === "base64"
    ? /^[A-Za-z0-9+/]*={0,2}$/
    : /^[A-Za-z0-9_-]*={0,2}$/;
  if (!pattern.test(compact)) throw new TypeError("Invalid base64 character");

  const unpadded = compact.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) throw new TypeError("Invalid base64 length");
  const normalized = (alphabet === "base64url"
    ? unpadded.replace(/-/g, "+").replace(/_/g, "/")
    : unpadded) + "=".repeat((4 - unpadded.length % 4) % 4);

  let binary;
  try {
    binary = atob(normalized);
  } catch {
    throw new TypeError("Invalid base64 data");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeBase64Compat(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("Base64 input must be a Uint8Array");
  }

  const alphabet = options.alphabet ?? "base64";
  if (alphabet !== "base64" && alphabet !== "base64url") {
    throw new TypeError("Unsupported base64 alphabet");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  let encoded = btoa(binary);
  if (alphabet === "base64url") {
    encoded = encoded.replace(/\\+/g, "-").replace(/\\//g, "_");
  }
  return options.omitPadding ? encoded.replace(/=+$/, "") : encoded;
}

export function installBase64Compat() {
  const constructor = Uint8Array;
  if (typeof constructor.fromBase64 !== "function") {
    Object.defineProperty(constructor, "fromBase64", {
      configurable: true,
      writable: true,
      value: decodeBase64Compat,
    });
  }

  if (typeof constructor.prototype.toBase64 !== "function") {
    Object.defineProperty(constructor.prototype, "toBase64", {
      configurable: true,
      writable: true,
      value: function (options) {
        return encodeBase64Compat(this, options);
      },
    });
  }
}
