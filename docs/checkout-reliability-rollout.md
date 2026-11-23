# Checkout reliability rollout, foundation

## Status

Inactive foundation. No existing route imports this service. Merging this PR does not migrate checkout, send messages, create collections, or require immediate configuration. Do not claim checkout is migrated after this PR.

The next integration PR must use a signed customer identity, a browser-persisted UUID per attempt, and this persistence call before returning payment setup. It must remove browser order/counter/customer writes and integrate durable payment receipts and retryable outbox processing. The existing production checkout continues unchanged until that integration ships.

## Data model

- `WindCheckoutAttempts/{orderId}`: private canonical customer, fingerprint, verified financials and lifecycle. Initial financial snapshot is create-only.
- `Orders/{orderId}`: existing dashboard-compatible projection. Never use this client-accessible projection as payment authority.
- `WindCheckoutOutbox/{orderId}.{jobType}`: private pending jobs, created atomically with confirmed COD/InstaPay orders. Card confirmation jobs belong in the paid-event commit, not at card setup.

Order snapshot, projection and jobs use one Firestore atomic commit with create preconditions. Retries compare the payload fingerprint. Concurrent identical attempts converge; conflicting payloads get 409; uncertain commit results are read back twice by the same key before surfacing an unresolved failure. No email, push or provider call happens in the storage transaction.

Outbox jobs are not processed in this foundation. Do not integrate the service into live order creation until the worker and recovery path exist.

## Required production configuration before activation

1. Production runtime variables: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Use the same Firebase project as the store. A private key may use actual or escaped newlines. Never paste keys in chat, logs or source.
2. Service account needs Firestore document read/write permission (for example a narrowly reviewed Cloud Datastore User role). Validate using a controlled non-production test first.
3. Keep `CHECKOUT_QUOTE_SECRET` configured. The integration signs customer email/phone into quotes, not merely financial totals.
4. Firestore security rules must prevent browser access to every new private collection. A restrictive match does NOT override a broader matching `allow read/write: if true`; Firestore allows a request if ANY matching allow succeeds. Remove/narrow broad grants for these collections. This requires reviewing the deployed rules, not pasting one deny block.
5. Protect authoritative order financials and paid status. Existing dashboard projections may remain separately readable under the owner's chosen policy, but must not be payment authority.
6. Scheduler/queue and authenticated recovery runner will be required for the outbox. No detached promises or browser visits may be the only retry mechanism. Exact deployment steps come with the integration PR.

Missing service-account configuration, failed auth, permission/network errors and unresolved commits return a typed failure to the future route. The route must return Arabic failure text plus the stable order reference, and must never start payment unless persistence is confirmed. Log event, order ID and error code only, not customer data, keys or signed tokens.

## Remaining work

- Wire server-owned creation into checkout, persisting the attempt key across refresh/retries.
- Durable webhook event receipts keyed by provider transaction ID + status; validate against private canonical financials, independent of quote TTL; atomic paid transition + jobs.
- CAS-leased outbox worker, provider idempotency, bounded retries, dead-letter/reconciliation view and authenticated recovery runner.
- Provider inquiry/reconciliation API requires confirmed Kashier contract and server secret. Current fetched searchOrders reference returned an incomplete description, so no endpoint/payload is guessed.
- Stock reservation requires mapping the actual variant/inventory model and an expiry/release worker. Do not decrement stock speculatively.
- Firestore emulator/integration tests and controlled production rollout. Unit mocks are not evidence of deployed permissions or merchant setup.

## Design sources checked

- Shopify, persisted idempotency and recoverable steps: https://shopify.engineering/building-resilient-graphql-apis-using-idempotency
- Shopify, timeouts, monitoring, reconciliation and safe retries: https://shopify.engineering/building-resilient-payment-systems
- Kashier webhook signatures, transaction status, retries and transactionId/status deduplication: https://developers.kashier.io/docs/webhooks
- Firestore atomic commit: https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.documents/commit
- Firestore transactions and contention: https://firebase.google.com/docs/firestore/manage-data/transactions
- Resend idempotency window is 24 hours, not an unlimited exactly-once guarantee: https://resend.com/docs/dashboard/emails/idempotency-keys

## Durable processing layer

`durablePayments.js` accepts authenticated provider facts only. It must never be called before checking the Kashier signature and merchant context. It writes `WindPaymentReceipts` before attempting a CAS atomic paid transition plus outbox jobs. Missing orders remain `awaiting_order`; amount/currency mismatch, non-payable orders and a second successful transaction remain `review`. Pending/failure observations never downgrade paid status. No paid decision uses quote expiry.

