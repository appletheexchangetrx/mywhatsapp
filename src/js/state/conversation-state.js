export function phoneOf(message) {
  return message?.direction === "outbound"
    ? (message.recipient_phone || message.from_phone || "")
    : (message?.from_phone || "");
}

export function timestampOf(message) {
  return message?.message_timestamp || message?.created_at || null;
}

export function timestampValue(message) {
  const value = timestampOf(message);
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildConversations(messages = []) {
  const grouped = new Map();

  for (const message of messages) {
    const phone = phoneOf(message);
    if (!phone) continue;

    if (!grouped.has(phone)) {
      grouped.set(phone, {
        phone,
        name: phone,
        profileName: "",
        profileNameAt: -1,
        displayPhoneNumber: "",
        displayPhoneNumberAt: -1,
        messages: [],
        last: null,
      });
    }

    const conversation = grouped.get(phone);
    const timestamp = timestampValue(message);
    conversation.messages.push(message);

    const profileName = String(message.profile_name || "").trim();
    if (profileName && timestamp >= conversation.profileNameAt) {
      conversation.profileName = profileName;
      conversation.profileNameAt = timestamp;
    }

    const displayPhoneNumber = String(message.display_phone_number || "").trim();
    if (displayPhoneNumber && timestamp >= conversation.displayPhoneNumberAt) {
      conversation.displayPhoneNumber = displayPhoneNumber;
      conversation.displayPhoneNumberAt = timestamp;
    }

    if (!conversation.last || timestamp > timestampValue(conversation.last)) {
      conversation.last = message;
    }
  }

  for (const conversation of grouped.values()) {
    conversation.name =
      conversation.profileName ||
      conversation.displayPhoneNumber ||
      conversation.phone;

    conversation.messages.sort(
      (a, b) => timestampValue(a) - timestampValue(b),
    );
  }

  return new Map(
    [...grouped.entries()].sort(
      (a, b) => timestampValue(b[1].last) - timestampValue(a[1].last),
    ),
  );
}

export function searchConversations(conversations, query = "") {
  const normalizedQuery = String(query).trim().toLocaleLowerCase("id-ID");
  if (!normalizedQuery) return [...conversations.values()];

  return [...conversations.values()].filter((conversation) =>
    conversation.phone.toLocaleLowerCase("id-ID").includes(normalizedQuery) ||
    conversation.name.toLocaleLowerCase("id-ID").includes(normalizedQuery) ||
    conversation.displayPhoneNumber.toLocaleLowerCase("id-ID").includes(normalizedQuery)
  );
}
