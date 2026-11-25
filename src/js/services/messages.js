import { supabase } from "./supabase.js";

const MESSAGE_COLUMNS = [
  "id",
  "wamid",
  "from_phone",
  "profile_name",
  "display_phone_number",
  "message_type",
  "text_body",
  "message_timestamp",
  "created_at",
  "direction",
  "status",
  "recipient_phone",
].join(",");

/**
 * Fetch the most recent message rows from trx_messages.
 * Keeps the existing query contract: created_at descending, default 50 rows.
 */
export async function fetchMessages(limit = 50) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;

  const { data, error } = await supabase
    .from("trx_messages")
    .select(MESSAGE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data ?? [];
}
