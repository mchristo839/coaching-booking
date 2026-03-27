# Coaching Platform - Claude Code Context

This file gives Claude Code full context on the coaching platform. Read this before making any changes.

---

## What This Project Is

A multi-coach WhatsApp bot platform. Coaches sign up, create programs, fill a Google Form to configure their bot personality, and their WhatsApp group gets an AI-powered assistant that answers questions using their config.

---

## Repo Structure

```
coaching-booking/
  app/                          ← Next.js booking app (deployed on Vercel)
  n8n-workflows/
    whatsapp-message-handler.json   ← ACTIVE: main bot workflow
    whatsapp-faq-airtable.json      ← OLD: Airtable-based FAQ workflow, not in use
  CLAUDE.md                     ← this file
  .env.local                    ← local env vars (never commit secrets)
  .env.example                  ← template for env vars
```

---

## Infrastructure

| Component | Location | Notes |
|-----------|----------|-------|
| Next.js booking app | Vercel | https://coaching-booking-v3.vercel.app |
| Evolution API | GCP 35.239.224.242:8080 | WhatsApp gateway |
| Evolution Manager UI | http://35.239.224.242:8080/manager | Login with global API key |
| n8n | https://n8n.courseadvisor.ai | All workflow automation |
| Neon Postgres | Cloud | Connection string in .env |
| Google Sheets config | Sheet ID: 1t8di6B3MI3PDo6IlUEAjae2YtyKAfc7C9P2iPA2LR-M | Form responses land here |
| Google Form | https://docs.google.com/forms/d/e/1FAIpQLSe2jW7EXI1OLCjhnKVU7Nha2a5dQMpfUCYAH39NNo2PygNViA/viewform | Bot config form |

---

## API Keys & Credentials

| Service | Key/Value |
|---------|-----------|
| Evolution API key | YOUR_EVOLUTION_API_KEY |
| Evolution instance | paul-bot |
| Anthropic API key | YOUR_ANTHROPIC_API_KEY |
| Claude model in n8n | claude-haiku-4-5-20251001 |
| Airtable base (old) | app0TNasJdiqvLQAJ |
| Airtable token (old) | patm6E3wSnEVDqvGk.4309858a4add3ccaf6860ec0ec76fdaf4db9b4e10fc730e87c6fb6ca3bcfb7be |

---

## Test Coach: Paul

| Field | Value |
|-------|-------|
| Coach ID | 481181c9-ba2b-4eeb-8159-b975c8e628f7 |
| Program ID | 89557f36 |
| WhatsApp group | 120363422695360945@g.us |
| Evolution instance | paul-bot |
| Bot phone number | +447458164754 |
| Pre-filled config form | https://docs.google.com/forms/d/e/1FAIpQLSe2jW7EXI1OLCjhnKVU7Nha2a5dQMpfUCYAH39NNo2PygNViA/viewform?usp=pp_url&entry.1018023075=89557f36&entry.1525338853=481181c9-ba2b-4eeb-8159-b975c8e628f7 |

---

## Database: Neon Postgres

Key tables:

```sql
coaches (id, name, email, ...)
programs (id, coach_id, program_name, whatsapp_group_id, google_doc_id, evolution_instance_id, is_active)
```

The `whatsapp_group_id` in `programs` links a WhatsApp group to a program config. If this is wrong or missing, the bot falls back to a generic response.

To check Paul's program:
```sql
SELECT * FROM programs WHERE id = '89557f36';
```

To link a WhatsApp group to a program:
```sql
UPDATE programs SET whatsapp_group_id = '120363422695360945@g.us' WHERE id = '89557f36';
```

---

## How the Bot Works (Message Flow)

1. Message arrives in Paul's WhatsApp group
2. Evolution API fires webhook to n8n: `https://n8n.courseadvisor.ai/webhook/whatsapp-incoming`
3. n8n extracts message text, group ID, sender
4. Looks up program in Neon DB by `whatsapp_group_id`
5. Reads bot config from Google Sheet (filters by Program ID column)
6. Checks for quick reply keyword matches first
7. If no keyword match, builds Claude system prompt from config and calls Claude API
8. Sends response back via Evolution API to the group

**Common failure points:**
- `paul-bot` disconnected from WhatsApp (check Evolution Manager, reconnect via QR)
- `whatsapp_group_id` not set in DB for the program
- Google Sheet has no row for that Program ID (coach hasn't submitted the form yet)
- n8n workflow is inactive (toggle it on in n8n)
- Wrong webhook URL configured in Evolution API

---

## Google Form Config Fields

The form at the URL above collects:
- Program Name
- Greeting Message
- Bot Tone (Friendly / Professional / Casual)
- About This Program
- Schedule
- Location Details
- Pricing
- Booking Link
- Frequently Asked Questions (Q: ... A: ... format, one pair per paragraph)
- Cancellation Policy
- Safety & Medical Info
- Contact Info
- Quick Replies (KEYWORD -> response, one per line)
- Program ID (pre-filled, entry.1018023075)
- Coach ID (pre-filled, entry.1525338853)

The n8n workflow filters the sheet by the `Program ID - Leave blank` column. The coach's latest submission wins.

---

## n8n Workflows

### ACTIVE: WhatsApp Message Handler
- File: `n8n-workflows/whatsapp-message-handler.json`
- Webhook path: `whatsapp-incoming`
- Reads config from Google Sheets
- Uses Claude Haiku for AI responses
- Sends via Evolution API paul-bot instance

### OLD (not in use): WhatsApp FAQ Airtable
- File: `n8n-workflows/whatsapp-faq-airtable.json`
- Webhook path: `paul-bot-incoming`
- Used Airtable for FAQ matching (keyword scoring)
- Replaced by the Google Sheets + Claude approach

---

## Booking App (Next.js)

- Deployed at: https://coaching-booking-v3.vercel.app
- Repo: https://github.com/mchristo839/coaching-booking
- `app/` folder contains all Next.js pages and API routes
- Key pages: `/book/[coachId]`, `/dashboard`, `/api/programs/create`

---

## Common Tasks

**Reconnect paul-bot WhatsApp:**
```bash
curl -s http://35.239.224.242:8080/instance/connect/paul-bot \
  -H "apikey: YOUR_EVOLUTION_API_KEY" | jq .
```
Then decode the base64 QR or use Evolution Manager UI.

**Check Evolution instances:**
```bash
curl -s http://35.239.224.242:8080/instance/fetchInstances \
  -H "apikey: YOUR_EVOLUTION_API_KEY" | jq .
```

**Test send a WhatsApp message:**
```bash
curl -s -X POST http://35.239.224.242:8080/message/sendText/paul-bot \
  -H "apikey: YOUR_EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number": "120363422695360945@g.us", "text": "Test message"}' | jq .
```

---

## Known Issues / To Fix

- paul-bot disconnects periodically due to WhatsApp session conflicts (device_removed error). Needs manual QR re-scan.
- Program ID field on Google Form says "Leave blank" — coaches need the pre-filled link or they won't populate it, breaking the config lookup.
- No automated trigger when form is submitted — config updates take effect on the next incoming message, not instantly.
- The `Program Found?` IF node in n8n uses `Object.keys($json).length === 0` which may not correctly detect empty Postgres results. Worth testing.
