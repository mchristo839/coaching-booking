---
name: design-intake
description: Ask the user about the look, feel, and colours of their site, then write or update DESIGN.md from the answers. Use this BEFORE building any page when DESIGN.md is not filled in yet (its status line says NOT FILLED IN YET, or its fields say "to be set"), or whenever the user asks to set, change, or redo the look, colours, theme, branding, or design direction.
---

# Design Intake

The goal is to capture the user's taste into DESIGN.md before building anything, so every page is consistent and matches what they actually want.

## When to run
- The user asks to build a page but DESIGN.md is still blank (status "NOT FILLED IN YET" or fields read "to be set").
- The user asks to set up, change, or redo the look, colours, theme, or branding.

## How to ask
Ask these questions a few at a time, not all at once. Offer concrete options so the user can answer fast. If the user says "you choose" or "pick for me," choose sensible, on-brand defaults and move on. Keep it brief.

1. **Overall vibe.** Which is closest?
   - Minimal and premium (lots of whitespace, restrained)
   - Bold and energetic (big type, strong colour, motion)
   - Warm and friendly (rounded, approachable)
   - Technical and precise (clean, structured, data-forward)
   - Editorial and elegant (serif, refined, magazine-like)

2. **A site or brand it should feel like.** A URL or name is ideal. If they have one, offer to save it into `references/` and pull its palette and type direction from it.

3. **Light or dark.** Light background, dark background, or both with a toggle?

4. **Colours.** Do they have brand colours (hex or rough names), or should you choose a palette to fit the vibe? Confirm one accent colour that does the heavy lifting.

5. **Type feeling.** Modern sans-serif, classic serif, or a sans body with a mono/label accent? Or choose to fit the vibe.

6. **Anything to avoid.** Note any hard nos (beyond the built-in ones: no purple-pink gradients, no template look).

## After the answers
1. Fill in every "to be set" field in `DESIGN.md`: brand feel, the full colour table (with real hex values), and typography.
2. Pick specific, real hex values, not placeholders. Keep the palette tight (2–3 core colours + one accent).
3. Change the status line at the top of DESIGN.md to: `> STATUS: filled in on <today's date>.`
4. Show the user a short summary of the choices (palette swatches as hex, fonts, vibe) and ask for a thumbs up or quick tweaks before building.
5. Only after confirmation, proceed to the build (hand off to the `web-design-system` skill).

## Rules
- One accent colour. Resist a second.
- Real, usable hex values with enough contrast for accessibility.
- Do not start building pages until DESIGN.md is filled in and confirmed.
