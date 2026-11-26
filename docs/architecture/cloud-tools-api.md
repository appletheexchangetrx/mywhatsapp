# Cloud Tools API contract

The `cloud-tools` Edge Function is the single outbound WhatsApp Cloud API entrypoint. Its route handlers build Meta payloads, call the Graph API, and persist accepted outbound messages to `public.trx_messages`.

Base URL:

```text
https://<project-ref>.supabase.co/functions/v1/cloud-tools
```

## Routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/messages/text` | Text message |
| POST | `/messages/interactive` | Interactive list or reply buttons |
| POST | `/messages/catalog` | Open the connected Meta catalog |
| POST | `/messages/product` | Single catalog product |
| POST | `/messages/products` | Multi-product list |
| POST | `/messages/product-carousel` | Interactive product carousel |
| POST | `/messages` | Generic Cloud API message payload |

All routes require `to` as an international WhatsApp recipient number. The function constructs `messaging_product` and `recipient_type`; callers cannot override these envelope fields.

### Idempotency and retry behavior

Send an `Idempotency-Key` header (1–200 characters) for every logical send operation. Reuse the same key only when retrying that same operation.

- The first request durably records its payload fingerprint before calling Meta.
- Reusing the key with the same payload returns the stored result after success; reusing it with a different payload returns HTTP 409.
- A request still being processed returns HTTP 202 and is not sent again.
- A definitive Meta 4xx rejection is recorded as `failed`. Meta HTTP 429 is recorded as `retryable`; wait for `Retry-After` and retry with the same key. Meta HTTP 408, 5xx, transport failures, and stale `sending` records are `unknown` and are never automatically resent.
- If Meta accepted the message but saving `trx_messages` failed, the request is `accepted_unstored`; it is not resent. The WAMID and Meta response are retained, and a retry with the same key attempts database reconciliation without calling Meta again.
- If the header is omitted, the server generates a one-request key. Clients that need safe retry behavior must supply and persist their own key.

## Text

```json
{
  "to": "6281234567890",
  "message": "Halo, ada yang bisa kami bantu?",
  "preview_url": false
}
```

## Interactive list

```json
{
  "to": "6281234567890",
  "interactive": {
    "type": "list",
    "body": { "text": "Silakan pilih kategori." },
    "action": {
      "button": "Lihat kategori",
      "sections": [
        {
          "title": "Produk",
          "rows": [
            { "id": "iphone", "title": "iPhone", "description": "Lihat produk iPhone" },
            { "id": "mac", "title": "Mac", "description": "Lihat produk Mac" }
          ]
        }
      ]
    }
  }
}
```

## Reply buttons

```json
{
  "to": "6281234567890",
  "interactive": {
    "type": "button",
    "body": { "text": "Apakah Anda ingin melanjutkan?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "yes", "title": "Ya" } },
        { "type": "reply", "reply": { "id": "no", "title": "Tidak" } }
      ]
    }
  }
}
```

## Catalog message

```json
{
  "to": "6281234567890",
  "body": "Jelajahi katalog produk kami.",
  "footer": "Apple The Exchange TRX",
  "thumbnail_product_retailer_id": "META_CATALOG_CONTENT_ID"
}
```

The thumbnail ID is optional in the Meta payload. When omitted, WhatsApp can use the first product in the connected catalog. The supplied ID must be the Content ID/Retailer ID in Meta Commerce Manager, not merely a matching local database ID.

## Single product

```json
{
  "to": "6281234567890",
  "catalog_id": "META_CATALOG_ID",
  "product_retailer_id": "META_CATALOG_CONTENT_ID",
  "body": "Produk yang mungkin Anda sukai."
}
```

## Multi-product list

```json
{
  "to": "6281234567890",
  "catalog_id": "META_CATALOG_ID",
  "header": "Pilihan produk",
  "body": "Pilih produk yang ingin Anda lihat.",
  "sections": [
    {
      "title": "iPhone",
      "product_items": [
        { "product_retailer_id": "META_CONTENT_ID_1" },
        { "product_retailer_id": "META_CONTENT_ID_2" }
      ]
    }
  ]
}
```

## Interactive product carousel

```json
{
  "to": "6281234567890",
  "body": "Produk mana yang Anda pilih?",
  "cards": [
    {
      "card_index": 0,
      "type": "product",
      "action": {
        "product_retailer_id": "META_CONTENT_ID_1",
        "catalog_id": "META_CATALOG_ID"
      }
    },
    {
      "card_index": 1,
      "type": "product",
      "action": {
        "product_retailer_id": "META_CONTENT_ID_2",
        "catalog_id": "META_CATALOG_ID"
      }
    }
  ]
}
```

Route: `POST /messages/product-carousel`.

The Product Carousel is an interactive catalog message, not a media carousel. It requires 2–10 product cards, unique `card_index` values from 0 to 9, and the same `catalog_id` on every card. It has a required body and does not support a header, footer, or buttons. Each card must use `type: "product"` and provide both `product_retailer_id` and `catalog_id`.

## Validation and scope

