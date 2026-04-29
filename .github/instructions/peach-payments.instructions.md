---
description: "Use when implementing, extending, or refactoring the Peach Payments integration, including provider calls, webhook handling, config, provider registration, and tests."
name: "Peach Payments Integration"
applyTo:
  - "src/providers/peach/**"
  - "src/domain/provider.interface.ts"
  - "src/app.ts"
  - "src/routes/webhook.routes.ts"
  - "src/config/env.ts"
  - "tests/**/*peach*.test.ts"
---

# Peach Payments Integration

- Keep Peach-specific request building, response mapping, webhook parsing, and signature verification in `src/providers/peach/*`.
- Use `src/infrastructure/http.client.ts` for Peach API calls. Do not call `fetch`, `axios`, or provider endpoints directly from controllers or services.
- Preserve the existing orchestrator split: controllers handle HTTP, services orchestrate, and the Peach provider handles external API details.
- Reuse `src/providers/shared/base.provider.ts` response normalization. Preserve compatibility fields such as `checkoutUrl`, `redirectLink`, `redirectUrl`, and `inlineRedirect` when Peach needs redirects.
- If Peach needs multiple transaction steps, keep them in separate Peach modules by operation instead of one large provider file.
- If Peach requires new provider capabilities or request fields, update `src/domain/provider.interface.ts` and the relevant Zod schemas before wiring controller changes.
- Keep Peach registration and runtime wiring aligned across `src/app.ts`, `src/config/env.ts`, webhook routes, and provider exports so the integration is not partially added.
- Map Peach external statuses and webhook events into internal `PaymentStatus` values consistently and preserve existing error response shapes.
- Add or update automated tests for Peach provider behavior and any affected payment or webhook flows. If request or response shapes change, update integration tests and `README.md` in the same change.

Peach Payments — Integration Plan (Phases 2–7)

Phase 2 — Understand the payment flow
Payment Page is built on Hosted Checkout. The end-to-end flow for every payment method works like this:

Your backend builds a signed payment request
Customer is redirected to Peach's hosted payment page
Customer selects a payment method and completes payment
Peach redirects back to your shopperResultUrl
Peach also POSTs a webhook to your notificationUrl
Your backend queries the transaction status to confirm the result before fulfilling the order

Checkout payment flow overview:
https://developer.peachpayments.com/docs/checkout-payment-flow
Payments API flow detail:
https://developer.peachpayments.com/docs/payments-api-flows
All supported payment methods:
https://developer.peachpayments.com/docs/pp-payment-methods

Phase 3 — Authentication & signature generation
Every payment request requires an HMAC SHA256 signature. Here's how it works:

Take all your request parameters and sort them alphabetically by key
Concatenate them as key1value1key2value2... (no separators)
Sign that string using your secret token with HMAC SHA256
Include the result as the signature field in your request

Every request also needs a unique nonce — any unique string you generate per request. The signature changes every time because the nonce changes.
Verify your signature logic during development using this tool:
https://www.freeformatter.com/hmac-generator.html
Hosted Checkout authentication & authorisation:
https://developer.peachpayments.com/docs/checkout-authentication
Node.js sample calls — Postman collection:
https://www.postman.com/peachpayments/peach-payments-public-workspace/request/yblmbqd/payments-public?action=share&creator=20323380&ctx=documentation&active-environment=13324425-9345d747-fcdd-4a5c-83e4-6f637771b28b
Endpoints:
EnvironmentURLSandboxhttps://testsecure.peachpayments.com/checkoutLivehttps://secure.peachpayments.com/checkout

Phase 4 — Payment methods & required parameters
All methods share these base parameters:
ParameterDescriptionauthentication.entityIdYour entity ID from the dashboardamounte.g. "250.00"currency"ZAR"paymentType"DB" for debit / chargemerchantTransactionIdYour unique order IDnonceUnique string per requestshopperResultUrlWhere to redirect the customer after paymentsignatureHMAC SHA256 of all parameters
Full API reference — Payment endpoint:
https://developer.peachpayments.com/reference/payment

Credit & debit cards (Visa, Mastercard, Amex, Diners)
paymentBrand: VISA / MASTER / AMEX / DINERS
No extra parameters required beyond the base set. Peach's hosted page collects card details directly. 3D Secure v2 is handled automatically. For card payments on Hosted Checkout, shopperResultUrl is required to handle the 3DS redirect back to your site.
Hosted Checkout payment request guide:
https://developer.peachpayments.com/docs/checkout-payment

