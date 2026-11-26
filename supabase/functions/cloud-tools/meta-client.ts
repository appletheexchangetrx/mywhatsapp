import type { JsonObject, MetaMessagePayload, MetaSendResult } from "./types.ts";

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: JsonObject,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export async function sendToMeta(payload: MetaMessagePayload): Promise<MetaSendResult> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION");

  if (!accessToken || !phoneNumberId || !apiVersion) {
    throw new Error("WhatsApp Cloud API configuration is incomplete.");
  }
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error("WHATSAPP_API_VERSION must use the format vNN.N.");
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  let response: Response;
  let data: JsonObject;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const parsed: unknown = await response.json();
    data = typeof parsed === "object" && parsed !== null ? parsed as JsonObject : {};
  } catch (error) {
    console.error("WhatsApp Graph API request failed", String(error));
    throw new Error("Could not reach WhatsApp Cloud API.");
  }

  if (!response.ok) {
    console.error("WhatsApp Graph API rejected message", { status: response.status, response: data });
    throw new MetaApiError("WhatsApp rejected the message.", response.status, data);
  }

  const messages = Array.isArray(data.messages) ? data.messages : [];
  const first = messages[0];
  const wamid = typeof first === "object" && first !== null && typeof (first as JsonObject).id === "string"
    ? String((first as JsonObject).id)
    : null;

  if (!wamid) {
    throw new MetaApiError("Meta accepted the request but did not return a message ID.", 502, data);
  }

  return { wamid, response: data };
}
