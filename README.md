# Payment Orchestrator

Multi-PSP payment orchestration platform built with Node.js, TypeScript, and Express.

## Features

- Provider adapter abstraction (`PayU`, `PayFast`, `Stitch`, `Peach`)
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

1. Copy `.env.example` to `.env`
2. Install dependencies:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

In non-test environments, PayU requests use the configured `PAYU_BASE_URL` directly (staging or production), provided SOAP credentials are present.

## Mongo persistence (Credentials + Routing + Metadata)

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

- `payments` collection (transaction state)
- `payment_logs` collection (request/response metadata)
- `provider_credentials` collection
- `routing_rules` collection

## API endpoints

- `POST /payments`
- `POST /payments/payment`
- `POST /authorise`
- `GET /payments/:id`
- `POST /payments/:id/capture`
- `POST /payments/:id/refund`
- `POST /webhooks/payu`
- `POST /webhooks/payfast`
- `POST /webhooks/stitch`
- `POST /webhooks/peach`
- `GET /health`
- `GET /metrics`

## PayU Redirect Payment (RPP)

For PayU redirect payments, call `POST /payments` with:

- `provider`: `PAYU`
- `paymentMethod`: `CARD` | `EFT` | `MOBICRED`
- `transactionType`: `PAYMENT` | `RESERVE` (used in PayU setTransaction)
- Optional `redirectContext`: `returnUrl`, `cancelUrl`, `notificationUrl`, `redirectChannel`

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
