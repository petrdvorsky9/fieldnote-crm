# Lead form: publish checklist

The form is served by Fieldnote, then embedded on `petrdvorsky.com`. This keeps the CRM API and email credentials private while allowing the public website to use a simple iframe.

1. Deploy Fieldnote on a public HTTPS domain, for example `crm.petrdvorsky.com`.
2. Copy `.env.example` to `.env` on the server and set the Gmail App Password and notification email address. Do not put these values in the website or iframe.
3. In the Lead forms screen, replace `YOUR-CRM-DOMAIN` in the generated embed code with the deployed Fieldnote domain.
4. Replace the existing enquiry iframe on `/poptavka/` with that embed snippet.

The form submits only to the Fieldnote server. A successful submission is stored in `leads.json` for this prototype, sends a full-detail email through Gmail when configured, and appears in the CRM automatically within one hour (or immediately after a refresh).

Before going live, replace the prototype's `leads.json` storage with a database and add a backup policy. The iframe is intentionally allowed only from `https://www.petrdvorsky.com` and the local development addresses configured in `server.js`.
