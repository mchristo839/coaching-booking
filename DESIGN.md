# DESIGN.md — Design System

> STATUS: filled in on 2026-06-01 (captured from the live site, then improved).
> This file is the single source of truth for how every page looks and feels.
> Tokens live in `tailwind.config.ts` + `app/globals.css`. Use the named tokens, never ad-hoc hex.

---

## 0. What changed (before → after)

| Area | Before (live site) | After (this system) |
|------|--------------------|---------------------|
| Accent | Green `#3D8B37`, but **3 different hovers** (`#346E30`, `#346F2F`, `#346F2F`) and the **signup page was blue** | One accent green `#3D8B37`, one hover `#2F6B2A`. Blue removed — signup now matches the brand. |
| Type | System font stack everywhere | **Plus Jakarta Sans** (display/headings) + **Inter** (body), loaded via `next/font` (no new npm dep). |
| Background | Flat `#FFFFFF` / `gray-50` | Warm canvas `#FBFAF7`, white surfaces, hairline warm borders. |
| Radius | Mixed `rounded-lg` / `rounded-xl` ad-hoc | One scale: cards `xl` (14px), buttons/inputs `lg` (10px). |
| Hero | Centred headline + two buttons (the generic template look the brief warns against) | Asymmetric hero with a CSS aurora signature moment + reduced-motion fallback. |
| Motion | None | Subtle fade-rise entrances, staggered. Hover/focus on every interactive element. |

Functionality, copy intent, links, forms, tracking and SEO are all preserved — this is a restyle.

## 1. Brand feel
- Adjectives: trustworthy, warm, grounded, sporty-practical.
- Feels like: a tool a busy grassroots coach actually trusts — premium but not corporate, friendly but not toy-like.
- Hard nos: purple-to-pink gradients, generic centred-headline hero, template/website-builder default look, a second accent colour creeping in (no stray blues).

## 2. Colour system
| Role | Token | Value | Notes |
|------|-------|-------|-------|
| Background | `canvas` | `#FBFAF7` | warm off-white page background |
| Surface | `surface` | `#FFFFFF` | cards, raised areas |
| Surface muted | `surface-muted` | `#F4F2EC` | secondary cards, wells |
| Text primary | `ink` | `#16201A` | deep green-black, not pure black |
| Text muted | `ink-muted` | `#5A635C` | secondary text |
| Accent | `brand` (`brand-600`) | `#3D8B37` | THE accent. Buttons, links, focus. |
| Accent hover | `brand-700` | `#2F6B2A` | the single hover/active green |
| Accent soft | `brand-50` | `#EAF3E8` | tints, badges, hover wells |
| Border | `line` | `#E6E3DA` | hairline dividers |

Rules: one accent does the heavy lifting. Never introduce a second hue for emphasis — use weight, size, or `brand-50` tints instead.

## 3. Typography
| Role | Font | Weight | Notes |
|------|------|--------|-------|
| Display / hero | Plus Jakarta Sans (`font-display`) | 700–800 | large, tracking `-0.02em` |
| Headings | Plus Jakarta Sans (`font-display`) | 600–700 | tracking `-0.01em` |
| Body | Inter (`font-sans`) | 400–500 | line-height 1.6 |
| Labels / eyebrow | Inter (`font-sans`) | 600 | uppercase, tracking `0.08em`, small |

Rules: two families max. Font smoothing on (antialiased). Headings use the display family, everything else Inter.

## 4. Spacing and layout
- Spacing scale (Tailwind default): 1=4px, 2=8px, 3=12px, 4=16px, 6=24px, 8=32px, 12=48px, 16=64px, 24=96px, 32=128px. Use these, do not invent values.
- Generous whitespace. Max content width ~1152px (`max-w-6xl`), centred. Consistent vertical rhythm: sections `py-20` to `py-28`.

## 5. Motion and animation
- Entrances: fade + 12px upward move, 500ms, easing `cubic-bezier(0.16, 1, 0.3, 1)`. Use `.reveal` / `.reveal-stagger`.
- Hover states on everything interactive (buttons, cards, links).
- One signature moment per page (the hero aurora). Always honour `prefers-reduced-motion` — animations collapse to a static state.

## 6. Component rules
- Buttons: `.btn-primary` (solid brand) vs `.btn-secondary` (outlined). Real hover + active + focus-visible ring. Min height 44px (touch).
- Cards: subtle `line` border OR soft shadow, not both heavy. Radius `rounded-xl`. Hover lift on interactive cards only.
- Inputs: `line` border, comfortable padding (`px-4 py-3`), visible `brand` focus ring. Consistency beats novelty.
- Focus: every interactive element shows a `brand` `focus-visible` ring. Never remove outlines without a replacement.

## 7. Anti-generic checklist (self-check before done)
- [ ] No purple/pink gradient hero.
- [ ] Headline is specific to coaches (not "The future of X").
- [ ] At least one signature visual moment (the hero aurora) a template would not have.
- [ ] Palette stayed within the tokens above — no stray blue/grey accents.
- [ ] Spacing used the scale; one consistent radius per component type.
- [ ] Every interactive element has a hover AND focus-visible state.
- [ ] `prefers-reduced-motion` respected.
- [ ] Mobile looks as considered as desktop.
- [ ] Does not look like a website-builder default.
