import { textOf } from "./conversation-item.js";

export function renderMessageList({ root, conversation, timeLabel = (value) => value || "" }) {
  if (!root) return;
  if (!conversation) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Pilih percakapan untuk melihat pesan.";
    root.replaceChildren(empty);
    return;
  }
  if (!conversation.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Belum ada pesan dalam percakapan ini.";
    root.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const message of conversation.messages) {
    const outgoing = message.direction === "outbound";
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (outgoing ? "out" : "in");
    bubble.append(document.createTextNode(textOf(message)));

    const meta = document.createElement("div");
    meta.className = "bubble-meta";
    const time = document.createElement("span");
    time.textContent = timeLabel(message.message_timestamp || message.created_at);
    meta.append(time);

    if (outgoing && message.status) {
      const status = document.createElement("span");
      status.textContent = message.status;
      meta.append(status);
    }
    bubble.append(meta);
    fragment.append(bubble);
  }
  root.replaceChildren(fragment);
  root.scrollTop = root.scrollHeight;
}
