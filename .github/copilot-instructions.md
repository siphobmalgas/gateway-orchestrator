# Copilot instructions for this repository

Apply these instructions when generating code, reviewing changes, or answering implementation questions for this repository.

## Project scope
- Single Node.js + TypeScript Express payment orchestrator.
- Main request flow: `routes -> controllers -> services -> providers/repositories`.
- Core orchestration is in `src/services/payment.service.ts`.

## Architecture rules
- Keep HTTP concerns in controllers, orchestration in services, provider-specific logic in `src/providers/*`.
- If provider behavior changes, update `src/domain/provider.interface.ts` first, then provider implementations and mappings.
- Use `src/providers/shared/base.provider.ts` shared behavior; do not duplicate response normalization logic.

## API and validation rules
- Payment create/authorize/payment endpoints require `idempotency-key`; preserve this behavior.
- Add or change request fields via Zod schemas in `src/utils/validators.ts` before controller changes.
- Preserve payment response compatibility fields: `checkoutUrl`, `redirectLink`, `redirectUrl`, and `inlineRedirect`.
- Keep endpoint behavior intact: `POST /payments` is authorize flow; `POST /authorise` is explicit authorize flow; `POST /payments/payment` is explicit payment flow.

## Persistence and logging rules
- Use repository abstractions; do not bypass `PaymentLogRepository` for payment operation logs.
- Preserve state transitions through service transition guards.
- Use structured logger in `src/infrastructure/logger.ts`; avoid ad-hoc `console.log`.

## Provider and runtime rules
- External provider calls go through `src/infrastructure/http.client.ts` for timeout/retry behavior.
- Preserve PayU localhost callback rewrite behavior using `PUBLIC_BASE_URL`.
- Preserve deterministic PayU fallback behavior in tests when SOAP credentials are unavailable.

## Testing and delivery rules
- Validate with `npm run build` and `npm test` for meaningful changes.
- If request/response shapes change, update controller mapping, relevant integration tests in `tests/integration/*`, and `README.md` together.
- Keep changes minimal, backward-compatible, and consistent with existing repository conventions.
