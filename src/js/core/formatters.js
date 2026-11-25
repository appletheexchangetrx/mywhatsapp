/**
 * Pure display formatters shared by UI components.
 */

const DATE_LOCALE = "id-ID";

function toValidDate(value) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Format a conversation timestamp:
 * today -> HH.mm, yesterday -> "Kemarin", older -> date and month.
 * Invalid values produce an empty string.
 */
export function formatTimeLabel(value, now = new Date()) {
  const date = toValidDate(value);
  const reference = toValidDate(now);
  if (!date || !reference) return "";

  const dateKey = (item) => [
    item.getFullYear(),
    item.getMonth(),
    item.getDate()
  ].join("-");

  if (dateKey(date) === dateKey(reference)) {
    return new Intl.DateTimeFormat(DATE_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(date);
  }

  const yesterday = new Date(reference);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey(date) === dateKey(yesterday)) return "Kemarin";

  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: "numeric",
    month: "short"
  }).format(date);
}

/** Return up to two initials from a display name or phone fallback. */
export function getInitials(value) {
  const text = value == null ? "" : String(value).trim();
  if (!text) return "?";

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return (words[0][0] + words[1][0]).toLocaleUpperCase(DATE_LOCALE);
  }
  return Array.from(words[0]).slice(0, 2).join("").toLocaleUpperCase(DATE_LOCALE);
}

/** Resolve a readable message preview from common message shapes. */
export function getMessageText(message) {
  if (!message || typeof message !== "object") return "";

  const directText = message.text ?? message.body ?? message.message;
  if (typeof directText === "string" && directText.trim()) return directText;

  const type = String(message.type ?? message.message_type ?? "").toLowerCase();
  const labels = {
    image: "Foto",
    video: "Video",
    audio: "Pesan suara",
    voice: "Pesan suara",
    document: "Dokumen",
    sticker: "Stiker",
    location: "Lokasi",
    contacts: "Kontak",
    template: "Template",
    interactive: "Pesan interaktif"
  };

  return labels[type] || (type ? "Pesan" : "");
}
