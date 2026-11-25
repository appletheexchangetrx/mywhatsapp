import { createConversationItem } from "./conversation-item.js";
import { searchConversations } from "../state/conversation-state.js";

export function renderConversationList({
  root, countElement, conversations, activePhone = null, query = "", timeLabel,
}) {
  if (!root) return;
  const collection = conversations instanceof Map ? conversations : new Map();
  const entries = searchConversations(collection, query);
  if (countElement) countElement.textContent = String(collection.size);

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = String(query).trim()
      ? "Percakapan tidak ditemukan."
      : "Belum ada pesan yang tersimpan.";
    root.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const conversation of entries) {
    fragment.append(createConversationItem(conversation, { activePhone, timeLabel }));
  }
  root.replaceChildren(fragment);
}

export function bindConversationSelection(root, onSelect) {
  if (!root) return () => {};
  const handleClick = (event) => {
    const item = event.target.closest("[data-phone]");
    if (!item || !root.contains(item)) return;
    onSelect?.(item.dataset.phone);
  };
  root.addEventListener("click", handleClick);
  return () => root.removeEventListener("click", handleClick);
}
