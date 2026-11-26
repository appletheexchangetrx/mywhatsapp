import { buildInteractivePayload, buildTextPayload, normalizeRecipient, RequestValidationError } from "./validation.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function expectValidationError(run: () => unknown): void {
  let thrown = false;
  try { run(); } catch (error) {
    if (error instanceof RequestValidationError) thrown = true;
    else throw error;
  }
  assert(thrown, "Expected RequestValidationError.");
}

Deno.test("normalizes international recipient numbers", () => {
  assert(normalizeRecipient("+62 812-3456-7890") === "6281234567890", "Recipient was not normalized.");
});

Deno.test("rejects malformed recipient numbers", () => {
  expectValidationError(() => normalizeRecipient("abc"));
  expectValidationError(() => normalizeRecipient("123"));
});

Deno.test("builds text message payload", () => {
  const payload = buildTextPayload("6281234567890", { message: "Hello", preview_url: true });
  assert(payload.type === "text", "Expected text payload.");
  assert((payload.text as Record<string, unknown>).body === "Hello", "Text body mismatch.");
});

Deno.test("validates interactive list message", () => {
  const payload = buildInteractivePayload("6281234567890", {
    type: "list",
    body: { text: "Choose one" },
    action: {
      button: "Options",
      sections: [{ title: "Section", rows: [{ id: "row_1", title: "Option 1" }] }],
    },
  });
  assert(payload.type === "interactive", "Expected interactive payload.");
});

Deno.test("validates reply buttons", () => {
  buildInteractivePayload("6281234567890", {
    type: "button",
    body: { text: "Choose one" },
    action: {
      buttons: [
        { type: "reply", reply: { id: "yes", title: "Yes" } },
        { type: "reply", reply: { id: "no", title: "No" } },
      ],
    },
  });
});

Deno.test("validates catalog message", () => {
  buildInteractivePayload("6281234567890", {
    type: "catalog_message",
    body: { text: "Browse our catalog" },
    action: { name: "catalog_message" },
  });
});

Deno.test("validates single and multi-product messages", () => {
  buildInteractivePayload("6281234567890", {
    type: "product",
    action: { catalog_id: "catalog_1", product_retailer_id: "sku_1" },
  });
  buildInteractivePayload("6281234567890", {
    type: "product_list",
    header: { type: "text", text: "Featured products" },
    body: { text: "Choose a product" },
    action: {
      catalog_id: "catalog_1",
      sections: [{ title: "Featured", product_items: [{ product_retailer_id: "sku_1" }] }],
    },
  });
});

Deno.test("rejects unsupported interactive message types", () => {
  expectValidationError(() => buildInteractivePayload("6281234567890", {
    type: "location_request_message",
    body: { text: "Share location" },
  }));
});

Deno.test("rejects list messages with more than ten rows", () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({
    id: "row_" + index,
    title: "Option " + index,
  }));
  expectValidationError(() => buildInteractivePayload("6281234567890", {
    type: "list",
    body: { text: "Choose one" },
    action: { button: "Options", sections: [{ rows }] },
  }));
});

Deno.test("rejects more than three reply buttons", () => {
  expectValidationError(() => buildInteractivePayload("6281234567890", {
    type: "button",
    body: { text: "Choose one" },
    action: {
      buttons: Array.from({ length: 4 }, (_, index) => ({
        type: "reply",
        reply: { id: "id_" + index, title: "Button " + index },
      })),
    },
  }));
});

Deno.test("validates interactive product carousel", () => {
  buildInteractivePayload("6281234567890", {
    type: "carousel",
    body: { text: "Which product do you prefer?" },
    action: {
      cards: [
        { card_index: 0, type: "product", action: { product_retailer_id: "sku_1", catalog_id: "catalog_1" } },
        { card_index: 1, type: "product", action: { product_retailer_id: "sku_2", catalog_id: "catalog_1" } },
      ],
    },
  });
});

Deno.test("rejects product carousel cards with different catalogs", () => {
  expectValidationError(() => buildInteractivePayload("6281234567890", {
    type: "carousel",
    body: { text: "Choose a product" },
    action: {
      cards: [
        { card_index: 0, type: "product", action: { product_retailer_id: "sku_1", catalog_id: "catalog_1" } },
        { card_index: 1, type: "product", action: { product_retailer_id: "sku_2", catalog_id: "catalog_2" } },
      ],
    },
  }));
});

Deno.test("accepts the documented 4096-character interactive list body", () => {
  const body = "x".repeat(4096);
  buildInteractivePayload("6281234567890", {
    type: "list",
    body: { text: body },
    action: {
      button: "Options",
      sections: [{ title: "Section", rows: [{ id: "row_1", title: "Option 1" }] }],
    },
  });
});

Deno.test("rejects a non-text list header", () => {
  expectValidationError(() => buildInteractivePayload("6281234567890", {
    type: "list",
    header: { type: "image", image: { link: "https://example.com/image.jpg" } },
    body: { text: "Choose one" },
    action: { button: "Options", sections: [{ title: "Section", rows: [{ id: "row_1", title: "Option 1" }] }] },
  }));
});

Deno.test("rejects product-list sections without a title", () => {
  expectValidationError(() => buildInteractivePayload("6281234567890", {
    type: "product_list",
    header: { type: "text", text: "Featured products" },
    body: { text: "Choose a product" },
    action: {
      catalog_id: "catalog_1",
      sections: [{ product_items: [{ product_retailer_id: "sku_1" }] }],
    },
  }));
});
