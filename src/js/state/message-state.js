function messageKey(message) {
  if (message?.id != null && message.id !== "") return "id:" + message.id;
  if (message?.wamid) return "wamid:" + message.wamid;

  // Stable fallback for legacy rows without a database or WhatsApp ID.
  // JSON encoding avoids delimiter collisions between field values.
  const phone = message?.direction === "outbound"
    ? (message?.recipient_phone || message?.from_phone || "")
    : (message?.from_phone || "");
  const timestamp = message?.message_timestamp || message?.created_at || "";
  const body = message?.text_body || "";
  const type = message?.message_type || "";
  const fallback = [phone, message?.direction || "", timestamp, type, body];
  if (fallback.some((value) => value !== "")) {
    return "fallback:" + JSON.stringify(fallback);
  }

  // Do not silently discard records with an unfamiliar shape.
  return "fallback-json:" + JSON.stringify(message ?? null);
}

export function mergeMessages(existing = [], incoming = []) {
  const merged = new Map();
  // Incoming is loaded first so already-observed realtime rows win fetch races.
  for (const message of [...incoming, ...existing]) {
    const key = messageKey(message);
    merged.set(key, { ...(merged.get(key) || {}), ...message });
  }
  return [...merged.values()].sort((a, b) => {
    const at = new Date(a?.message_timestamp || a?.created_at || 0).getTime() || 0;
    const bt = new Date(b?.message_timestamp || b?.created_at || 0).getTime() || 0;
    return at - bt;
  });
}

export function upsertMessage(messages = [], incoming) {
  if (!incoming) return [...messages];
  const key = messageKey(incoming);
  const index = messages.findIndex((message) => messageKey(message) === key);
  if (index < 0) return mergeMessages(messages, [incoming]);
  return mergeMessages(messages.map((message, currentIndex) =>
    currentIndex === index ? { ...message, ...incoming } : message), []);
}

export function removeMessage(messages = [], target) {
  if (!target) return [...messages];
  const targetKey = messageKey(target);
  return messages.filter((message) => messageKey(message) !== targetKey);
}
