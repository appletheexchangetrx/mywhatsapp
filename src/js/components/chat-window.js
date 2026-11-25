import { initials } from "./conversation-item.js";

export function renderChatHeader({
  nameElement,
  phoneElement,
  avatarElement,
  conversation,
}) {
  if (!conversation) {
    if (nameElement) nameElement.textContent = "Percakapan";
    if (phoneElement) phoneElement.textContent = "";
    if (avatarElement) avatarElement.textContent = "?";
    return;
  }

  if (nameElement) nameElement.textContent = conversation.name;
  if (phoneElement) phoneElement.textContent = conversation.phone;
  if (avatarElement) avatarElement.textContent = initials(conversation.name);
}

export function openChat(appElement) {
  appElement?.classList.add("chat-open");
}

export function closeChat(appElement) {
  appElement?.classList.remove("chat-open");
}
