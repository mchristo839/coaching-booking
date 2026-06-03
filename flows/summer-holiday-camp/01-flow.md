# Summer Holiday Camp — Flow (the one-pager)

> STATUS: ~75% there. The pieces exist but aren't joined up.
> Biggest gap: **a poll "YES" doesn't trigger the day-picker + payment step**,
> and the message shows the **payment-app's link preview instead of the club's branding**.
>
> This page is the plain-English intent. Edit it freely — Paul's version replaces this draft.

## Goal
Fill a multi-day holiday camp straight from the WhatsApp group: gauge interest,
let parents pick which days, take payment, and track who's coming + who's paid.

## The steps (what people actually experience)

1. **Coach sets up the camp** — name, the days, price per day, and their own
   payment link (Monzo / Revolut / PayPal). — ✅ exists
2. **Coach sends a simple yes/no poll** to the group: "Is your child coming to
   the summer camp?" — ✅ exists
3. **Parent taps YES.** — ✅ exists
4. **Bot DMs the parent a booking message** to pick days — **branded with the
   club logo**, not the raw payment-link preview. — ❌ today the poll just replies
   "you're in"; the booking step isn't triggered, and the preview shows the Monzo image
5. **Parent picks which days** (and we capture child name). — ⚠️ exists in the
   Holiday-Camp cohort flow, but is **not** reachable from a poll YES
6. **Bot replies with the total + payment link**, and the reference to use
   (the child's name). — ✅ exists in the camp flow
7. **Parent pays and replies "PAID".** — ✅ exists
8. **Coach sees who's coming + who's paid**, and confirms payments off. — ✅ exists

## Open decisions (need Paul's call)

- **The trigger.** Join poll-YES → day-picker + payment. Today "polls" and
  "holiday-camp booking" are two separate features; YES on a poll has nowhere to go.
  → Agree: does YES start the day-picker, or do we drop the poll and just use the
  Holiday-Camp "send to cohort" invite (which already asks days + sends the link)?
- **Link branding.** WhatsApp renders the Monzo link's own preview image, which
  looks off. Options:
  (a) attach the **club logo** as an image with the message;
  (b) **suppress the link preview** and just send the URL as text;
  (c) send a **branded booking page on our own domain** that then shows the payment link.
- **Info captured.** Child name + days chosen — anything else (allergies, emergency contact)?
- **Payments.** Manual link + "PAID" reply for now. Stripe (auto "paid" tracking) parked.

## Not in scope (yet)
Stripe/auto-reconciliation, multi-child-per-parent edge cases beyond what exists.
