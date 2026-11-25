import { getInitials } from "../core/formatters.js";

export function initials(value) {
  return getInitials(value);
}

export function textOf(message = {}) {
  return message.text_body ||
    (message.message_type && message.message_type !== "text"
      ? "[" + message.message_type + "]"
      : "[Pesan tanpa teks]");
}

export function createConversationItem(
  conversation,
  { activePhone = null, timeLabel = (value) => value || "" } = {},
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "contact" + (activePhone === conversation.phone ? " active" : "");
  button.dataset.phone = conversation.phone;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = initials(conversation.name);

  const copy = document.createElement("div");
  copy.className = "contact-copy";
  const line = document.createElement("div");
  line.className = "contact-line";
  const name = document.createElement("span");
  name.className = "contact-name";
  name.textContent = conversation.name;

  const time = document.createElement("time");
  time.className = "contact-time";
  time.textContent = timeLabel(
    conversation.last?.message_timestamp || conversation.last?.created_at,
  );
  line.append(name, time);

  const preview = document.createElement("div");
  preview.className = "contact-preview";
  preview.textContent =
    (conversation.last?.direction === "outbound" ? "Anda: " : "") +
    textOf(conversation.last);

  const phone = document.createElement("div");
  phone.className = "contact-phone";
  phone.textContent = conversation.phone;
  copy.append(line, preview, phone);
  button.append(avatar, copy);
  return button;
}
