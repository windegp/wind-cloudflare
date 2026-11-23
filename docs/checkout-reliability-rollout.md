# Checkout reliability rollout and activation checklist

## Current status after PRs 19-24

The durable persistence, payment receipts, recovery runner, server APIs and browser/thank-you integration are all implemented in main, behind opt-in gates. The original foundation-only status is no longer current. Merging code is not activation or proof of a successful production payment. Existing checkout creation stays legacy while the gates are unset. Production settings, IAM, indexes, scheduler operation and merchant configuration have not been independently verified here.

The compatibility follow-up accepts signed `SUCCESS` with response code `00` as well as the existing `APPROVED`, still requiring matching private amount/currency and all existing signature checks. Tracking accepts the exact 43-character `WIND-D-<UUIDv4>` format, normalizes the UUID back to its generated lowercase Firestore document ID and keeps legacy IDs/phone verification intact. The input allows 43 characters. No gate, rule or live setting is changed by these fixes. This does not repair a previously terminal `review` receipt automatically; any existing review records require an authorized operator check, not a blind replay.

### Activation checklist, not executed

- [ ] Verify current deployed code and build/runtime gates without turning them on. `NEXT_PUBLIC_DURABLE_CHECKOUT_ENABLED` is build-time; `CHECKOUT_DURABLE_ENABLED`, `CHECKOUT_DURABLE_WEBHOOK_ENABLED` and `CHECKOUT_RECOVERY_ENABLED` are runtime. A recovery secret alone activates nothing.
- [ ] In a separate reviewed rules change, make all four `WindCheckoutAttempts`, `WindCheckoutOutbox`, `WindPaymentReceipts` and `WindCheckoutEffects` collections private to browser clients. Test guest/regular/admin get/list/create/update/delete in Emulator and regression-test existing public pages and legacy admin/notification dependencies. A deny match cannot override a broader allow. No rule edit is included here. Existing Orders/Customers public exposure and writes remain a separate known risk, not fixed by activating this flow.
- [ ] Verify same-project service credentials and IAM with non-production integration tests; rules tests do not prove service-account access.
- [ ] Verify composite indexes (`state`, `nextAttemptAt`) for outbox/receipts, a real authenticated one-minute recovery scheduler, and an operator-visible review/backlog alert and response process. No dedicated admin recovery/review screen is included yet; do not assume routine admin orders view covers it.
- [ ] Resolve feature parity: durable flow currently omits abandoned-cart capture and has no customer cancellation/replacement flow for a persisted pending attempt. Add safe separate draft/cancellation endpoints or explicitly agree a limited rollout with these gaps. Never reset an uncertain attempt into another payment.
- [ ] Run staging end-to-end tests: COD/InstaPay/card, approved `SUCCESS/00` and `SUCCESS/APPROVED`, failed/pending/incorrectly signed/amount-mismatched events, duplicate/late webhook, refresh/retry, lost commit acknowledgement, email failure/recovery, counters/customers without double-counting, legacy and 43-character durable tracking with wrong-phone denial. No real customer orders are needed for these tests.
- [ ] Review provider-specific payment contract and runtime limits, then authorize a controlled rollout with monitoring and rollback. If pausing new creation, keep durable webhook/recovery enabled for outstanding canonical payments. Do not enable from this checklist alone.

The Android notification-registration change (PR25) is separate and is not a dependency of these compatibility fixes or the durable checkout migration. A full admin redesign is not required to do this checklist. Reservations for stock, promo quota and first-order entitlement, provider inquiry/reconciliation and delivered/bounced email events remain follow-up scope, not delivered guarantees. No zero-failure or universally exactly-once delivery promise is made.

## Foundation design notes (historical stage 19)

The sections below describe the staged design and its later extensions. References to an inactive foundation or future integrations in historical paragraphs describe that earlier stage; use the current checklist above for the merged implementation's status.

## Data model

- `WindCheckoutAttempts/{orderId}`: private canonical customer, fingerprint, verified financials and lifecycle. Initial financial snapshot is create-only.
- `Orders/{orderId}`: existing dashboard-compatible projection. Never use this client-accessible projection as payment authority.
- `WindCheckoutOutbox/{orderId}.{jobType}`: private pending jobs, created atomically with confirmed COD/InstaPay orders. Card confirmation jobs belong in the paid-event commit, not at card setup.

Order snapshot, projection and jobs use one Firestore atomic commit with create preconditions. Retries compare the payload fingerprint. Concurrent identical attempts converge; conflicting payloads get 409; uncertain commit results are read back twice by the same key before surfacing an unresolved failure. No email, push or provider call happens in the storage transaction.

At the foundation-only stage, outbox jobs were not processed. PR21 now supplies the worker/recovery route; scheduling and monitored activation remain deployment prerequisites.

