function messageKey(message) {
  return message?.id || message?.wamid || null;
}

export function mergeMessages(existing = [], incoming = []) {
  const merged = new Map();

  for (const message of [...existing, ...incoming]) {
    const key = messageKey(message);
    if (!key) continue;
    merged.set(key, { ...(merged.get(key) || {}), ...message });
  }

  return [...merged.values()];
}

export function upsertMessage(messages = [], incoming) {
  if (!incoming) return [...messages];

  const key = messageKey(incoming);
  if (!key) return [...messages, incoming];

  const index = messages.findIndex((message) => messageKey(message) === key);
  if (index < 0) return [...messages, incoming];

  return messages.map((message, currentIndex) =>
    currentIndex === index ? { ...message, ...incoming } : message
  );
}

export function removeMessage(messages = [], target) {
  if (!target) return [...messages];

  return messages.filter((message) => {
    if (target.id && message.id === target.id) return false;
    if (target.wamid && message.wamid === target.wamid) return false;
    return true;
  });
}
