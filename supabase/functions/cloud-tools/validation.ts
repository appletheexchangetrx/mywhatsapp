import type { JsonObject, MetaMessagePayload } from "./types.ts";

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(value: unknown, field: string, maxLength = 4096): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`Field '${field}' is required.`);
  }
  const result = value.trim();
  if (result.length > maxLength) {
    throw new RequestValidationError(`Field '${field}' must not exceed ${maxLength} characters.`);
  }
  return result;
}

export function normalizeRecipient(value: unknown): string {
  if (typeof value !== "string") {
    throw new RequestValidationError("Field 'to' must be a WhatsApp phone number.");
  }
  const to = value.replace(/[+\s()-]/g, "");
  if (!/^\d{8,15}$/.test(to)) {
    throw new RequestValidationError("Field 'to' must be an international WhatsApp number with 8–15 digits.");
  }
  return to;
}

function validateTextObject(value: unknown, field: string, maxLength: number): JsonObject {
  if (!isObject(value)) throw new RequestValidationError(`'${field}' must be an object.`);
  requiredString(value.text, `${field}.text`, maxLength);
  return value;
}

function validateList(interactive: JsonObject): void {
  validateTextObject(interactive.body, "interactive.body", 4096);
  if (interactive.header !== undefined) {
    if (!isObject(interactive.header) || interactive.header.type !== "text") {
      throw new RequestValidationError("List messages support an optional text header only.");
    }
    requiredString(interactive.header.text, "interactive.header.text", 60);
  }
  if (interactive.footer !== undefined) validateTextObject(interactive.footer, "interactive.footer", 60);
  if (!isObject(interactive.action)) throw new RequestValidationError("'interactive.action' is required.");
  requiredString(interactive.action.button, "interactive.action.button", 20);
  if (!Array.isArray(interactive.action.sections) || interactive.action.sections.length < 1 || interactive.action.sections.length > 10) {
    throw new RequestValidationError("List messages require 1–10 action sections.");
  }
  let totalRows = 0;
  for (const [sectionIndex, section] of interactive.action.sections.entries()) {
    if (!isObject(section) || !Array.isArray(section.rows) || section.rows.length < 1) {
      throw new RequestValidationError(`Section ${sectionIndex + 1} must contain at least one row.`);
    }
    requiredString(section.title, `sections[${sectionIndex}].title`, 24);
    for (const [rowIndex, row] of section.rows.entries()) {
      if (!isObject(row)) throw new RequestValidationError("Each list row must be an object.");
      requiredString(row.id, `sections[${sectionIndex}].rows[${rowIndex}].id`, 200);
      requiredString(row.title, `sections[${sectionIndex}].rows[${rowIndex}].title`, 24);
      if (row.description !== undefined) requiredString(row.description, `sections[${sectionIndex}].rows[${rowIndex}].description`, 72);
      totalRows++;
    }
  }
  if (totalRows > 10) throw new RequestValidationError("Interactive list messages support at most 10 rows in total.");
}

function validateButtons(interactive: JsonObject): void {
  validateTextObject(interactive.body, "interactive.body", 1024);
  if (interactive.header !== undefined) {
    const header = interactive.header;
    if (!isObject(header)) throw new RequestValidationError("'interactive.header' must be an object.");
    if (header.type === "text") requiredString(header.text, "interactive.header.text", 60);
    else if (!["image", "video", "document"].includes(String(header.type))) {
      throw new RequestValidationError("Button header type must be text, image, video, or document.");
    }
  }
  if (interactive.footer !== undefined) validateTextObject(interactive.footer, "interactive.footer", 60);
  if (!isObject(interactive.action) || !Array.isArray(interactive.action.buttons)) {
    throw new RequestValidationError("Reply button messages require action.buttons.");
  }
  const buttons = interactive.action.buttons;
  if (buttons.length < 1 || buttons.length > 3) {
    throw new RequestValidationError("Reply button messages require 1–3 buttons.");
  }
  for (const [index, item] of buttons.entries()) {
    if (!isObject(item) || item.type !== "reply" || !isObject(item.reply)) {
      throw new RequestValidationError(`Button ${index + 1} must use type 'reply' and include a reply object.`);
    }
    requiredString(item.reply.id, `buttons[${index}].reply.id`, 256);
    requiredString(item.reply.title, `buttons[${index}].reply.title`, 20);
  }
}

function validateCatalogMessage(interactive: JsonObject): void {
  validateTextObject(interactive.body, "interactive.body", 1024);
  if (!isObject(interactive.action) || interactive.action.name !== "catalog_message") {
    throw new RequestValidationError("Catalog messages require action.name = 'catalog_message'.");
  }
  if (interactive.action.parameters !== undefined) {
    if (!isObject(interactive.action.parameters)) throw new RequestValidationError("Catalog action parameters must be an object.");
    if (interactive.action.parameters.thumbnail_product_retailer_id !== undefined) {
      requiredString(interactive.action.parameters.thumbnail_product_retailer_id, "thumbnail_product_retailer_id", 200);
    }
  }
  if (interactive.footer !== undefined) validateTextObject(interactive.footer, "interactive.footer", 60);
}

