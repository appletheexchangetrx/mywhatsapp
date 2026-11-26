import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { send } from "jsr:@daaku/webpush@0.2.0";
import { installUint8ArrayBase64Compatibility } from "../_shared/webpush-base64-compat.js";

// @daaku/webpush@0.2.0 uses Base64 typed-array APIs absent in some Edge runtimes.
// Install the compatibility methods before the first call to send().
installUint8ArrayBase64Compatibility();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function admin() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (raw) {
    try {
      key = JSON.parse(raw).default ?? key;
    } catch {
      // Fall back to the dedicated service-role environment variable.
    }
  }
  const url = Deno.env.get("SUPABASE_URL");
  if (!url || !key) throw new Error("Supabase server credentials unavailable");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function describePushError(error: unknown) {
  const value = error as {
    statusCode?: unknown;
    permanent?: unknown;
    name?: unknown;
    message?: unknown;
  };
  const rawMessage = typeof value?.message === "string"
    ? value.message
    : String(error);
  return {
    statusCode: typeof value?.statusCode === "number" ? value.statusCode : null,
    permanent: value?.permanent === true,
    errorName: typeof value?.name === "string" ? value.name.slice(0, 80) : "UnknownError",
    errorMessage: rawMessage.replace(/https?:\/\/\S+/g, "[redacted-url]").slice(0, 240),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const vapidSubject =
    Deno.env.get("VAPID_SUBJECT") ||
    "https://appletheexchangetrx.github.io/mywhatsapp/";

  try {
    const db = admin();
    const { data: vapidConfig, error: vapidError } = await db.rpc(
      "get_trx_push_vapid_config",
    );
    if (vapidError) throw vapidError;
    if (!vapidConfig?.private_key || !vapidConfig?.public_key) {
      throw new Error("VAPID keys are missing from Vault");
    }

    const vapid = vapidConfig.private_key as JsonWebKey;
    const decode = (value: string) => {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      return Uint8Array.from(
        atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)),
        (character) => character.charCodeAt(0),
      );
    };

    const privateCryptoKey = await crypto.subtle.importKey(
      "jwk",
      vapid,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const publicCryptoKey = await crypto.subtle.importKey(
      "raw",
      decode(vapidConfig.public_key),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const probe = new TextEncoder().encode("vapid-key-pair-check");
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateCryptoKey,
      probe,
    );
    if (
      !await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicCryptoKey,
        signature,
        probe,
      )
    ) {
      throw new Error("VAPID public/private key pair mismatch");
    }

    const { data: subscriptions, error: subscriptionError } = await db
      .from("trx_push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("enabled", true);
    if (subscriptionError) throw subscriptionError;

    if (!subscriptions?.length) {
      console.info("Push dispatch waiting for an enabled subscription");
      return json({
        success: true,
        processed: 0,
        waitingForSubscription: true,
      });
    }

    const { data: events, error: claimError } = await db.rpc(
      "claim_trx_push_outbox",
      { batch_size: 20 },
    );
    if (claimError) throw claimError;
    if (!events?.length) {
      console.info("Push dispatch completed with no eligible outbox events", {
        activeSubscriptions: subscriptions.length,
      });
      return json({ success: true, processed: 0 });
    }

    let delivered = 0;
    let failed = 0;

    for (const event of events) {
      let retry = false;
      let deliveredForEvent = 0;
      const { data: message, error: messageError } = await db
        .from("trx_messages")
        .select("from_phone,profile_name,text_body,message_type")
        .eq("id", event.message_id)
        .maybeSingle();
      if (messageError) throw messageError;

      const notificationTitle =
        typeof message?.profile_name === "string" && message.profile_name
          ? message.profile_name
          : typeof message?.from_phone === "string" && message.from_phone
          ? message.from_phone
          : "WhatsApp";
      const messagePreview =
        typeof message?.text_body === "string" && message.text_body
          ? message.text_body
          : typeof message?.message_type === "string"
          ? `Pesan ${message.message_type}`
          : "Anda menerima pesan baru.";
      const notificationBody = messagePreview.length > 160
        ? messagePreview.slice(0, 157) + "..."
        : messagePreview;

      for (const subscription of subscriptions) {
        try {
          await send(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            JSON.stringify({
              title: notificationTitle,
              body: notificationBody,
              url: "./",
              tag: `wa-${event.message_id}`,
            }),
            { vapid, subscriber: vapidSubject, ttl: 60 },
          );
          delivered++;
          deliveredForEvent++;
        } catch (error) {
          const details = describePushError(error);
          if (
            details.permanent ||
            details.statusCode === 404 ||
            details.statusCode === 410
          ) {
            const { error: disableError } = await db
              .from("trx_push_subscriptions")
              .update({
                enabled: false,
                updated_at: new Date().toISOString(),
              })
              .eq("id", subscription.id);
            if (disableError) throw disableError;
          } else {
            retry = true;
          }

          console.warn("Web Push delivery failed", {
            eventId: event.id,
            subscriptionId: subscription.id,
            ...details,
          });
        }
      }

      const now = new Date();
      const attempts = Number(event.attempts || 0) + 1;
      let outboxUpdate;

      if (retry && deliveredForEvent === 0) {
        outboxUpdate = await db
          .from("trx_push_outbox")
          .update({
            status: attempts >= 8 ? "failed" : "pending",
            attempts,
            next_attempt_at: new Date(
              now.getTime() + Math.min(60, 2 ** attempts) * 60000,
            ).toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", event.id);
        failed++;
      } else if (deliveredForEvent > 0) {
        outboxUpdate = await db
          .from("trx_push_outbox")
          .update({
            status: "sent",
            sent_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", event.id);
      } else {
        outboxUpdate = await db
          .from("trx_push_outbox")
          .update({
            status: "pending",
            attempts,
            next_attempt_at: new Date(now.getTime() + 5 * 60000).toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", event.id);
      }

      if (outboxUpdate.error) throw outboxUpdate.error;
    }

    const result = {
      success: true,
      processed: events.length,
      delivered,
      failed,
      activeSubscriptions: subscriptions.length,
    };
    console.info("Push dispatch completed", result);
    return json(result);
  } catch (error) {
    const details = describePushError(error);
    console.error("Push dispatch failed", details);
    return json({ error: "Push dispatcher failed" }, 500);
  }
});
