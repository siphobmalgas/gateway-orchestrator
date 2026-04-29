# Payment Orchestrator

Multi-PSP payment orchestration platform built with Node.js, TypeScript, and Express.

## Features

- Provider adapter abstraction (`PayU`, `PayFast`, `PayFlex`, `Stitch`, `Peach`)
- Normalized payment domain model
- Idempotency key handling
- Transaction state machine validation
- Webhook signature verification hooks
- Retry + timeout wrapper for provider calls
- Audit logging structure
- Prometheus metrics endpoint (`/metrics`)
- Docker + docker-compose
- GitHub Actions CI

## Run locally

1. Create a `.env` file for your local runtime.
2. Install dependencies:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

In non-test environments, PayU requests use the configured `PAYU_BASE_URL` directly (staging or production), provided SOAP credentials are present.

## MySQL OLTP persistence (Transactions + Provider Audit)

To enable MySQL-backed transactional persistence:

1. Start MySQL:

```bash
docker compose -f docker/docker-compose.yml up -d mysql
```

2. In `.env`, set:

```dotenv
MYSQL_ENABLED=true
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=payment_user
MYSQL_PASSWORD=payment_pass001
MYSQL_DATABASE=payment_oltp
MYSQL_CONNECTION_LIMIT=10
```

When enabled, the app stores OLTP transaction data in MySQL:

- `payments`
- `payment_logs`
- `payment_operations`
- `webhook_events`

The MySQL bootstrap creates the database if it does not exist and runs the SQL files in `db/migrations` before the server starts accepting traffic.

`payment_logs` and `webhook_events` persist the raw request, raw response, headers, payload hashes, response hashes, and normalized audit fields so provider traffic remains traceable for reconciliation and debugging.

## Mongo persistence (Credentials + Routing + Merchant Config)

To enable Mongo-backed persistence:

1. Start Mongo in the `mongodb` folder:

```bash
docker compose up -d
```

2. In `.env`, set:

```dotenv
MONGO_ENABLED=true
MONGO_URI=mongodb://provider_creds_user:provider_creds_pass001@localhost:27017/provider-cred-db?authSource=provider-cred-db
MONGO_DB_NAME=provider-cred-db
```

When enabled, the app persists:

- `merchants` collection
- `provider_credentials` collection
- `routing_rules` collection

If `MYSQL_ENABLED=false`, the existing Mongo repositories continue to back transaction data as a compatibility fallback whenever `MONGO_ENABLED=true`.

## API endpoints

- `POST /payments`
- `POST /payment`
- `POST /authorise`
- `GET /routing-rules`
- `POST /routing-rules`
- `GET /payments/:id`
- `GET /transactions/:id/webhooks`
- `POST /payments/:id/capture`
- `POST /payments/:id/refund`
- `POST /payments/:id/void`
- `POST /providers/register`
- `POST /merchants`
- `POST /webhooks/payu`
- `POST /webhooks/payfast`
- `POST /webhooks/payflex`
- `POST /webhooks/stitch`
- `POST /webhooks/peach`
- `GET /health`
- `GET /metrics`

## PayU Redirect Payment (RPP)

For PayU redirect payments, call `POST /payments` with:

- `provider`: `PAYU` when routing is not merchant-driven
- `merchantIdentifier`: optional when you want the routing layer to select the provider from configured rules
- `paymentMethod`: `OPEN_BANKING` | `CREDITCARD` | `PAYFLEX` | `EFT_PRO` | `MOBICRED`
- `transactionType`: `PAYMENT` | `RESERVE` (used in PayU setTransaction)
- Required `redirectContext.returnUrl` and `redirectContext.cancelUrl` so the merchant controls where the customer lands after success or cancel
- Optional `redirectContext.notificationUrl` and `redirectContext.redirectChannel`

When `merchantIdentifier` is present, the service resolves the provider from merchant-scoped routing rules and registered provider credentials. If no merchant routing is configured, the existing explicit `provider` request field remains supported for backward compatibility.

Example:

