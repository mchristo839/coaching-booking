# Summer Holiday Camp — Technical Spec

Derived from `01-flow.md`. This is the build-level detail: what exists today,
where the gaps are, and the proposed wiring. Update alongside the one-pager.

## What exists today

### Path A — Holiday-Camp promotion (the "real" booking flow)
- **Setup:** `app/dashboard/promotions/new/page.tsx`, `promotion_type = 'holiday_camp'`,
  with `camp_days` (date / label / price / capacity per day) + `payment_link`.
- **Send:** `POST /api/promotions/[id]/send-camp-cohort` — DMs every (parent, child)
  in the target programmes, creates one `camp_bookings` row per child
  (`awaiting_day_selection`), and sends an AI invite asking which days.
- **Reply handling:** `app/lib/camp-booking.ts` → `tryHandleCampBookingReply()`
  - `awaiting_day_selection`: Claude parses the day letters → sets days + total →
    `awaiting_payment_confirmation` → sends payment instructions (incl. `payment_link`,
    reference = child name).
  - `awaiting_payment_confirmation`: `parsePaidReply()` → `paid_self_reported`.
- **Tracking:** `camp_bookings` state machine
  (`awaiting_day_selection → awaiting_payment_confirmation → paid_self_reported → confirmed`);
  coach confirms via `POST /api/promotions/[id]/bookings/[bookingId]/confirm`.

### Path B — Poll with payment link (what Paul actually used)
- `app/dashboard/polls/new/page.tsx` → capacity, `yes_option_index`, `payment_link`.
- Vote handling in `app/api/webhooks/whatsapp/route.ts` (native `pollUpdate` +
  text paths) → `recordPollResponse()` → `pollFollowUpMessage()`:
  - confirmed → "✅ You're in for '<question>'. To lock your spot pay here: <link>"
  - **No day selection. No structured booking row. Ends there.**

## The gaps (mapped to the one-pager)

1. **Step 4 trigger missing.** A poll YES calls `pollFollowUpMessage()` and stops.
   It never creates a `camp_bookings` row or starts `awaiting_day_selection`, so
   the day-picker (Path A) is unreachable from a poll. This is the "no trigger"
   Paul described.
2. **Step 4 branding.** Outbound WhatsApp text containing the Monzo URL makes
   WhatsApp fetch Monzo's OG preview (image/title). We don't control that image.
   - `app/lib/evolution.ts` `sendWhatsAppMessage()` would need either
     `linkPreview: false` (if Evolution supports it on `sendText`) or to send an
     **image message** (club logo) + caption via a `sendMedia` call.
3. **No club logo asset.** No `logo_url` on the coach/club today. Branding
   option (a)/(c) needs somewhere to store/derive it.

## Proposed wiring (to confirm against final one-pager)

**Decision pending:** consolidate on Path A, or bridge Path B → Path A.

- **If bridge (poll → camp):** when `recordPollResponse()` returns `confirmed`
  and the poll is linked to a `holiday_camp` promotion, create a `camp_bookings`
  row (`awaiting_day_selection`) for the voter and send the camp invite instead of
  the flat "you're in" line. Needs a `poll → promotion` link (new column
  `polls.promotion_id`).
- **If consolidate on Path A:** steer camps entirely to the Holiday-Camp
  promotion + "send to cohort"; make the poll screen say "interest-only, no
  booking" and stop offering a payment link on camp-style polls.

**Link branding:**
- Short term: suppress the link preview, or attach the club logo image with the
  payment message (`sendMedia` + caption).
- Longer term: a branded booking page on our domain (`/camp/<id>`), so the
  preview is ours and the payment link lives on a page we control.
  Add `clubs.logo_url` (or `coaches_v2.logo_url`).

## Touch-points if we build
- `app/api/webhooks/whatsapp/route.ts` — poll-YES branch.
- `app/lib/camp-booking.ts` — entry to start a booking from a poll voter.
- `app/lib/control-centre-db.ts` — `recordPollResponse` / poll↔promotion link.
- `app/lib/evolution.ts` — link-preview / media-send for branding.
- `app/api/db-migrate/route.ts` — any new columns (`polls.promotion_id`, `logo_url`).

> No code changed yet. Awaiting Paul's one-pager + the decisions above.