function validateSingleProduct(interactive: JsonObject): void {
  if (interactive.body !== undefined) validateTextObject(interactive.body, "interactive.body", 1024);
  if (interactive.footer !== undefined) validateTextObject(interactive.footer, "interactive.footer", 60);
  if (!isObject(interactive.action)) throw new RequestValidationError("Single product messages require an action object.");
  requiredString(interactive.action.catalog_id, "interactive.action.catalog_id", 128);
  requiredString(interactive.action.product_retailer_id, "interactive.action.product_retailer_id", 200);
}

function validateProductList(interactive: JsonObject): void {
  validateTextObject(interactive.body, "interactive.body", 1024);
  if (!isObject(interactive.header) || interactive.header.type !== "text") {
    throw new RequestValidationError("Product-list messages require a text header.");
  }
  requiredString(interactive.header.text, "interactive.header.text", 60);
  if (interactive.footer !== undefined) validateTextObject(interactive.footer, "interactive.footer", 60);
  if (!isObject(interactive.action)) throw new RequestValidationError("Product-list messages require an action object.");
  requiredString(interactive.action.catalog_id, "interactive.action.catalog_id", 128);
  if (!Array.isArray(interactive.action.sections) || interactive.action.sections.length < 1 || interactive.action.sections.length > 10) {
    throw new RequestValidationError("Product-list messages require 1–10 sections.");
  }
  let totalProducts = 0;
  for (const [sectionIndex, section] of interactive.action.sections.entries()) {
    if (!isObject(section) || !Array.isArray(section.product_items) || section.product_items.length < 1) {
      throw new RequestValidationError(`Product section ${sectionIndex + 1} must contain product_items.`);
    }
    requiredString(section.title, `sections[${sectionIndex}].title`, 24);
    for (const item of section.product_items) {
      if (!isObject(item)) throw new RequestValidationError("Each product item must be an object.");
      requiredString(item.product_retailer_id, "product_retailer_id", 200);
      totalProducts++;
    }
  }
  if (totalProducts > 30) throw new RequestValidationError("Product-list messages support at most 30 products.");
}

function validateProductCarousel(interactive: JsonObject): void {
  validateTextObject(interactive.body, "interactive.body", 1024);
  if (interactive.header !== undefined || interactive.footer !== undefined) {
    throw new RequestValidationError("Product carousel messages do not support a header or footer.");
  }
  if (!isObject(interactive.action) || !Array.isArray(interactive.action.cards)) {
    throw new RequestValidationError("Product carousel messages require action.cards.");
  }
  const cards = interactive.action.cards;
  if (cards.length < 2 || cards.length > 10) {
    throw new RequestValidationError("Product carousel messages require 2–10 cards.");
  }
  const indexes = new Set<number>();
  let catalogId: string | null = null;
  for (const [position, card] of cards.entries()) {
    if (!isObject(card) || card.type !== "product" || !isObject(card.action)) {
      throw new RequestValidationError(`Card ${position + 1} must be a product card with an action object.`);
    }
    if (!Number.isInteger(card.card_index) || Number(card.card_index) < 0 || Number(card.card_index) > 9) {
      throw new RequestValidationError("Each product carousel card_index must be a unique integer from 0 to 9.");
    }
    const cardIndex = Number(card.card_index);
    if (indexes.has(cardIndex)) throw new RequestValidationError("Product carousel card_index values must be unique.");
    indexes.add(cardIndex);
    requiredString(card.action.product_retailer_id, `cards[${position}].action.product_retailer_id`, 200);
    const currentCatalogId = requiredString(card.action.catalog_id, `cards[${position}].action.catalog_id`, 128);
    if (catalogId !== null && currentCatalogId !== catalogId) {
      throw new RequestValidationError("All product carousel cards must use the same catalog_id.");
    }
    catalogId = currentCatalogId;
  }
}

export function validateInteractive(interactive: unknown): JsonObject {
  if (!isObject(interactive)) throw new RequestValidationError("Field 'interactive' must be an object.");
  const type = String(interactive.type ?? "");
  switch (type) {
    case "list": validateList(interactive); break;
    case "button": validateButtons(interactive); break;
    case "catalog_message": validateCatalogMessage(interactive); break;
    case "product": validateSingleProduct(interactive); break;
    case "product_list": validateProductList(interactive); break;
    case "carousel": validateProductCarousel(interactive); break;
    default:
      throw new RequestValidationError("Unsupported interactive type. Supported: list, button, catalog_message, product, product_list, carousel (product cards).");
  }
  return interactive;
}

export function buildTextPayload(to: string, body: JsonObject): MetaMessagePayload {
  const message = requiredString(body.message ?? body.text, "message", 4096);
  const previewUrl = body.preview_url === true;
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: previewUrl, body: message },
  };
}

export function buildInteractivePayload(to: string, interactive: unknown): MetaMessagePayload {
  const value = validateInteractive(interactive);
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: value,
  };
}

export function buildGenericPayload(to: string, body: JsonObject): MetaMessagePayload {
  const type = requiredString(body.type, "type", 40);
  if (type === "interactive") {
    return buildInteractivePayload(to, body.interactive);
  }
  const payload: JsonObject = { ...body };
  delete payload.to;
  delete payload.type;
  delete payload.messaging_product;
  delete payload.recipient_type;
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type,
    ...payload,
  } as MetaMessagePayload;
}