EFT — Pay by Bank (multi-bank)
paymentBrand: PAYBYBANK
Pay by Bank is available on Hosted Checkout and offers EFT for multiple banks. Peachpayments Supported banks include Absa, FNB, Standard Bank, Nedbank, TymeBank, Investec, Bidvest, Old Mutual, and African Bank. No extra parameters needed — bank selection happens on Peach's hosted page.
Payment methods reference:
https://developer.peachpayments.com/docs/pp-payment-methods

Peach EFT
paymentBrand: PEACHEFT
Supports Absa, Nedbank, FNB, Standard Bank, Investec, TymeBank, Bidvest Bank, Old Mutual Bank, and African Bank. Peachpayments Requires shopperResultUrl. Bank selector UI is hosted by Peach.
Peach EFT documentation:
https://developer.peachpayments.com/docs/pp-payment-methods

Nedbank Direct EFT
paymentBrand: NDBEFT
Requires shopperResultUrl. Customers must have configured their Nedbank Money app as an In-app Approve-it device to use this method. Peachpayments
Nedbank Direct EFT documentation:
https://developer.peachpayments.com/docs/pp-payment-methods

Scan to Pay (QR code)
paymentBrand: MASTERPASS
Requires shopperResultUrl. Supported apps include Nedbank Scan to Pay, Standard Bank Scan to Pay, and Masterpass Scan to Pay. Peachpayments A QR code is presented on Peach's hosted page for the customer to scan with their banking app.

Note: refunds are not allowed on debit cards for Scan to Pay. You can process a reversal but it must be completed within six hours of the original transaction. Peachpayments

Scan to Pay documentation:
https://developer.peachpayments.com/docs/pp-payment-methods
Test and go-live — Scan to Pay:
https://developer.peachpayments.com/docs/reference-test-and-go-live

PayShap
paymentBrand: PAYSHAP
Requires virtualAccount.bank (the customer's bank: FIRSTNATIONALBANK, DISCOVERYBANK, NEDBANK, or TYMEBANK), virtualAccount.type set to CELLPHONE, virtualAccount.accountId (the customer's phone number in +27-123456789 format), and shopperResultUrl. peachpayments

Note: PayShap supports one refund per transaction only. If you perform a partial refund, you cannot perform another refund later. Peachpayments

PayShap documentation:
https://developer.peachpayments.com/docs/pp-payment-methods

Mobicred
paymentBrand: MOBICRED
Requires virtualAccount.accountId (the customer's Mobicred email address) and virtualAccount.password (the customer's Mobicred password), Peachpayments plus shopperResultUrl.
Mobicred documentation:
https://developer.peachpayments.com/docs/pp-payment-methods