`checkoutOutbox.js` claims jobs with a five-minute lease and random execution token. The runner must enumerate due pending/retry jobs and expired processing leases, and recover nonterminal payment receipts. Email handlers must use the supplied stable idempotency key and a network timeout shorter than the lease. The worker stops automatic email attempts at 23 hours from the first attempt (provider window is 24 hours) or 12 attempts. `sent` means accepted by provider, not delivered to inbox. Delivery/bounce status still needs authenticated provider events. Failed jobs retain safe codes, not raw provider messages. Review states must appear in an authenticated operator recovery page and alerting before activation.

`checkoutCustomerEffects.js` atomically creates a private `WindCheckoutEffects` ledger with customer totals and site counters. It uses CAS on customer and settings documents, preserving unrelated fields and serializing concurrent purchases. A handler retry after a lost acknowledgement cannot count twice. The same private-rule requirements apply to receipts and effect ledgers.

These modules have injected handlers and are still inactive: no scheduler, external email, push, live webhook, provider inquiry or database mutation is triggered merely by merging. Integrating them without an authenticated due-job runner and a review queue is unsupported.

## Recovery runner deployment, still off by default

`POST /api/internal/checkout-recovery` requires both `CHECKOUT_RECOVERY_ENABLED=true` and `Authorization: Bearer <CHECKOUT_RECOVERY_SECRET>` (at least 32 characters). Store this secret only as a server secret, never NEXT_PUBLIC. Do not enable until private rules, indexes, review visibility and route migration have been checked. An external authenticated scheduler must invoke it every minute, record non-2xx/timeouts, and alert on backlog age and review states. This PR does not create that schedule or change Cloudflare settings.

Create/review Firestore composite indexes for collection-scope queries on each of `WindCheckoutOutbox` and `WindPaymentReceipts`: `state ASC, nextAttemptAt ASC`. Missing indexes are loud 503s. Due processing jobs use `nextAttemptAt=leaseUntil`, so an expired lease is discoverable without relying on the crashed request.

The runner processes up to ten receipts and ten jobs per tick, sequentially, with an 18-second admission budget. In-flight network work can extend beyond that budget. Ensure the scheduler/runtime timeout is long enough and monitor backlog. The budget is not a hard execution timeout. Use a queue worker for sustained high volume, not an ever-growing HTTP tick.

Provider handlers use the canonical snapshot. Resend receives the stable idempotency header and a 10-second network timeout; accepted message IDs are stored. Existing email HTML is shared without changing its layout. Push opts into strict error handling so failures retry instead of being swallowed. Push retries can duplicate a notification to devices that succeeded during a partial failure. Customer/counters use the atomic ledger.

No production sender, recipient or template is added. The existing administrator mailbox, sender identity and customer confirmation templates are reused. Authentication failures return no customer information. The endpoint's summary contains counts only.

## Server API layer, opt-in and not connected to browser yet

New `POST /api/checkout-attempt` is off unless `CHECKOUT_DURABLE_ENABLED=true`. It also requires the recovery runner, strong recovery secret, `CHECKOUT_DURABLE_WEBHOOK_ENABLED=true`, and the actual store project `wind-reviews`. These are configuration checks, not proof the schedule/rules/indexes work. Validate them before activation. Card config is checked before persistence; payment setup comes only after a confirmed immutable snapshot. A paid replay never returns a fresh payment hash.

New quotes bind the normalized email, phone AND shipping governorate used for eligibility/shipping pricing. No client substitution can change those after signing. An expired quote can replay only an existing identical attempt, never create a new order. The status endpoint accepts a signed, order-bound credential even after expiry, and returns status/amount only. Tokens are bearer credentials: POST bodies only, no URLs/logs/local analytics. Do not share them.

The opt-in durable webhook path checks all required financial/identity fields are actually signed before any private reads. Canonical orders stay on durable processing even when accepting new orders is paused. The future browser must use `WIND-D-<UUID>` IDs so unknown new-order events remain recoverable while legacy IDs continue through the previous path. Keep durable webhook routing enabled while ANY canonical card order is outstanding. Both gates must remain unset until full migration is reviewed.

Browser migration is deliberately separate. The old browser still writes abandoned `Orders` documents, which collide with create-only snapshots. It MUST move abandoned drafts out of `Orders`, use session-persisted UUID attempt keys, remove client customer/counter writes and call the new endpoint before payment. Do not manually point the old UI at the new endpoint. Thank-you must check canonical payment status before clearing cart or firing Purchase; redirects/iframe messages alone are not payment proof.
