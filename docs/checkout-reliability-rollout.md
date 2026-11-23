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
