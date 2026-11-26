# Supabase Edge Function deployment baseline

Captured from the active Supabase project `axednjikcambzbkxyqpp` on 2026-11-26.

These files are an exact source baseline of the deployed entrypoints at capture time. They are not yet the final refactored implementation. Keep them for traceability while migrating to repository-managed source.

| Function | Deployed version | Source SHA-256 |
|---|---:|---|
| `trx-webhook` | 21 | `cbd965c860a26acbc8c4d28c673b694ea90af3eca5dd0bc42baf75479c852700` |
| `trx-send-messages` | 16 | `611e25544be696ef9358652a6ee9f3babad70fa22d39c4431dcd111218f618cd` |
| `trx-push-dispatch` | 12 | `f88a10a004309559ca1d8d59165b57fcd2dc65a7e32790a103974fd80e20750c` |
| `trx-push-config` | 11 | `f6a031eaa74debe7907ae4d1abb52fc630d911613b81f1e06dbb41543eefc775` |
| `trx-push-subscribe` | 11 | `7d5b72333fd53c1987b69df9ce658bcab6a62e1395e08672db000ea654e19e7e` |
| `trx-push-unsubscribe` | 11 | `214b251c6f30bd87ea1f1b98e49bcc443392e934bd472c04bfe26ba6b4cbfd4d` |
| `trx-vapid-generator` | 13 | `0a9d316e46086688ac40c8dc85d57b4ba68c67081aec687ba4cd0d2173741c13` |

## Notes

- No Edge Function was deployed or changed by this baseline capture.
- Runtime secrets are not included in these files.
- The current frontend still references `trx-send-messages`; do not cut it over until `cloud-tools` has passed the integration checks.
- Source parity for the remaining deployed functions is still a separate task.

## Remediation deployment record — 2026-11-26

The following repository-managed updates were deployed after Deno tests and type-checks passed:

| Function | Deployed version | Deployed source SHA-256 |
|---|---:|---|
| `cloud-tools` | 1 | `a8eb72d28214a971d52ac3a4cb8e06eee174fb46c172f731f2b05f1cda45da70` |
| `trx-webhook` | 22 | `bd7749849dee94320136c852fe890905535e640a640c515352a1d0388b99798b` |
| `trx-push-dispatch` | 13 | `fe5b97c79433102a41df9f980eec806ee9aff18813d3c0c581d7c8262ff9242f` |

All three deployments use `verify_jwt=false`, consistent with the existing project configuration and the public frontend invocation model. Meta access credentials remain server-side in Edge Function Secrets.

### Follow-up deployment — Commerce validation correction

| Function | Deployed version | Deployed source SHA-256 |
|---|---:|---|
| `cloud-tools` | 2 | `5df57ccc8d88f5b18a18bb49898f4a3de88ac141abd570879a916322dce49fb9` |

This version removes undocumented product-list section-count and section-title length restrictions while preserving Meta's documented 30-product maximum.
