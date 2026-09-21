# Fieldnote

A focused photography-studio CRM prototype: leads, jobs, client nurture workflows, a booking page, documents, payments, and calendar-ready scheduling.

## Run locally

From this folder, run:

```powershell
node server.js
```

Then open `http://127.0.0.1:4173`.

On first visit, create your owner account on the local login page using an email and a password of at least 14 characters. Account creation is available only from localhost before an owner exists. Subsequent sign-ins open Overview.

All app pages (including the enquiry form) and data APIs require login. The login page and its assets are the only public pages. Website embeds therefore cannot accept unauthenticated enquiries in this private version.

Sessions expire on the server after 30 minutes without user activity. Mouse, keyboard, touch and scroll activity renew the deadline; background status checks do not. Tabs share the session. Sign out invalidates it immediately; restarting the server also signs everyone out. Passwords are stored as salted scrypt hashes in the ignored `.owner.json` file, never as plaintext.

Studio data is saved in the ignored `.studio.json` file; existing browser data is migrated after login and removed from local storage. Enquiries are saved in `leads.json`. These private files are never served as static assets.

Before hosting, provision the owner locally, transfer private files securely, configure `APP_URL` to the exact HTTPS origin, and set `NODE_ENV=production` for Secure cookies. Use persistent private storage and backups. Sessions currently live in memory, so run a single server instance.

Run authentication and expiry checks with `node --test auth.test.js`.

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
