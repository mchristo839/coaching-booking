---
name: web-design-system
description: Build web pages and sections that follow the project DESIGN.md. Use whenever creating or editing a landing page, hero, section, component, or any UI in this project, or when the user mentions building or restyling a page.
---

# Web Design System

The standard process for building any page or section in this project. The goal is a polished, consistent, non-generic result that matches DESIGN.md.

## Process

0. **Check the look is set.** Read `DESIGN.md`. If its status says "NOT FILLED IN YET" or fields read "to be set," stop and run the `design-intake` skill first. Do not build until the look and colours are set and confirmed.

1. **Load the system.** Read `DESIGN.md`. Read any reference in `references/`. Hold the palette, type scale, spacing scale, and motion rules in mind for the whole build.

2. **Plan the structure.** List the sections before coding (e.g. hero, social proof, features, how-it-works, pricing, FAQ, footer). Confirm with the user if the page purpose is unclear.

3. **Build section by section.** Produce clean, semantic HTML/CSS (or the project's framework). Use the design tokens from DESIGN.md, never ad-hoc values.

4. **Add motion.** Apply the entrance and hover rules from DESIGN.md. Stagger reveals. Keep it tasteful.

5. **One signature moment.** Decide where the single standout visual goes (usually the hero). If it needs WebGL/3D/animated effects, hand off to the `special-effects` skill.

6. **Self-check.** Run every item in the DESIGN.md anti-generic checklist. Fix failures before reporting done.

7. **Report.** List what was built in a few bullets so the user can scan and direct the next iteration.

## Rules
- Consistency over novelty. Reuse radius, shadow, spacing, and colour decisions across the whole page.
- Accessibility: semantic tags, visible focus states, alt text, `prefers-reduced-motion`.
- Responsive by default. Test the layout mentally at mobile, tablet, and desktop widths.
- Do not introduce new colours or fonts that are not in DESIGN.md without asking.
