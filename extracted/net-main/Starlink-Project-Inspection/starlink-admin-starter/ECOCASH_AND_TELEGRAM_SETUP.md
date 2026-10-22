# EcoCash and Telegram integration status

## Current behaviour

- The visitor enters a phone number and selects a data bundle.
- The backend validates the selected bundle and price, creates an order with `pending` payment status, and queues the configured Telegram notification.
- The notification worker sends permitted order details (including the phone number only when enabled in the notification preferences) to the Chat ID configured on the customer/link.
- The checkout explicitly reports that no automated EcoCash payment request was initiated.
- Payment must remain pending until a trusted payment provider integration independently verifies it.

## Important security boundary

Do not add a website field for an EcoCash PIN, OTP, or one-time authentication code, and never forward such a code to Telegram or an administrator. Authentication codes are payment credentials. Customers should enter them only in the official EcoCash app, USSD flow, or a provider-controlled authentication interface.

## What is needed for live EcoCash payments

This recovery archive does not include official EcoCash merchant API documentation, merchant credentials, or an existing payment adapter. Therefore a live payment prompt cannot safely be implemented or claimed from this source alone. Obtain the official merchant integration documentation and credentials from EcoCash/the authorized payment provider, then implement a server-side adapter that:

1. Initiates a payment request using the official API and the order's server-calculated amount/currency.
2. Sends the request to the customer's phone number without asking the customer to disclose a PIN/OTP to this website.
3. Stores the provider transaction/reference and keeps the order pending.
4. Verifies signed webhooks or performs server-side provider verification before changing the order to paid.
5. Sends a separate Telegram payment-confirmed notification only after verified success.
6. Handles timeouts, duplicate callbacks, cancellations, failures, and idempotency.

Keep merchant secrets in backend environment variables or the provider's secret manager. Never expose them to the frontend.

## Telegram setup

Set `TELEGRAM_BOT_TOKEN` on the backend deployment and configure the intended destination Chat ID on the Admin customer/link settings. The destination must be reachable by the bot (the recipient has started the bot or the bot is present in the destination group). Test delivery from the Admin interface.
