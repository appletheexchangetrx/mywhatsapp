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


const SOUND_PREFERENCE_KEY = "trx_notification_sound_enabled";
let notificationAudioContext = null;

export function isNotificationSoundEnabled() {
  try {
    return localStorage.getItem(SOUND_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

export async function setNotificationSoundEnabled(enabled) {
  try {
    localStorage.setItem(SOUND_PREFERENCE_KEY, enabled ? "true" : "false");
  } catch {
    // Keep the in-memory preference for this page session.
  }

  if (enabled) await primeNotificationAudio();
  return enabled;
}

async function getNotificationAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!notificationAudioContext) notificationAudioContext = new AudioContextClass();
  if (notificationAudioContext.state === "suspended") {
    await notificationAudioContext.resume();
  }
  return notificationAudioContext;
}

async function primeNotificationAudio() {
  try {
    const context = await getNotificationAudioContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.01);
  } catch (error) {
    console.warn("Notification audio could not be enabled:", error);
  }
}

export async function playIncomingMessageSound() {
  if (!isNotificationSoundEnabled()) return;

  try {
    const context = await getNotificationAudioContext();
    if (!context || context.state !== "running") return;

    const startAt = context.currentTime + 0.015;
    for (const [offset, frequency] of [[0, 880], [0.14, 1174.66]]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, startAt + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.11);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.12);
    }
  } catch (error) {
    console.warn("Incoming message sound failed:", error);
  }
}

let notificationAudioPrimingInstalled = false;

export function initializeNotificationAudio() {
  if (notificationAudioPrimingInstalled || typeof document === "undefined") return;
  notificationAudioPrimingInstalled = true;

  const primeOnInteraction = () => {
    if (isNotificationSoundEnabled()) {
      void primeNotificationAudio();
    }
    document.removeEventListener("pointerdown", primeOnInteraction, true);
    document.removeEventListener("keydown", primeOnInteraction, true);
  };

  document.addEventListener("pointerdown", primeOnInteraction, {
    once: true,
    capture: true,
  });
  document.addEventListener("keydown", primeOnInteraction, {
    once: true,
    capture: true,
  });
}
