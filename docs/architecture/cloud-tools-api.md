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

## Validation and scope

- Text body: maximum 4,096 characters.
- Interactive body: maximum 1,024 characters.
- Interactive list: maximum 10 rows total; list button maximum 20 characters.
- Reply buttons: 1–3 buttons; title maximum 20 characters.
- Catalog footer: maximum 60 characters.
- Product list: 1–10 sections and maximum 30 product items.
- Location Request is intentionally not supported.
- Product carousel is not part of this initial implementation; its Meta payload contract must be separately verified before adding it.
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
- [Share products with customers — catalog, single product, and multi-product](https://developers.facebook.com/docs/whatsapp/guides/commerce-guides/share-products-with-customers/)
- [WhatsApp Cloud API message templates](https://developers.facebook.com/docs/whatsapp/api/messages/message-templates/interactive-message-templates/)
