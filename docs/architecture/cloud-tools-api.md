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
| POST | `/messages` | Generic Cloud API message payload |

All routes require `to` as an international WhatsApp recipient number. The function constructs `messaging_product` and `recipient_type`; callers cannot override these envelope fields.

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
- Interactive list: maximum 10 rows total; list button maximum 20 characters.
- Reply buttons: 1–3 buttons; title maximum 20 characters.
- Catalog footer: maximum 60 characters.
- Product list: 1–10 sections and maximum 30 product items.
- Product carousel: 2–10 product cards, unique indexes 0–9, one shared catalog ID; no header, footer, or buttons.
- Location Request is intentionally not supported.
- Media carousel is a different message format and is not implemented by the Product Carousel route.
- The generic `/messages` route is for other documented Cloud API message types; Meta remains the final validator for type-specific fields not covered by the specialized routes.

## Persistence

After Meta returns a WAMID, the function inserts one outbound row into `trx_messages`:
- `direction = outbound`
- `status = accepted`
- `message_type` matches the Meta message type
- `recipient_phone` is the recipient
- `raw_message` preserves both `request` and `meta_response`

A successful send request means Meta accepted the message and returned a WAMID. It does not mean the message was delivered or read; status changes arrive separately through `trx-webhook`.

## Official Meta references

- [WhatsApp Business Platform overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview)
- [Interactive messages — list and reply buttons](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages)
- [Catalog messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/catalog-messages)
- [Single-product messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/single-product-messages)
- [Multi-product messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/multi-product-messages)
- [Interactive product carousel messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/interactive-product-carousel-messages)
- [WhatsApp Cloud API message templates](https://developers.facebook.com/docs/whatsapp/api/messages/message-templates/interactive-message-templates/)
