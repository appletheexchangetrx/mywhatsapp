export type JsonObject = Record<string, unknown>;

export type MetaMessagePayload = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: string;
  [key: string]: unknown;
};

export type MetaSendResult = {
  wamid: string;
  response: JsonObject;
};