## Required production configuration before activation

1. Production runtime variables: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Use the same Firebase project as the store. A private key may use actual or escaped newlines. Never paste keys in chat, logs or source.
2. Service account needs Firestore document read/write permission (for example a narrowly reviewed Cloud Datastore User role). Validate using a controlled non-production test first.
3. Keep `CHECKOUT_QUOTE_SECRET` configured. The integration signs customer email/phone into quotes, not merely financial totals.
4. Firestore security rules must prevent browser access to every new private collection. A restrictive match does NOT override a broader matching `allow read/write: if true`; Firestore allows a request if ANY matching allow succeeds. Remove/narrow broad grants for these collections. This requires reviewing the deployed rules, not pasting one deny block.
5. Protect authoritative order financials and paid status. Existing dashboard projections may remain separately readable under the owner's chosen policy, but must not be payment authority.
6. The authenticated recovery runner exists; an actual scheduler/queue must invoke it. No detached promises or browser visits may be the only retry mechanism. Deployment checks are below.

Missing service-account configuration, failed auth, permission/network errors and unresolved commits return a typed failure to the integrated route. The integrated route must return Arabic failure text plus the stable order reference, and must never start payment unless persistence is confirmed. Log event, order ID and error code only, not customer data, keys or signed tokens.

## Original foundation roadmap (now partly implemented)

- Implemented behind gates: server-owned creation wired into checkout with persisted attempt keys.
- Implemented behind gates: durable webhook event receipts keyed by provider transaction ID + status; validate against private canonical financials, independent of quote TTL; atomic paid transition + jobs.
- Implemented behind gates: CAS-leased outbox worker, provider idempotency, bounded retries and authenticated recovery runner. Operator review visibility, alerts and provider reconciliation remain activation/follow-up work as detailed above.
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

These modules have injected handlers and opt-in route integration: merging alone does not create a scheduler or enable the gates. Production activation remains unverified; provider inquiry is not implemented. Integrating them without an authenticated due-job runner and a review queue is unsupported.

## Recovery runner deployment, still off by default

`POST /api/internal/checkout-recovery` requires both `CHECKOUT_RECOVERY_ENABLED=true` and `Authorization: Bearer <CHECKOUT_RECOVERY_SECRET>` (at least 32 characters). Store this secret only as a server secret, never NEXT_PUBLIC. Do not enable until private rules, indexes, review visibility and route migration have been checked. An external authenticated scheduler must invoke it every minute, record non-2xx/timeouts, and alert on backlog age and review states. This PR does not create that schedule or change Cloudflare settings.

Create/review Firestore composite indexes for collection-scope queries on each of `WindCheckoutOutbox` and `WindPaymentReceipts`: `state ASC, nextAttemptAt ASC`. Missing indexes are loud 503s. Due processing jobs use `nextAttemptAt=leaseUntil`, so an expired lease is discoverable without relying on the crashed request.

The runner processes up to ten receipts and ten jobs per tick, sequentially, with an 18-second admission budget. In-flight network work can extend beyond that budget. Ensure the scheduler/runtime timeout is long enough and monitor backlog. The budget is not a hard execution timeout. Use a queue worker for sustained high volume, not an ever-growing HTTP tick.

Provider handlers use the canonical snapshot. Resend receives the stable idempotency header and a 10-second network timeout; accepted message IDs are stored. Existing email HTML is shared without changing its layout. Push opts into strict error handling so failures retry instead of being swallowed. Push retries can duplicate a notification to devices that succeeded during a partial failure. Customer/counters use the atomic ledger.

No production sender, recipient or template is added. The existing administrator mailbox, sender identity and customer confirmation templates are reused. Authentication failures return no customer information. The endpoint's summary contains counts only.

## Server API layer, opt-in (browser integration now exists behind its own gate)

New `POST /api/checkout-attempt` is off unless `CHECKOUT_DURABLE_ENABLED=true`. It also requires the recovery runner, strong recovery secret, `CHECKOUT_DURABLE_WEBHOOK_ENABLED=true`, and the actual store project `wind-reviews`. These are configuration checks, not proof the schedule/rules/indexes work. Validate them before activation. Card config is checked before persistence; payment setup comes only after a confirmed immutable snapshot. A paid replay never returns a fresh payment hash.

New quotes bind the normalized email, phone AND shipping governorate used for eligibility/shipping pricing. No client substitution can change those after signing. An expired quote can replay only an existing identical attempt, never create a new order. The status endpoint accepts a signed, order-bound credential even after expiry, and returns status/amount only. Tokens are bearer credentials: POST bodies only, no URLs/logs/local analytics. Do not share them.

