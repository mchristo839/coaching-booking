---
name: special-effects
description: Add a single signature visual moment to a page such as an animated WebGL background, a 3D element, an interactive accent, or a standout motion effect. Use when the user wants the hero or one section to feel premium, eye-catching, or unlike a template. Use sparingly.
---

# Special Effects

This is the moat. One striking, well-built visual moment is what separates a memorable page from a generic one. Use it once per page, usually in the hero.

## When to use
- The hero needs to stop the scroll.
- A section feels flat and needs a focal point.
- The user explicitly asks for something "wow", animated, 3D, or eye-catching.

## When NOT to use
- On serious or content-heavy pages (legal, docs, dashboards) unless asked.
- More than once or twice per page. Restraint is what keeps it premium.

## Options (pick one that fits the brand in DESIGN.md)
- **Animated gradient / shader background (WebGL):** subtle moving light, grain, or mesh behind the hero. Keep it tonal and on-brand, never a flat purple-pink wash.
- **3D element (Three.js):** a rotating object, globe, or product that reacts to cursor or scroll. Place it so it supports the headline, not buries it.
- **Cursor / scroll interaction:** parallax, magnetic buttons, a reveal that tracks the pointer.
- **Signature motion:** an animated line, particle field, or "laser" accent that draws the eye to the CTA.

## Rules
- Performance first. Lazy-load heavy effects, cap frame rates, and test on mobile.
- Always honour `prefers-reduced-motion` with a static fallback.
- The effect supports the message. If it competes with the headline or hurts readability, dial it back.
- Keep colours inside the DESIGN.md palette.

## Process
1. Confirm which section gets the effect and the intended feeling.
2. Pick one option above.
3. Build it as a self-contained, reusable component.
4. Add the reduced-motion fallback.
5. Verify it does not slow the page or clash with the rest of the design.
