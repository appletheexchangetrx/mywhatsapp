import { supabase } from "./supabase.js";

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export async function registerPushServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Browser ini tidak mendukung Service Worker.");
  }
  return navigator.serviceWorker.register("./sw.js", { scope: "./" });
}

export async function getPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function enablePushNotifications() {
  if (!("PushManager" in window) || !("Notification" in window)) {
    throw new Error("Browser ini tidak mendukung Web Push.");
  }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Izin notifikasi belum diberikan.");
  }

  const registration = await registerPushServiceWorker();
  await navigator.serviceWorker.ready;

  const { data, error } = await supabase.functions.invoke("trx-push-config", { body: {} });
  if (error) throw new Error(error.message || "Tidak dapat mengambil konfigurasi Push.");
  if (typeof data?.publicKey !== "string" || !data.publicKey) {
    throw new Error("VAPID public key belum dikonfigurasi.");
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(data.publicKey),
    });
  }

  const { error: saveError } = await supabase.functions.invoke("trx-push-subscribe", {
    body: {
      subscription: subscription.toJSON(),
      deviceLabel: navigator.userAgent.slice(0, 120),
    },
  });
  if (saveError) throw new Error(saveError.message || "Gagal menyimpan perangkat notifikasi.");

  return subscription;
}

export async function disablePushNotifications() {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const { error } = await supabase.functions.invoke("trx-push-unsubscribe", {
    body: { endpoint: subscription.endpoint },
  });
  if (error) throw new Error(error.message || "Gagal menonaktifkan perangkat notifikasi.");

  await subscription.unsubscribe();
}
