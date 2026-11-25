import { fetchMessages } from "./services/messages.js";
import { subscribeToMessages } from "./services/realtime.js";
import { sendWhatsAppMessage } from "./services/whatsapp.js";
import { getElement } from "./core/utils.js";
import { formatTimeLabel } from "./core/formatters.js";
import { getState, setState, subscribe, resetState } from "./state/app-state.js";
import { buildConversations } from "./state/conversation-state.js";
import { mergeMessages, upsertMessage, removeMessage } from "./state/message-state.js";
import { setConnection } from "./components/header.js";
import { renderConversationList, bindConversationSelection } from "./components/conversation-list.js";
import { renderChatHeader, openChat, closeChat } from "./components/chat-window.js";
import { renderMessageList } from "./components/message-list.js";
import { bindMessageInput } from "./components/message-input.js";

let activeApp = null;

function requiredElement(id) {
  const element = getElement(id);
  if (!element) throw new Error("Required application element not found: #" + id);
  return element;
}

export function createApp() {
  if (activeApp && !activeApp.destroyed) return activeApp;
  if (typeof document === "undefined") {
    throw new Error("WhatsApp app requires a browser document.");
  }

  const appElement = requiredElement("app");
  const elements = {
    app: appElement,
    connection: requiredElement("connection"),
    search: requiredElement("search"),
    count: requiredElement("conversation-count"),
    list: requiredElement("conversation-list"),
    back: requiredElement("back-button"),
    chatName: requiredElement("chat-name"),
    chatPhone: requiredElement("chat-phone"),
    chatAvatar: requiredElement("chat-avatar"),
    messageArea: requiredElement("message-area"),
    composer: requiredElement("composer"),
    input: requiredElement("message-input"),
    send: requiredElement("send-button"),
  };

  resetState();
  let destroyed = false;
  let realtimeReady = false;
  let fetchVersion = 0;
  const cleanups = new Set();

  const registerCleanup = (cleanup) => {
    if (typeof cleanup !== "function") throw new TypeError("Cleanup must be a function.");
    if (destroyed) {
      cleanup();
      return () => {};
    }
    cleanups.add(cleanup);
    return () => cleanups.delete(cleanup);
  };

  const updateConversations = (messages) => {
    setState({ messages, conversations: buildConversations(messages) });
  };

  const render = (state) => {
    renderConversationList({
      root: elements.list,
      countElement: elements.count,
      conversations: state.conversations,
      activePhone: state.active,
      query: elements.search.value,
      timeLabel: formatTimeLabel,
    });

    const conversation = state.active
      ? state.conversations.get(state.active) || null
      : null;
    renderChatHeader({
      nameElement: elements.chatName,
      phoneElement: elements.chatPhone,
      avatarElement: elements.chatAvatar,
      conversation,
    });
    renderMessageList({
      root: elements.messageArea,
      conversation,
      timeLabel: formatTimeLabel,
    });

    if (conversation) openChat(elements.app);
    else closeChat(elements.app);
    elements.send.disabled = state.sending || !conversation;
  };

  const unsubscribeState = subscribe(render);
  registerCleanup(unsubscribeState);

  const openConversation = (phone) => {
    if (!getState().conversations.has(phone)) return;
    setState({ active: phone });
  };

  const closeConversation = () => setState({ active: null });

  registerCleanup(bindConversationSelection(elements.list, openConversation));
  const handleSearch = () => render(getState());
  elements.search.addEventListener("input", handleSearch);
  registerCleanup(() => elements.search.removeEventListener("input", handleSearch));

  const handleBack = () => closeConversation();
  elements.back.addEventListener("click", handleBack);
  registerCleanup(() => elements.back.removeEventListener("click", handleBack));

  registerCleanup(bindMessageInput({
    form: elements.composer,
    input: elements.input,
    button: elements.send,
    isSending: () => getState().sending,
    onSendingChange: (sending) => setState({ sending }),
    onSend: async (message) => {
      const conversation = getState().conversations.get(getState().active);
      if (!conversation) throw new Error("Pilih percakapan terlebih dahulu.");
      await sendWhatsAppMessage(conversation.phone, message);
      elements.input.value = "";
      await loadMessages();
    },
    onError: (error) => {
      console.error("WhatsApp send failed:", error);
      window.alert("Pesan gagal dikirim: " + (error?.message || "Kesalahan tidak diketahui."));
    },
  }));

  async function loadMessages() {
    const requestVersion = ++fetchVersion;
    try {
      const fetched = await fetchMessages(1000);
      if (destroyed || requestVersion !== fetchVersion) return;
      const current = getState().messages;
      // Keep records already observed via Realtime if fetch completed later.
      const merged = mergeMessages(current, fetched);
      updateConversations(merged);
      if (!realtimeReady) {
        setConnection(elements.connection, "Realtime menghubungkan", "#f59e0b");
      }
    } catch (error) {
      console.error("Failed to load WhatsApp messages:", error);
      setConnection(elements.connection, "Periksa akses tabel", "#ef4444");
    }
  }

  const stopRealtime = subscribeToMessages({
    onMessage: ({ eventType, record }) => {
      if (destroyed || !record) return;
      const current = getState().messages;
      const next = eventType === "DELETE"
        ? removeMessage(current, record)
        : upsertMessage(current, record);
      updateConversations(next);

      const active = getState().active;
      if (active && !getState().conversations.has(active)) {
        setState({ active: null });
      }
    },
    onStatus: (status, error) => {
      if (destroyed) return;
      if (status === "SUBSCRIBED") {
        realtimeReady = true;
        setConnection(elements.connection, "Realtime aktif", "#25d366");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        realtimeReady = false;
        setConnection(elements.connection, "Realtime terputus", "#ef4444");
        if (error) console.error("Realtime subscription error:", error);
      } else {
        realtimeReady = false;
        setConnection(elements.connection, "Menghubungkan", "#f59e0b");
      }
    },
  });
  registerCleanup(stopRealtime);

  async function destroy() {
    if (destroyed) return;
    destroyed = true;
    fetchVersion += 1;
    for (const cleanup of [...cleanups].reverse()) {
      try { cleanup(); } catch (error) {
        console.error("Application cleanup failed:", error);
      }
    }
    cleanups.clear();
    resetState();
    if (activeApp === controller) activeApp = null;
  }

  const controller = Object.freeze({
    registerCleanup,
    destroy,
    get destroyed() { return destroyed; },
    loadMessages,
  });
  activeApp = controller;

  void loadMessages();
  return controller;
}

export function destroyApp() {
  void activeApp?.destroy();
}
