# Design exploration (process history)

These pages are the mockups produced during the Superpowers **brainstorming** session, kept as a record of how the UI was chosen. They were made to discuss options with the author, so their copy is **in Spanish** and they predate the final design.

| File | What it compared | Outcome |
|---|---|---|
| [`calculator-layout.html`](calculator-layout.html) | Three layouts: classic keypad, explicit form, keypad + history + API inspector | **Option C** (keypad + history + inspector) |
| [`layout-v2.html`](layout-v2.html) | Option C refined: truncated history, "% of" key, mobile collapsible panels, error state | Approved, plus a **Copy cURL** button |
| [`visual-style.html`](visual-style.html) | Three themes: Graphite, Ledger, Midnight Mint | **Ledger** (single light theme) |

`layout-v2.html` is drawn in the rejected Graphite theme and shows only "Copy JSON". Where these pages differ from the shipped app, the **design spec wins**: [`docs/superpowers/specs/2026-10-28-fullstack-calculator-design.md`](../superpowers/specs/2026-10-28-fullstack-calculator-design.md). Screenshots of the finished app are in the main [README](../../README.md).

The pages are standalone HTML; `visual-style.html` loads IBM Plex and Space Grotesk from Google Fonts and falls back to system fonts offline.
