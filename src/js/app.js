import {
  fetchMessages,
  subscribeToMessages,
  sendWhatsAppMessage,
} from "../../assets/js/messages.js";
import {
  registerPushServiceWorker,
  getPushSubscription,
  enablePushNotifications,
  disablePushNotifications,
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  playIncomingMessageSound,
  initializeNotificationAudio,
} from "../../assets/js/push-notifications.js";
import {
  getState,
  setState,
} from "./state/app-state.js";
import {
  buildConversations,
} from "./state/conversation-state.js";
import {
  mergeMessages,
  upsertMessage,
  removeMessage,
} from "./state/message-state.js";
import {
  setConnection,
} from "./components/header.js";
import {
  renderConversationList,
  bindConversationSelection,
} from "./components/conversation-list.js";
import {
  renderChatHeader,
  openChat,
  closeChat,
} from "./components/chat-window.js";
import {
  renderMessageList,
} from "./components/message-list.js";
import {
  bindMessageInput,
} from "./components/message-input.js";

const $ = (id) => document.getElementById(id);

function timeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (sameDay) {
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday = date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  return isYesterday
    ? "Kemarin"
    : date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
    });
}

function rebuildConversations() {
  setState({ conversations: buildConversations(getState().messages) });
}

function renderList() {
  const state = getState();
  renderConversationList({
    root: $("conversation-list"),
    countElement: $("conversation-count"),
    conversations: state.conversations,
    activePhone: state.active,
    query: $("search")?.value || "",
    timeLabel,
  });
}

function renderChat() {
  const state = getState();
  const conversation = state.conversations.get(state.active) || null;

  renderChatHeader({
    nameElement: $("chat-name"),
    phoneElement: $("chat-phone"),
    avatarElement: $("chat-avatar"),
    conversation,
  });
  renderMessageList({
    root: $("message-area"),
    conversation,
    timeLabel,
  });
}

function renderViews() {
  renderList();
  renderChat();
}

function openConversation(phone) {
  if (!getState().conversations.has(phone)) return;
  setState({ active: phone });
  openChat($("app"));
  renderViews();
}

function closeConversation() {
  closeChat($("app"));
  setState({ active: null });
  renderViews();
}

function applyMessageChange(nextMessages) {
  setState({ messages: nextMessages });
  rebuildConversations();

  const state = getState();
  if (state.active && !state.conversations.has(state.active)) {
    setState({ active: null });
    closeChat($("app"));
  }
  renderViews();
}

async function loadMessages() {
  try {
    const fetched = await fetchMessages(1000);
    applyMessageChange(mergeMessages(getState().messages, fetched));
  } catch (error) {
    console.error("Failed to load WhatsApp messages:", error);
    setConnection($("connection"), "Periksa akses tabel", "#ef4444");
  }
}

async function sendMessage(message) {
  const conversation = getState().conversations.get(getState().active);
  if (!conversation || !message) return;

  try {
    await sendWhatsAppMessage(conversation.phone, message);
    $("message-input").value = "";
    await loadMessages();
  } catch (error) {
    alert("Pesan gagal dikirim: " + error.message);
  }
}

function refreshSoundButton() {
  const enabled = isNotificationSoundEnabled();
  const button = $("sound-button");
  if (!button) return;
  button.textContent = enabled ? "Suara: ON" : "Suara: OFF";
  button.setAttribute("aria-pressed", enabled ? "true" : "false");
}

async function refreshPushButton() {
  const button = $("push-button");
  if (!button) return;

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    button.disabled = true;
    button.textContent = "Push tidak didukung";
    return;
  }

  try {
    const subscription = await getPushSubscription();
    button.textContent = subscription
      ? "Notifikasi aktif"
      : "Aktifkan notifikasi";
    button.setAttribute("aria-pressed", subscription ? "true" : "false");
  } catch (error) {
    console.warn("Could not read push subscription:", error);
    button.textContent = "Aktifkan notifikasi";
  }
}

function bindControls() {
  const stopConversationSelection = bindConversationSelection(
    $("conversation-list"),
    openConversation,
  );

  const stopMessageInput = bindMessageInput({
    form: $("composer"),
    input: $("message-input"),
    button: $("send-button"),
    onSend: sendMessage,
    isSending: () => getState().sending,
    onSendingChange: (sending) => setState({ sending }),
  });

  $("search")?.addEventListener("input", renderList);
  $("back-button")?.addEventListener("click", closeConversation);

  $("sound-button")?.addEventListener("click", async () => {
    const enabled = !isNotificationSoundEnabled();
    await setNotificationSoundEnabled(enabled);
    refreshSoundButton();
  });

  $("push-button")?.addEventListener("click", async () => {
    const button = $("push-button");
    button.disabled = true;
    try {
      const subscription = await getPushSubscription();
      if (subscription) {
        await disablePushNotifications();
      } else {
        await enablePushNotifications();
      }
      await refreshPushButton();
    } catch (error) {
      alert("Pengaturan notifikasi gagal: " + error.message);
    } finally {
      button.disabled = false;
    }
  });

  return () => {
    stopConversationSelection();
    stopMessageInput();
  };
}

function startRealtime() {
  return subscribeToMessages({
    onMessage: ({ eventType, record }) => {
      if (eventType === "DELETE") {
        applyMessageChange(removeMessage(getState().messages, record));
        return;
      }

      if (eventType === "INSERT" && record?.direction === "inbound") {
        void playIncomingMessageSound();
      }

      applyMessageChange(upsertMessage(getState().messages, record));
    },
    onStatus: (status) => {
      if (status === "SUBSCRIBED") {
        setConnection($("connection"), "Realtime aktif", "#25d366");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnection($("connection"), "Realtime terputus", "#ef4444");
      } else {
        setConnection($("connection"), "Menghubungkan", "#f59e0b");
      }
    },
  });
}

async function initializeApp() {
  initializeNotificationAudio();
  refreshSoundButton();
  bindControls();

  registerPushServiceWorker()
    .then(refreshPushButton)
    .catch((error) =>
      console.warn("Service Worker registration failed:", error)
    );

  await loadMessages();
  const stopRealtime = startRealtime();

  window.addEventListener("beforeunload", stopRealtime, { once: true });
}

void initializeApp();
