import { supabase } from "./supabase.js";

/**
 * Send a WhatsApp message through the existing server-side Edge Function.
 * Meta credentials remain server-side; the browser only invokes the function.
 */
export async function sendWhatsAppMessage(to, message) {
  const { data, error } = await supabase.functions.invoke(
    "trx-send-messages",
    {
      body: { to, message },
    },
  );

  if (error) {
    let details = error.message;

    try {
      const response = error.context;
      if (response && typeof response.json === "function") {
        const body = await response.clone().json();
        details = body.error || body.message || details;
      }
    } catch {
      // Retain the SDK error message when the response is not JSON.
    }

    throw new Error(details);
  }

  if (data?.success !== true) {
    throw new Error(data?.error || "WhatsApp message could not be sent.");
  }

  return data;
}