The opt-in durable webhook path checks all required financial/identity fields are actually signed before any private reads. Canonical orders stay on durable processing even when accepting new orders is paused. The durable browser uses `WIND-D-<UUID>` IDs so unknown new-order events remain recoverable while legacy IDs continue through the previous path. Keep durable webhook routing enabled while ANY canonical card order is outstanding. Both gates must remain unset until full migration is reviewed.

Browser migration was delivered separately in PR23 behind the build gate below. The legacy browser still writes abandoned `Orders` documents, which collide with create-only snapshots. Do not route that legacy UI to the new endpoint. The gated durable UI uses session-persisted UUID attempt keys, bypasses client customer/counter writes and calls the new endpoint before payment; it deliberately omits abandoned drafts until a safe separate endpoint exists. Do not manually point the old UI at the new endpoint. Thank-you must check canonical payment status before clearing cart or firing Purchase; redirects/iframe messages alone are not payment proof.

## Browser migration, build gate

`NEXT_PUBLIC_DURABLE_CHECKOUT_ENABLED=true` is a NEW BUILD-TIME switch. It must agree with the server gates. Leave it unset until rollout prerequisites pass. A stale page using legacy IDs remains legacy; the new namespace is isolated. Durable flow bypasses all existing browser Orders/customer/counter/promo writes and does not save abandoned carts. Losing abandoned-draft capture for opted-in new flow is deliberate until a separate safe server endpoint exists, not an invisible compatibility promise.

The new UI retains a UUID and the exact first submitted signed payload in sessionStorage. Refresh and response-loss replay that payload instead of re-pricing an already-created first-order attempt. Storage failure stops checkout. A definitive expired-quote/no-order rejection permits fresh pricing under the SAME UUID. Changed details on an existing attempt are rejected, not silently overwritten. A customer wishing to edit/cancel a persisted pending attempt needs the future authenticated cancellation/replacement flow; there is intentionally no automatic key reset on an uncertain result.

Thank-you checks server status before clearing the cart or emitting Purchase for durable attempts. Pending/unverified outcomes show an Arabic warning and a retry button, with six bounded five-second status rechecks (roughly 30 seconds); no provider payment/retry is initiated by those checks. No green success content or fulfilment promise appears while unverified. The saved cart/request remains intact. After confirmation, the attempt key rotates for a future purchase. Email acceptance is handled independently by the outbox.

Promo usage is included in the same customer-effects ledger transaction to prevent a retry incrementing usage twice. This records usage after confirmation. It is not a reservation preventing two simultaneous attempts from using the last available promo slot, nor does it reserve stock or first-order entitlement at quote time. Those concurrency policies still require a separate reservation design.

## Sequential display numbers, separate from payment identity

New durable attempts allocate a customer-facing number starting at 1001. The UUID remains the canonical/Orders document ID, quote binding, webhook merchantOrderId, notification target URL and retry/idempotency key. Legacy orders are not renumbered; existing canonical attempts without numbers replay without a backfill. Numbering is inactive for customers until the already-gated durable flow is deliberately activated.

Allocation uses the existing private `WindCheckoutEffects` namespace: `order_sequence_v1` stores `lastNumber`, and `order_number_<number>` maps to a UUID. Counter CAS (or create-only initial 1001), create-only mapping, canonical snapshot, Orders projection and initial outbox jobs share one atomic commit. A lost response is recovered by UUID; counter contention retries are bounded. A failed commit consumes no number. Never reset/delete the sequence or mapping on deployment. A missing/reset counter with an existing mapping fails closed instead of overwriting; operator repair needs a separately reviewed data-recovery plan. Single-counter contention can reject a request for safe same-key retry under load, so capacity must be tested before launch.

Numbers are assigned on first committed creation, including pending card attempts, not only paid orders. Failed/cancelled attempts keep the number permanently. Numbers are never recycled and gapless numbering among paid orders is not promised. They are display labels, not authorization or proof of payment.

Create/replay/status APIs return `orderNumber`. Receipt/thank-you, durable email/push text, admin list/details/search/CSV and public tracking show the label. Admin actions and links keep the original document ID. Public `#1001`/`1001` tracking resolves the private mapping on the server, verifies the phone against the private canonical customer, returns the same not-found response for absent/mismatched records, and exposes no phone/email/address. Existing legacy/UUID lookups are retained. Sequential lookup needs the service account and reviewed private Wind* rules; this PR changes neither config nor rules. The current broad-read rule still exposes these documents until separately corrected.

Staging acceptance, no production writes implied: two new attempts receive 1001 and 1002 on a fresh isolated test dataset; replay/refresh/lost-response keeps each number; concurrent distinct creations get unique numbers; failed commit consumes none; incorrect phone and missing mapping have uniform not-found; email/admin/customer labels agree while Kashier merchantOrderId stays the UUID. Keep cancelled attempts and counter state. Do not reset production to 1000 for a demo. No production seed, migration or gate activation is performed by merging code.
