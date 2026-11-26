import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConversations,
  phoneOf,
  searchConversations,
} from "../src/js/state/conversation-state.js";
import {
  mergeMessages,
  upsertMessage,
  removeMessage,
} from "../src/js/state/message-state.js";

test("phoneOf groups inbound and outbound messages by customer phone", () => {
  assert.equal(phoneOf({ direction: "inbound", from_phone: "601234" }), "601234");
  assert.equal(
    phoneOf({
      direction: "outbound",
      recipient_phone: "601234",
      from_phone: "business",
    }),
    "601234",
  );
});

test("buildConversations sorts by latest message and preserves newest profile name", () => {
  const conversations = buildConversations([
    {
      id: "1",
      direction: "inbound",
      from_phone: "601111",
      profile_name: "Old Name",
      message_timestamp: "2026-11-25T10:00:00Z",
    },
    {
      id: "2",
      direction: "inbound",
      from_phone: "601111",
      profile_name: "Current Name",
      message_timestamp: "2026-11-26T10:00:00Z",
    },
    {
      id: "3",
      direction: "outbound",
      recipient_phone: "602222",
      from_phone: "business",
      message_timestamp: "2026-11-26T11:00:00Z",
    },
  ]);

  assert.deepEqual([...conversations.keys()], ["602222", "601111"]);
  assert.equal(conversations.get("601111").name, "Current Name");
  assert.equal(conversations.get("601111").messages.length, 2);
});

test("searchConversations matches name and phone", () => {
  const conversations = buildConversations([
    {
      id: "1",
      direction: "inbound",
      from_phone: "601234",
      profile_name: "Apple Customer",
      message_timestamp: "2026-11-26T10:00:00Z",
    },
  ]);

  assert.equal(searchConversations(conversations, "apple").length, 1);
  assert.equal(searchConversations(conversations, "601234").length, 1);
  assert.equal(searchConversations(conversations, "missing").length, 0);
});

test("mergeMessages merges duplicate IDs while retaining latest fields", () => {
  const messages = mergeMessages(
    [{ id: "1", text_body: "old", status: "accepted" }],
    [{ id: "1", text_body: "new", status: "sent" }, { id: "2" }],
  );

  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], { id: "1", text_body: "new", status: "sent" });
});

test("upsertMessage updates by database ID or WAMID", () => {
  const messages = upsertMessage(
    [{ id: "1", wamid: "wamid.1", status: "accepted" }],
    { wamid: "wamid.1", status: "delivered" },
  );

  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, "delivered");
});

test("removeMessage removes the matching message without mutating the input", () => {
  const original = [{ id: "1" }, { id: "2" }];
  const result = removeMessage(original, { id: "1" });

  assert.deepEqual(result, [{ id: "2" }]);
  assert.equal(original.length, 2);
});
