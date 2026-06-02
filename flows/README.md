# Flows

One folder per user-facing automation ("flow"). This is the single place we
think through and agree how a flow should behave **before** touching code.

## How each flow folder works

Each flow gets its own folder with **two documents**:

1. **`01-flow.md` — the one-pager.** Plain English. The 7–9 steps a coach/parent
   actually experiences, digestible in 30 seconds. This is the bit we pull up
   any time to remember what the flow is meant to do. Owned by Mario/Paul; this
   is the source of truth for *intent*.
2. **`02-technical-spec.md` — the build detail.** How it's actually wired:
   tables, endpoints, message templates, edge cases. Derived from the one-pager.
   This is where the 20-page reality lives. Owned by Claude Code.

When a club needs a customisation, we come back here, branch the one-pager, and
re-derive the technical spec — rather than reverse-engineering it from code.

## Working rules

- **One flow at a time.** Get a flow fully sorted before starting the next.
- The one-pager is agreed first. Only then do we touch code.
- Status lives at the top of each `01-flow.md` (e.g. "~75% — gap is X").

## Flows

| Flow | Folder | Status |
|------|--------|--------|
| Summer holiday camp | [`summer-holiday-camp/`](./summer-holiday-camp/01-flow.md) | In progress (~75%) — gap: poll-YES → booking trigger, + link branding |
