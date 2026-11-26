/**
 * Compatibility shim for @daaku/webpush@0.2.0 on older Deno Edge runtimes.
 *
 * The package uses Uint8Array.fromBase64() and Uint8Array.prototype.toBase64(),
 * which are not available in every Supabase Edge Runtime release.
 * Implements only the Base64 options used by that package.
 */
export function installUint8ArrayBase64Compatibility() {
  if (typeof Uint8Array.fromBase64 !== "function") {
    Object.defineProperty(Uint8Array, "fromBase64", {
      configurable: true,
      writable: true,
      value(input, options = {}) {
        if (typeof input !== "string") {
          throw new TypeError("Base64 input must be a string");
        }

        const alphabet = options.alphabet ?? "base64";
        if (alphabet !== "base64" && alphabet !== "base64url") {
          throw new TypeError("Invalid Base64 alphabet");
        }

        const clean = input.replace(/[\\t\\n\\f\\r ]/g, "");
        const invalidAlphabet = alphabet === "base64"
          ? /[^A-Za-z0-9+/=]/
          : /[^A-Za-z0-9_\\-=]/;
        if (invalidAlphabet.test(clean)) {
          throw new SyntaxError("Invalid character in Base64 input");
        }

        const firstPadding = clean.indexOf("=");
        const data = firstPadding === -1 ? clean : clean.slice(0, firstPadding);
        const padding = firstPadding === -1 ? "" : clean.slice(firstPadding);
        if (padding.length > 2 || (padding && !/^={1,2}$/.test(padding))) {
          throw new SyntaxError("Invalid Base64 padding");
        }
        if (data.length % 4 === 1) {
          throw new SyntaxError("Invalid Base64 length");
        }
        if (
          (padding.length === 1 && data.length % 4 !== 3) ||
          (padding.length === 2 && data.length % 4 !== 2) ||
          (padding.length > 0 && clean.length % 4 !== 0)
        ) {
          throw new SyntaxError("Invalid Base64 padding");
        }

        const normalized = alphabet === "base64url"
          ? data.replace(/-/g, "+").replace(/_/g, "/")
          : data;
        const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
        const binary = atob(padded);
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
      },
    });
  }

  if (typeof Uint8Array.prototype.toBase64 !== "function") {
    Object.defineProperty(Uint8Array.prototype, "toBase64", {
      configurable: true,
      writable: true,
      value(options = {}) {
        const alphabet = options.alphabet ?? "base64";
        if (alphabet !== "base64" && alphabet !== "base64url") {
          throw new TypeError("Invalid Base64 alphabet");
        }

        const bytes = new Uint8Array(this.buffer, this.byteOffset, this.byteLength);
        let binary = "";
        // Keep each spread below the engine's argument-count limit.
        for (let offset = 0; offset < bytes.length; offset += 8192) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        }

        let encoded = btoa(binary);
        if (alphabet === "base64url") {
          encoded = encoded.replace(/\\+/g, "-").replace(/\\//g, "_");
        }
        if (options.omitPadding) encoded = encoded.replace(/=+$/g, "");
        return encoded;
      },
    });
  }
}
