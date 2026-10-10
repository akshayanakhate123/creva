# CreVa: handoff

Last updated 2026-10-10. Written for whoever (or whichever session) picks this up next.

## 1. Goal

Build a working prototype of **CreVa** (originally "Counter"), a creator-only dashboard for Indian micro-influencers (10K to 100K followers). It tells a creator what a specific brand offer is worth, what rights the contract takes, and how to negotiate it. This is for a product management assignment.

Core idea: a rate card prices your audience; a valuation prices what a specific brand is taking from you. CreVa separates content value from rights value.

Product rules that must show in the UI:
- Every AI output carries a **range**, a **confidence** (High/Medium/Low), the **evidence tier** and deal count, and **what it does not know**.
- CreVa never accepts, signs or sends anything for the user. There is no send button anywhere. Drafts are editable and copy-only ("CreVa will not send this. You send it.").
- It explains commercial consequences, not legal validity.
- "I don't have enough evidence" is a valid, confident-looking answer (Post Autopsy).
- Paid partnership disclosure must be included or flagged on any drafted content.

Seeded user: Ananya, 28, Bengaluru, 54K Instagram / 18K LinkedIn, career and productivity niche. Closed deals ₹42K, ₹51K, ₹57K. Network: 12 comparable deals, median ₹54K.

Hero scenario (numbers must match everywhere): GlowSkin offers ₹30,000 for 1 Reel + 3 Stories. Indicative value ₹70,000. Fair range ₹62,000 to ₹70,000. Counter ₹68,000. Closed at ₹58,000. 4 contract issues. Content ₹47,000, rights ₹25,000. Confidence Medium, Tier 2, 12 deals.

## 2. Current state of the code

Everything is **one file: `counter.html`** (HTML + CSS + vanilla JS, no build step, no dependencies). It is written as artifact page content (no doctype/head). `server.js` wraps it in a skeleton for local use.

Run locally: `npm run dev` then open http://localhost:5173 (the dev server was left running in the background; port 5173).

### What works
- **Shell**: sidebar (Home, Growth, Opportunities, Deals, Rate Intelligence, Contracts, Payments), top bar (theme pill, tour help button, bell, avatar pill linking to Profile). Mobile drawer.
- **Screens**: Home (4 stat cards, attention list, rate growth, donut value breakdown, contract insights, Getting started checklist), Opportunities, Deal Intelligence, Rate Breakdown (waterfall), Contracts (list by brand + detail with a highlighted brand banner), Negotiate (3 modes), Deals, Payments (with chase draft), Growth (Performance, Rate Growth, Post Autopsy), Public Rate Checker, Profile.
- **Pricing engine** (pure JS, `analyze()`): keyword-parses terms from message + contract and applies the weights. Verified in Node: GlowSkin gives ₹70,000 / ₹62,000 to ₹70,000 / 4 risks / counter ₹68,000 (₹55,000 relationship, ₹32,000 preserve budget). FintechCo gives ₹38,000 to ₹46,000 (fair against ₹45,000). WellnessCo is treated as barter (no counter screen).
  - Deliberate deviation from the brief: perpetual usage (+₹15,000) and raw footage (+₹4,000) are listed as **unpriced licence-level asks** and are NOT in the ₹70,000. The brief's weights would otherwise give about ₹89,000, contradicting its own expected output.