```json
{
	"provider": "PAYU",
	"amount": 250.5,
	"currency": "ZAR",
	"paymentMethod": "EFT",
	"redirectContext": {
		"returnUrl": "https://merchant.example/payments/return",
		"cancelUrl": "https://merchant.example/payments/cancel",
		"notificationUrl": "https://merchant.example/webhooks/payu",
		"redirectChannel": "responsive"
	}
}
```

The API returns `checkoutUrl` in the payment response. Redirect the customer browser to that URL.

For inline embedding, use `inlineRedirect` from the same response:

```json
{
	"inlineRedirect": {
		"mode": "IFRAME",
		"url": "https://...",
		"method": "GET",
		"fallbackUrl": "https://..."
	}
}
```

Use `inlineRedirect.url` as the iframe `src`. If iframe rendering is blocked in the browser, navigate to `fallbackUrl`.

## PayU Server-to-Server Operations

- `POST /authorise` with `flowType: "SERVER_TO_SERVER"` performs a PayU `RESERVE` S2S authorize via doTransaction.
- `POST /authorise` with `flowType: "REDIRECT"` (or omitted) uses the RPP redirect flow via setTransaction.
- `redirectContext.returnUrl` and `redirectContext.cancelUrl` are accepted on S2S authorize requests as merchant-owned redirect targets.
- When `metadata.secure3d=true`, `redirectContext.returnUrl` and `redirectContext.cancelUrl` are required because PayU can return the shopper through a 3DS redirect.
- `POST /payments/:id/capture` performs PayU `FINALIZE`.
- `POST /payments/:id/refund` performs PayU `CREDIT`.
- `POST /payments/:id/void` performs PayU `RESERVE_CANCEL` and returns status `VOIDED`.

Capture, refund, and void are now idempotent even when the caller does not provide an explicit `idempotency-key` header. The service derives a deterministic request hash from the operation payload, persists the operation record, and replays the stored outcome instead of calling the provider twice.

Webhook reconciliation is also persisted. Use `GET /transactions/:id/webhooks` to inspect the audit trail for accepted, ignored, duplicate, or failed callbacks without querying Mongo directly. Each returned record includes the dedupe key, raw payload, parsed event summary, resulting payment status, and reconciliation state.

## Merchant Routing

Register a merchant:

```json
{
	"merchantIdentifier": "merchant-001",
	"merchantName": "Acme Retail"
}
```

Register the merchant's provider credentials:

```json
{
	"provider": "PAYU",
	"merchantIdentifier": "merchant-001",
	"merchantName": "Acme Retail",
	"payuCredentials": {
		"username": "200021",
		"password": "WSAUFbw6",
		"safekey": "{07F70723-1B96-4B97-B891-7BF708594EEA}"
	}
}
```

Provider registration is now provider-specific and persisted in the configured provider credentials store. With Mongo enabled, these credentials are written to the `provider_credentials` collection and used at runtime for merchant-scoped provider calls. Existing environment variables remain as the fallback path when no merchant credential is registered.

Example Payflex registration:

```json
{
	"provider": "PAYFLEX",
	"merchantIdentifier": "merchant-001",
	"merchantName": "Acme Retail",
	"payflexCredentials": {
		"clientId": "payflex-client-id",
		"clientSecret": "payflex-client-secret",
		"authUrl": "https://auth-uat.payflex.co.za/auth/merchant",
		"audience": "https://auth-dev.payflex.co.za"
	}
}
```

The same endpoint also accepts provider-specific credential payloads for `PAYFAST`, `STITCH`, and `PEACH` using their respective `payfastCredentials`, `stitchCredentials`, and `peachCredentials` objects with `apiKey` and optional endpoint overrides.

Create a routing rule:

```json
{
	"merchantIdentifier": "merchant-001",
	"routeToProvider": "PAYU",
	"priority": 0,
	"paymentMethod": "MOBICRED",
	"enabled": true
}
```

Then a routed payment can omit `provider` and rely on `merchantIdentifier`:

```json
{
	"merchantIdentifier": "merchant-001",
	"amount": 145,
	"currency": "ZAR",
	"paymentMethod": "MOBICRED"
}
```

## Postman Collection

The included Postman collection now separates the S2S payment used for `capture` and `refund` from the second S2S payment used for `void`, so the full PayU operations sequence can run cleanly under Newman.