RCS Cards
paymentBrand: RCSSTORECARDS
Requires card.number (the customer's RCS card number) and shopperResultUrl. peachpayments
RCS documentation:
https://developer.peachpayments.com/docs/pp-payment-methods

Payflex (Buy Now Pay Later — 4 instalments)
paymentBrand: PAYFLEX
Requires shopperResultUrl. Payflex supports payments between R10 and R50,000 by default. Peachpayments Peach redirects to Payflex's UI to complete the instalment setup.

Note: Payflex must add you to their allowlist before you can test in sandbox. Contact Payflex directly.

Payflex documentation:
https://developer.peachpayments.com/docs/pp-payment-methods

ZeroPay (3 interest-free instalments)
paymentBrand: ZEROPAY
Requires shopperResultUrl. The minimum amount for ZeroPay is R30. Peachpayments Peach redirects to ZeroPay's UI for the instalment flow.
ZeroPay documentation:
https://developer.peachpayments.com/docs/pp-payment-methods

Float (interest-free monthly instalments via credit card)
paymentBrand: FLOAT
Requires shopperResultUrl. Float supports full and partial refunds. Peachpayments In sandbox, add customParameters[enableTestMode]: true to your request body.
Float documentation:
https://developer.peachpayments.com/docs/pp-payment-methods

Happy Pay (instalments)
paymentBrand: HAPPYPAY
Requires shopperResultUrl. Happy Pay supports refunds. Peachpayments The customer completes their instalment setup on Happy Pay's hosted UI.
Happy Pay documentation:
https://developer.peachpayments.com/docs/pp-payment-methods

Phase 5 — Handle the result
After payment Peach redirects the customer to your shopperResultUrl. Always verify the result server-side — never trust redirect parameters alone.
Query transaction status (GET):
Sandbox:
https://testsecure.peachpayments.com/status?authentication.entityId=YOUR_ENTITY_ID&merchantTransactionId=YOUR_ORDER_ID&signature=NEW_SIGNATURE
Live:
https://secure.peachpayments.com/status?authentication.entityId=YOUR_ENTITY_ID&merchantTransactionId=YOUR_ORDER_ID&signature=NEW_SIGNATURE

Important: generate a new signature for the status query — the parameter set is different from the payment request so the signature will be different.

Result code logic:
Code starts withMeaningAction000.0 or 000.1SuccessFulfil the order000.2PendingPoll again or wait for webhookAnything elseFailedDo not fulfil — log and notify customer
Query checkout status API reference:
https://developer.peachpayments.com/reference/get_v2-checkout-checkoutid-status
Full result codes reference:
https://developer.peachpayments.com/docs/reference-test-and-go-live
Node.js status query samples — Postman:
https://www.postman.com/peachpayments/peach-payments-public-workspace/request/yblmbqd/payments-public?action=share&creator=20323380&ctx=documentation&active-environment=13324425-9345d747-fcdd-4a5c-83e4-6f637771b28b

Phase 6 — Refunds
The refund flow uses the same endpoint as the debit flow but requires the original Peach unique ID as a path parameter (/payments/{unique_transaction_id}/) and you must set paymentType to RF. Peachpayments
Endpoint:
Sandbox: https://testapi-v2.peachpayments.com/payments/{uniqueId}
Live: https://api-v2.peachpayments.com/payments/{uniqueId}
Required parameters for all refunds:
ParameterValueauthentication.entityIdYour entity IDpaymentTypeRFamountAmount to refund (partial refunds supported for most methods)currencyZAR
Refund support by payment method:
Payment methodRefund supportCredit / debit cardsFull and partialPay by Bank / EFTFull and partialPeach EFTFull and partialNedbank Direct EFTFull and partialScan to PayDebit cards: reversal only within 6 hours. Credit cards: refund supportedPayShapOne refund per transaction only. Partial refund closes further refundsMobicredSupportedRCS CardsSupportedPayflexSupported via PayflexZeroPaySupportedFloatFull and partialHappy PaySupported

For any method that does not support API refunds, you must process refunds manually by contacting the customer for their bank account details and doing an EFT transfer.

Refund API reference:
https://developer.peachpayments.com/reference/refund
Node.js refund samples — Postman:
https://www.postman.com/peachpayments/peach-payments-public-workspace/request/yblmbqd/payments-public?action=share&creator=20323380&ctx=documentation&active-environment=13324425-9345d747-fcdd-4a5c-83e4-6f637771b28b

Phase 7 — Webhooks & testing
Webhooks
Add notificationUrl to every payment request. Peach will POST the result to that URL asynchronously. Your endpoint must return HTTP 200 immediately, then verify the transaction status via the API before taking action.
Configure webhook URLs in your Dashboard at Settings → Developer Tools.
Checkout webhooks documentation:
https://developer.peachpayments.com/docs/checkout-webhooks
Sandbox test cards
Card numberBrandScenario4200000000000000VisaApproved5454545454545454MastercardApproved4111111111111111VisaApproved with 3DS4000000000000002VisaDeclined
Use any future expiry date and any CVV.
Testing notes by payment method:

PayShap — add customParameters[enableTestMode]: true to the request body in sandbox
RCS — add customParameters[enableTestMode]: true in sandbox. Use card number 6010240000000000
Peach EFT — a bank simulator appears in sandbox; click SIMULATOR, choose a status, and continue
Float — add customParameters[enableTestMode]: true in sandbox
Payflex — contact Payflex to be added to their sandbox allowlist before testing
Mobicred — request test credentials directly from Mobicred
Scan to Pay — switch to the test environment in your banking app by scanning the test QR code in the Peach docs
Happy Pay — create a Happy Pay test account using the link in the Peach docs, then use those credentials in sandbox

Full test credentials and sandbox guide:
https://developer.peachpayments.com/docs/reference-test-and-go-live
Node.js samples for all payment methods — Postman:
https://www.postman.com/peachpayments/peach-payments-public-workspace/request/yblmbqd/payments-public?action=share&creator=20323380&ctx=documentation&active-environment=13324425-9345d747-fcdd-4a5c-83e4-6f637771b28b
Peach developer hub — all docs:
https://developer.peachpayments.com/