- Text body: maximum 4,096 characters.
- Interactive body: maximum 1,024 characters.
- Interactive list: body maximum 4,096 characters; 1–10 sections; maximum 10 rows total; section title maximum 24 characters; list button maximum 20 characters. Header, when present, is text-only.
- Reply buttons: 1–3 buttons; title maximum 20 characters.
- Catalog footer: maximum 60 characters.
- Product list: at least one section and maximum 30 product items total. Each section requires a title and at least one product item; the implementation does not impose an undocumented section-count or title-length limit.
- Product carousel: 2–10 product cards, unique indexes 0–9, one shared catalog ID; no header, footer, or buttons.
- Location Request is intentionally not supported.
- Media carousel is a different message format and is not implemented by the Product Carousel route.
- The generic `/messages` route is for other documented Cloud API message types; Meta remains the final validator for type-specific fields not covered by the specialized routes.


## cURL examples

The examples call the Supabase Edge Function using the project's publishable key. The Meta WhatsApp access token is never sent by the browser or caller; it remains in Edge Function Secrets.

```bash
PROJECT_URL="https://axednjikcambzbkxyqpp.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<SUPABASE_PUBLISHABLE_KEY>"
TO="6281234567890"
```

### Text

```bash
curl -X POST "$PROJECT_URL/functions/v1/cloud-tools/messages/text" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"'$TO'","message":"Halo, ada yang bisa kami bantu?","preview_url":false}'
```

### Interactive list

```bash
curl -X POST "$PROJECT_URL/functions/v1/cloud-tools/messages/interactive" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to":"'$TO'",
    "interactive":{
      "type":"list",
      "body":{"text":"Silakan pilih kategori."},
      "action":{
        "button":"Lihat kategori",
        "sections":[{"title":"Produk","rows":[
          {"id":"iphone","title":"iPhone"},
          {"id":"mac","title":"Mac"}
        ]}]
      }
    }
  }'
```

### Reply buttons

```bash
curl -X POST "$PROJECT_URL/functions/v1/cloud-tools/messages/interactive" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to":"'$TO'",
    "interactive":{
      "type":"button",
      "body":{"text":"Apakah Anda ingin melanjutkan?"},
      "action":{"buttons":[
        {"type":"reply","reply":{"id":"yes","title":"Ya"}},
        {"type":"reply","reply":{"id":"no","title":"Tidak"}}
      ]}
    }
  }'
```

### Catalog Message

```bash
curl -X POST "$PROJECT_URL/functions/v1/cloud-tools/messages/catalog" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"'$TO'","body":"Jelajahi katalog produk kami.","footer":"Apple The Exchange TRX"}'
```

### Single product

```bash
curl -X POST "$PROJECT_URL/functions/v1/cloud-tools/messages/product" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"'$TO'","catalog_id":"META_CATALOG_ID","product_retailer_id":"META_CONTENT_ID","body":"Produk yang mungkin Anda sukai."}'
```

### Multi-product list

```bash
curl -X POST "$PROJECT_URL/functions/v1/cloud-tools/messages/products" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to":"'$TO'",
    "catalog_id":"META_CATALOG_ID",
    "header":"Pilihan produk",
    "body":"Pilih produk yang ingin Anda lihat.",
    "sections":[{"title":"iPhone","product_items":[
      {"product_retailer_id":"META_CONTENT_ID_1"},
      {"product_retailer_id":"META_CONTENT_ID_2"}
    ]}]
  }'
```

### Product carousel

```bash
curl -X POST "$PROJECT_URL/functions/v1/cloud-tools/messages/product-carousel" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to":"'$TO'",
    "body":"Produk mana yang Anda pilih?",
    "cards":[
      {"card_index":0,"type":"product","action":{"product_retailer_id":"META_CONTENT_ID_1","catalog_id":"META_CATALOG_ID"}},
      {"card_index":1,"type":"product","action":{"product_retailer_id":"META_CONTENT_ID_2","catalog_id":"META_CATALOG_ID"}}
    ]
  }'
```

**Important:** Each cURL command sends a real WhatsApp message if the recipient and payload are valid. Use a controlled test recipient. Do not use local variant IDs as Meta retailer IDs until Commerce Manager mapping is verified.

## Persistence

After Meta returns a WAMID, the function inserts one outbound row into `trx_messages`:
- `direction = outbound`
- `status = accepted`
- `message_type` matches the Meta message type
- `recipient_phone` is the recipient
- `raw_message` preserves both `request` and `meta_response`

Interactive list, reply-button, catalog, single-product, multi-product, and product-carousel messages are free-form messages for an existing chat thread; they are not substitutes for approved templates outside the customer service window. Use the generic `/messages` route with `type: "template"` for an approved template payload when the conversation window does not permit free-form messages.

A successful send request means Meta accepted the message and returned a WAMID. It does not mean the message was delivered or read; status changes arrive separately through `trx-webhook`.

## Official Meta references

- [WhatsApp Business Platform overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)
- [Interactive messages — list and reply buttons](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages)
- [Catalog messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/catalog-messages)
- [Single-product messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/single-product-messages)
- [Multi-product messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/multi-product-messages)
- [Interactive product carousel messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/interactive-product-carousel-messages)
- [WhatsApp Cloud API message templates](https://developers.facebook.com/docs/whatsapp/api/messages/message-templates/interactive-message-templates/)
