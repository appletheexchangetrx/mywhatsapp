function messageKeys(message) {
  const keys = [];
  if (message?.id) keys.push(`id:${message.id}`);
  if (message?.wamid) keys.push(`wamid:${message.wamid}`);
  return keys;
}

function findMessageIndex(messages, target) {
  return messages.findIndex((message) =>
    (target?.id && message?.id === target.id) ||
    (target?.wamid && message?.wamid === target.wamid)
  );
}

export function mergeMessages(existing = [], incoming = []) {
  const merged = [];
  const indexByKey = new Map();

  for (const message of [...existing, ...incoming]) {
    const keys = messageKeys(message);
    if (!keys.length) continue;

    let index;
    for (const key of keys) {
      if (indexByKey.has(key)) {
        index = indexByKey.get(key);
        break;
      }
    }

    if (index === undefined) {
      index = merged.length;
      merged.push({ ...message });
    } else {
      merged[index] = { ...merged[index], ...message };
    }

    for (const key of messageKeys(merged[index])) {
      indexByKey.set(key, index);
    }
  }

  return merged;
}

export function upsertMessage(messages = [], incoming) {
  if (!incoming) return [...messages];

  const keys = messageKeys(incoming);
  if (!keys.length) return [...messages, incoming];

  const index = findMessageIndex(messages, incoming);
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
