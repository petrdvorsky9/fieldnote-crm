# Fieldnote

A focused photography-studio CRM prototype: leads, jobs, client nurture workflows, a booking page, documents, payments, and calendar-ready scheduling.

## Run locally

From this folder, run:

```powershell
node server.js
```

Then open `http://127.0.0.1:4173`.

The dashboard prototype uses browser local storage. Form submissions use the included zero-dependency Node API and are saved in `leads.json`.

## What is implemented

- Lead and client lists, lead search, and add-lead flow
- Kanban-style job tracking
- Toggleable and editable custom workflows, including wedding-anniversary and print-sale follow-ups
- Booking-page preview with packages
- Document and payment dashboards
- Google Calendar connection entry point and schedule view

## Next build phase

To make it production-ready, connect a server/database plus:

- Google OAuth + Calendar API
- A scheduled job runner. The local server sends Gmail notifications when `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `NOTIFICATION_EMAIL` are set in the private `.env` file.
- Stripe Checkout/Payment Links and webhooks
- A signature provider or an auditable built-in signing flow
- Secure client portal accounts and document/file storage
