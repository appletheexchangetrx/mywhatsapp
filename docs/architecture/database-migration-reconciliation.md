# Database Migration Reconciliation

**Baseline:** Supabase project `axednjikcambzbkxyqpp`, checked 2026-11-26  
**Scope:** repository migration files versus `supabase_migrations.schema_migrations`  
**Execution mode:** read-only reconciliation; no migration was applied by this work.

## Result

The production migration ledger contains 20 versions. The repository now contains 19 matching migration files:

- 2 migration files were already present in `main`.
- 17 missing migration files were restored from the exact SQL statements recorded in the production migration ledger.
- 1 migration source was deliberately not restored because its applied SQL contains literal VAPID private-key material.

The restored files are historical source artifacts. They were **not** executed against production and must not be replayed against a database that already has these versions recorded.

## Ledger mapping

| Version | Migration name | Repository status |
|---|---|---|
| `20261120134022` | `create_master_prompt_table` | Restored from ledger |
| `20261120175711` | `create_mcp_image_storage` | Restored from ledger |
| `20261120175743` | `lock_down_mcp_image_metadata` | Restored from ledger |
| `20261120202630` | `create_products_table` | Restored from ledger |
| `20261122064603` | `remove_gtin_and_mpn_from_products` | Restored from ledger |
| `20261122065221` | `update_product_custom_labels` | Restored from ledger |
| `20261122094252` | `set_products_flash_sale_effective_date` | Restored from ledger |
| `20261122112128` | `flatten_products_duplicate_variants` | Restored from ledger |
| `20261122231137` | `create_users_table` | Restored from ledger |
| `20261123004204` | `implement_approved_eight_table_schema_and_random_variant_stock` | Restored from ledger |
| `20261123025131` | `allow_public_full_crud_on_customer_tables` | Restored from ledger |
| `20261125005709` | `create_trx_messages` | Restored from ledger |
| `20261125010237` | `extend_trx_messages_for_outbound` | Restored from ledger |
| `20261125011633` | `public_read_trx_messages` | Restored from ledger |
| `20261125014039` | `add_trx_push_infrastructure` | Restored from ledger |
| `20261125014623` | `expose_service_role_push_claim_rpc` | Restored from ledger |
| `20261126113210` | `add_interactive_message_metadata` | Existing repository file |
| `20261126113441` | `schedule_trx_push_dispatch` | Existing historical repository file |
| `20261126115623` | `remove_push_dispatch_vault_secret` | Restored from ledger |
| `20261126115853` | `provision_vapid_keys_in_vault` | Source withheld — contains literal private VAPID key |

## Handling of the VAPID migration

The migration ledger stores the applied SQL for `provision_vapid_keys_in_vault`, including the private JWK. That private value must not be committed to Git history.

Consequently:

- The original secret-bearing SQL is intentionally excluded from this repository branch.
- Do not copy the private key into a migration, documentation, issue, PR comment, or CI log.
- Production Vault contents remain the source of the existing VAPID keypair.
- A clean-environment bootstrap must provision a newly generated VAPID keypair outside the source repository, then store it in Vault through the approved provisioning path.
- This migration version is already present in the production ledger. Do not reapply it.

## Cron migration history

The historical migration `20261126113441_schedule_trx_push_dispatch` includes the original Vault secret guard. The later migration `20261126115623_remove_push_dispatch_vault_secret` replaces the function with the current no-secret dispatcher invocation.

Keep both historical migrations unchanged and in timestamp order. The later migration is the authoritative change for a fresh replay of the full migration sequence.

## Validation required before merge

1. Compare each restored file against its corresponding `statements` value in the production migration ledger.
2. Confirm all 20 ledger versions are represented by either an exact repository file or the explicit withheld-source record above.
3. Run migration status/listing in a disposable local Supabase environment.
4. Do not run `db push`, `migration up`, or any schema-changing command against production as part of reconciliation.
5. Do not treat the redacted/withheld VAPID migration as replayable. A clean project needs the separate VAPID bootstrap procedure.

## Current conclusion

The repository is materially closer to the production migration history: 19 of 20 migration versions now have matching SQL files. The remaining version is intentionally withheld to prevent private key disclosure. The repository is not yet a fully self-contained clean-room bootstrap until the VAPID provisioning procedure is documented and implemented without embedding secret material.