- **AI layer**: `ai()` calls `window.claude.use('sample')` with the system prompt, validates the JSON, and merges it with the engine's output (`mergeAI`). It falls back to the deterministic engine on any failure, with an honest label ("Fallback engine, not the live model (reason)").
- **Guardrails (always deterministic, never depend on the model)**: `refusal()`/`special()` handle the final-check prompts: accept/send refusal, caption with disclosure, "why did my Reel flop" gives insufficient evidence, "₹15,000 is final, walk away?" gives a trade-off, 0.2% engagement case names low engagement and gives no range, no-history LinkedIn case gives Low confidence and Tier 3. The seven prompts are clickable chips under Deal Intelligence ("Final-check prompts").
- **Design**: dark = near-black with violet accent and liquid-glass cards (from the user's screenshots); light = cream with gold accent. Fonts: Plus Jakarta Sans + IBM Plex Mono. SVG icons only. **No emojis** (the user asked for them removed; the last one was removed).
- **Discovery tour**: 11-step coach card on first visit (localStorage flag `creva_tour`), reopenable via the help button, with a pulsing nav spotlight; Getting started checklist with 6 tasks.
- **Motion**: page reveals, staggered cards, hover lift, count-up numbers, bar and chart draw-in. Disabled for reduced motion.
- **Speech to text**: a mic and EN/हि toggle on every text, number and textarea input in `#main` (Web Speech API, `addDictation()`). Spoken amounts are normalised ("30 thousand rupees" becomes ₹30000).
- **Deal Intelligence extras**: brand name + brand website fields (website is validated and shown as a link; never fetched), contract auto-saved to the Contracts list by brand.
- **Profile**: personal details, creator details (topics with an "Other" custom chip), social accounts with an Active switch, a **pop-up to link an account** (handle, link, followers, read-only permission list, consent tick, 3-step progress), invoicing, preferences, sticky right column (summary, "Still to add" list, active accounts).

### Known gaps and caveats
- **The social "API connection" is simulated.** The pop-up is labelled "Demo mode"; no OAuth or network call happens. Follower numbers are what the user types.
- **Live AI cannot run locally** (the `sample` capability exists only inside the published artifact). Locally everything uses the fallback engine. The live path has **never been exercised end to end**.
- **The published artifact is stale.** https://claude.ai/artifact/Jyi14McKy9Di25qVHS9pJ7 is **version 1**: old light "Counter" design and name. It has not been republished since the rename, restyle, tour, dictation, Profile or Contracts changes. The user has not asked for a republish; the auto-reply watch was paused by an interrupt. Republish with the same file path to keep the URL, and pass `capabilities: {"sample": {}}` again (omitting keeps the stored one).
- **Not visually verified**: most screens at 390px, light mode on every screen, and the Contracts list and detail at desktop width. Only Home, Payments, Profile and the link modal were looked at in screenshots. The rest were render-tested for runtime errors only.
- The Web Speech API only works in Chrome and Edge, needs a network, and the artifact frame may block the mic. Hindi dictation arrives as Devanagari, which the keyword engine cannot read (only the live model could).
- State is in memory only (no backend). The profile resets on reload.
- The AI system prompt still says the creator is "Ananya", even if the user edits their name.
- Dates in the seeded Deals/Payments data follow the brief and are not internally consistent ("invoice sent 21 Oct", "due in 14 days").
- Deal detail exists only for GlowSkin and a stub for WellnessCo; StudyKart and the completed deals are list-only.
- The documents list on the GlowSkin deal (`creative_guidelines.pdf`, `brand_assets.zip`) is placeholder content.
- Ledgerly and Northdesk contract texts in the Contracts list were written by me as sample data.

## 3. Files being actively edited

| File | Role |
|---|---|
| `D:\AI projects\Creva\counter.html` | The whole app. This is the only file that changes. |
| `D:\AI projects\Creva\server.js` | Local dev server (wraps counter.html with doctype + viewport). Stable. |
| `D:\AI projects\Creva\package.json` | Has only `"dev": "node server.js"`. Stable. |
| `D:\AI projects\Creva\HANDOFF.md` | This file. |

Approximate layout of `counter.html` (the order matters, since top-level code runs top to bottom):
1. `<style>`: tokens (dark bare `:root`; light under `prefers-color-scheme: light` and `[data-theme="light"]`), then components.
2. Static shell HTML (`#side`, `#rr` top bar, `#main`, `#coach`, `#modal`, `#toast`).
3. `<script>`: `SYSTEM` prompt, seed data, **pure engine** (`parseTerms`, `analyze`, `missingTerms`, `special`, `checkRate`), state `S`, AI layer, views `V.*`, tour/dictation/profile/modal code, click/input/keydown handlers, `render()`, boot at the very bottom.

Scratch/backup copies in `/tmp` (`counter.bak*.html`) and the session scratchpad (`new.css`, `A.js`, `B.js` and so on) are temporary and not durable. Do not rely on them.

## 4. Things tried that failed (do not repeat)

- **Backslashes in bash heredocs and `python`/`node` patch scripts get collapsed** by the tool layer (`\\d` became `\d`, `\n` became a real newline), so string-replace scripts silently failed to match or produced broken regexes. **Use the Edit tool or Write for anything containing backslashes**, or build the characters with `String.fromCharCode`. Several patch scripts failed with "missing marker" for this reason.
- **First engine run gave wrong GlowSkin numbers** (₹67,000, 3 risks): the regex read the clause label "5.1 Revisions" as "1 revision". Fixed with a negative lookbehind in `NW` (`(?<![\d.,])`). Check any new number-word regex against clause numbers.
- **Applying the brief's weights literally** gave about ₹89,000, not ₹70,000 (see the unpriced-asks deviation above).
- **`.burger` button showed on desktop**: `.btn` (declared later) overrode `.burger{display:none}`. Fixed with `.btn.burger`. Watch for similar specificity bugs when hiding `.btn` elements.
- **Hard-coded rose colours** (`#fff` on gradient buttons, `rgba(228,65,106,…)` shadows, the donut and logo colours) broke the gold light theme and the violet dark theme. They were moved into tokens (`--on-grad`, `--glow`, `--navact`, `--d1..d5`, `--l1/--l2`, `--avbg`). Any new coloured element should use tokens.
- **Browser-pane screenshots often time out or catch pages mid-animation** (the page animates in for about 0.5s and counts up numbers for about 1s). Retry once and wait 1-2s. The preview pane is also very narrow by default (about 400px), so layout checks there are really mobile checks.
- A wrapper that put an inline `flex:` style on an input broke when the input was wrapped for dictation; `addDictation()` now moves the style to the wrapper. Inline styles on inputs deserve suspicion.
- Edit failed once with a long unique-string match after the file changed on disk; re-read before editing if a note says the file changed.
- The earlier mid-request interruptions were handled by redoing the rename in full. `Counter` is now `CreVa` everywhere in the UI and prompt (the only intentional leftovers are the lowercase negotiation noun "a counter" and "Counter-offer ready").

## 5. Next step

1. **Do a full visual QA pass** at 390px and 1400px, in dark and light, on the screens not yet looked at (Opportunities, Deal Intelligence results, Breakdown waterfall, Negotiate, Deals, Growth, Checker, Contracts list/detail, Profile, tour card). Fix overflow, clipped text and contrast. Run the Node harness or a browser loop to catch runtime errors (render every `V.*` view). Confirm no horizontal scroll.
2. **Republish the artifact** (same file path, `capabilities: {"sample": {}}`) so the shareable link shows the current design, and exercise the live AI path once there. Check the fallback label flips to "Live model" and that `mergeAI` accepts the numbers (GlowSkin must stay ₹62,000 to ₹70,000). The user must ask or approve this first.
3. Re-run the 7 final-check prompts and the consistency audit (GlowSkin numbers identical on Home, Opportunities, Deal Intelligence, Breakdown, Contracts, Negotiate, Deals).
4. After that, if the user wants real social linking: design a small backend (OAuth apps for Meta, LinkedIn, Google and X; token storage; an insights fetch endpoint) and replace `startAuth()` in `counter.html` with a real redirect or popup flow. Keep the "read-only" permission copy honest.
