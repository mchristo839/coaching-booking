# WhatsApp FAQ Bot Setup Guide

## Prerequisites
- Brevo account (brevo.com)
- n8n instance (self-hosted or cloud)
- Your coaching booking system running

---

## Step 1: Brevo WhatsApp Business API Setup

1. Go to https://www.brevo.com and sign up or log in
2. Navigate to Channels > WhatsApp
3. Click "Get Started" to enable WhatsApp Business API
4. Enter your business details:
   - Business name (your coaching business name)
   - Business phone number (dedicated number for the bot)
   - Business category: Education / Sports
5. Submit for verification (takes 1-2 business days)
6. Once approved, note down:
   - Your WhatsApp Account ID
   - Your API Key (found in SMTP & API > API Keys)
   - Your WhatsApp Phone Number ID

### Cost Estimate
- Incoming messages: free
- Outgoing (bot replies): approximately EUR 0.02-0.05 per message
- For 1 coach with 50-100 messages/month: EUR 2-5/month

---

## Step 2: Airtable Table (Optional Logging)

If you want to log WhatsApp interactions, create a new table called
"WhatsApp_Interactions" in your Airtable base with these fields:

| Field Name     | Field Type    |
|----------------|---------------|
| phone_number   | Phone number  |
| message_text   | Long text     |
| response_sent  | Long text     |
| matched_faq    | Single line   |
| timestamp      | Date & time   |

This is optional. The bot works without it.

---

## Step 3: n8n Workflow Import

1. Open your n8n instance
2. Create a new workflow
3. Click the three-dot menu (top right) > Import from File
4. Select `n8n-whatsapp-faq-workflow.json` from your project
5. The workflow contains these nodes:
   - Webhook trigger (receives incoming WhatsApp messages)
   - Code node (matches message to FAQ keywords)
   - HTTP Request (sends reply via Brevo API)
   - HTTP Request (logs to Airtable, optional)
   - Respond to Webhook (confirms receipt)

### Configure Environment Variables in n8n

Go to Settings > Variables and add:

| Variable                       | Value                              |
|--------------------------------|------------------------------------|
| BREVO_WHATSAPP_API_KEY         | Your Brevo API key                 |
| BREVO_WHATSAPP_PHONE_NUMBER_ID | Your WhatsApp phone number ID      |
| AIRTABLE_BASE_ID               | app0TNasJdiqvLQAJ (your base ID)  |
| AIRTABLE_API_TOKEN             | Your Airtable personal access token|

### Activate the Workflow

1. Click "Activate" (toggle in top right)
2. Copy the webhook URL (shown in the Webhook node)
3. The URL looks like: https://your-n8n.com/webhook/whatsapp-incoming

---

## Step 4: Connect Brevo to n8n

1. In Brevo, go to Channels > WhatsApp > Settings
2. Find "Webhook URL" or "Inbound Message URL"
3. Paste your n8n webhook URL
4. Save

---

## Step 5: Test

1. Send a WhatsApp message to your business number:
   - Try: "How do I book?" - should get booking instructions
   - Try: "What sessions are available?" - should get availability info
   - Try: "How much does it cost?" - should get pricing info
   - Try: "Hello" - should get the default response
2. Check n8n execution history to see the workflow running
3. Check Airtable WhatsApp_Interactions table for logged messages

---

## FAQ Keyword Mapping

| User says (contains)     | Bot response topic |
|--------------------------|--------------------|
| "book" or "how"         | Booking instructions |
| "session" or "available" | Session availability |
| "cancel"                | Cancellation process |
| "price" or "cost"       | Pricing info |
| "bring" or "wear"       | What to bring |
| "time" or "when"        | Session timing |
| Anything else            | Default response + booking link prompt |

To edit responses, open the "Match FAQ Keywords" code node in n8n and
modify the response strings.

---

## Scaling Notes

**Current capacity (n8n + Brevo):**
- Handles 100+ messages per day with no issues
- Simple keyword matching runs in milliseconds

**Future upgrades when you outgrow this:**
- Add OpenAI to the n8n workflow for smarter responses (EUR 0.01-0.05/msg)
- Add Airtable lookups so the bot can answer "What sessions does Coach X have?"
- Replace Brevo with Twilio WhatsApp for higher volume
- Add multi-language support

For now, this setup is free to run (minus Brevo per-message costs) and
handles everything a single coach or small group of coaches needs.
