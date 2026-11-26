import type { JsonObject, MetaMessagePayload, MetaSendResult } from "./types.ts";

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: JsonObject,
    readonly retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export function classifyMetaStatus(status: number): "failed" | "retryable" | "unknown" {
  if (status === 429) return "retryable";
  if (status === 408 || status >= 500) return "unknown";
  if (status >= 400 && status < 500) return "failed";
  return "unknown";
}

export async function parseMetaResponse(response: Response): Promise<JsonObject> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as JsonObject
      : { response: parsed };
  } catch {
    return { raw_body: raw.slice(0, 4000), parse_error: "Meta response was not valid JSON." };
  }
}

export async function sendToMeta(payload: MetaMessagePayload): Promise<MetaSendResult> {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION");

  if (!accessToken || !phoneNumberId || !apiVersion) {
    throw new Error("WhatsApp Cloud API configuration is incomplete.");
  }
  if (apiVersion.split(".").length !== 2 || !apiVersion.startsWith("v") || !/^v[0-9]+\.[0-9]+$/.test(apiVersion)) {
    throw new Error("WHATSAPP_API_VERSION must use the format vNN.N.");
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    console.error("WhatsApp Graph API transport failed", String(error));
    throw new Error("Could not confirm the WhatsApp Cloud API outcome.");
  }

  let data: JsonObject;
  try {
    data = await parseMetaResponse(response);
  } catch (error) {
    console.error("Could not read WhatsApp Graph API response", String(error));
    throw new Error("Could not confirm the WhatsApp Cloud API outcome.");
  }

  if (!response.ok) {
    console.error("WhatsApp Graph API rejected message", { status: response.status, response: data });
    throw new MetaApiError(
      "WhatsApp Cloud API returned an error response.",
      response.status,
      { ...data, retry_after: response.headers.get("Retry-After") },
      response.headers.get("Retry-After"),
    );
  }

  const messages = Array.isArray(data.messages) ? data.messages : [];
  const first = messages[0];
  const wamid = typeof first === "object" && first !== null && typeof (first as JsonObject).id === "string"
    ? String((first as JsonObject).id)
    : null;

  if (!wamid) {
    throw new MetaApiError("Meta response did not contain a message ID; send outcome is unknown.", 502, data);
  }
  return { wamid, response: data };
}
