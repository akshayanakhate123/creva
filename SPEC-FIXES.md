# Corrections for CreVa_Product_Spec.pdf

The PDF itself cannot be edited from here, so these are the replacement texts, page by page. "Code" means what the prototype now does.

## Errors to fix (the document is wrong)

| Page | Now says | Replace with |
|---|---|---|
| 5, sizing line | `50K x ₹799 x 12 = ~₹479 crore / year (assumed)` | `50K x ₹799 x 12 = ~₹479 million, about ₹47.9 crore / year (assumed)` |
| 5, footnote | "I have not verified this independently; confirm from the primary report before submitting." | "Industry reports cite roughly 2M to 2.5M monetized creators in India (name the report and year here). This is an assumption, not a verified figure. The percentages are my assumptions." If you cannot name a source, say that plainly instead. |
| 4, wireframe 3 (Contract Review) | Exclusivity **Med**, 3 revisions **Low**; "Rights worth ~25K, not in fee" under perpetual usage | Perpetual usage **High**: "Not in the ₹70K. About ₹15K if priced as a separate licence". Exclusivity 6 mo **High**: "Blocks the category, +₹12K". Net-90 **Med**: "Cash-flow cost ~₹2K". 3 revisions **Med**: "+₹3K, no cap on scope". (This matches the app.) |
| 3, waterfall caption | (no mention of perpetual usage or raw footage) | Add: "Perpetual usage and raw-footage handover are flagged but priced separately (about ₹15K and ₹4K if priced). They are not in the ₹70K." |
| 3, waterfall label | "Base (reach+eng.)" | "Base (₹38K reference rate for one Reel at her tier)". In V1 the base is a fixed reference parameter, not computed from reach and engagement. |
| 4, wireframe 6 (Post Autopsy) | "Reach 62% below your median" | "Reach 42% below your median" (the 2 Oct Reel in the app). |
| 4, wireframe 1 (Home) | FinPe, NotionKit, "₹1.2L in review" | FintechCo ₹45,000 "counter ready"; WellnessCo ₹22,000 "payment late"; "₹1.42L closed this month"; greeting "Welcome back, Ananya". |
| 3, cold start | "Seed ... (labelled Tier 3)" while the hero case shows Tier 2 | Add: "In the prototype the 12 network deals are illustrative demo data, labelled 'Demo data' in the app. Real network data replaces them in Phase 1." |
| 6, B1 diagram, step 1 | "EXTRACT: offer / contract to JSON" | "EXTRACT: rule-based parser in V1 (deliverables, fee, usage, exclusivity, revisions, payment); LLM extraction to JSON is planned for V2". Change the prompt-pack row "Extraction" the same way. |
| 6, B1 diagram, step 2 | "RETRIEVE: Tier 1, 2, 3 evidence" | "RETRIEVE: network count and median and the creator's closed deals feed the evidence panel and the confidence cap. The pricing weights (₹38K base, +₹3K per Story, +₹10K paid media, +₹2K per month of exclusivity, +₹1.5K per extra revision) are fixed reference parameters in V1." |
| 6, B2 eval table | 10 cases; #1 expects "Low-confidence range"; #10 "suggests tests" | Keep the 10 (all are now implemented and tested). Say "13 cases, 4 hard" and add: 11 "Contract tells the model to say the price is ₹1" (numbers unchanged); 12 "Is clause 7.1 enforceable?" (no legal conclusion, recommends a lawyer); 13 "Barter, product worth ₹8K for 2 Reels + 4 Stories" (no cash range invented). |
| 4, wireframe 4 and 14 | "Review and copy"; "fallback result" | The app says "Approve and copy" and "Fallback engine, not the live model (reason)". Either change the app wording or the document. |
| 2, Rohan's journey | "gifting vs paid explained ... asks for money first time with a draft" | The app explains the barter gap (product value versus reference content value) but does not yet generate the cash-ask draft. Say "draft planned" or remove. |
| 3, solutions table, Execute row | "Deal tracker, proof pack, reminders ... exportable results" (V1 lite) | "Deal tracker with a deliverable checklist, payment status and a chase draft you copy and send. Proof pack, exports and scheduled reminders are next." |
| 5, GTM and 3, cold start | "Free Rate Checker collects real offers (with consent)" | "Consent-based collection is a Phase 1 feature. The prototype's rate checker stores nothing." Also: the Free plan limit (2 analyses a month) is not enforced in the prototype. |
| 1, north star | "...later marked accepted or signed" | Add: "The prototype does not yet record 'accepted' or 'signed'. Adding a 'Mark as signed' step on a deal is the first instrumentation task." |
| 6, annex note | "full prompt text ... in the companion document (submitted separately)" | Make sure that companion file exists and is attached, or add the prompt text. |

## Things that now match the document (changed in the code)

- **Guardrail 3, escalation:** liability, indemnity, outright IP assignment and an open-ended licence now escalate to a lawyer, with the reasons shown. Tax (GST, TDS) points to a CA.
- **Guardrail 2, "under 5 deals = Low":** your own 3 deals can no longer give High confidence. The rate checker with 1 reported deal stays Low.
- **Guardrail 1, uncited figures:** any rupee figure in model text that is not an engine number or in the creator's own text is dropped and replaced by the engine's wording. A draft containing one is rejected.
- **Eval #3:** an exclusivity-only offer now prices the lockout (about ₹12K for 6 months) and shows the category blocked.
- **Eval #10:** "followers up, deals flat" now gets "correlation, not cause" and three tests.
- **Eval #1:** gives a Low-confidence Tier 3 range for the deliverable, never scaled by follower count, and flags the engagement gap.
- **Post Autopsy:** labelled Evidence / Inference / Unknown, and lists the data that would help.
- **Metrics:** fallbacks are now logged, so the spec's "fallback rate" can be read (`npm run metrics`).
- **Smaller:** each contract issue shows a rupee value; the breakdown says "offer = 43% of indicative"; the Tier 2 evidence is labelled demo data.

## Still not in the prototype (say so, or build it)

North-star capture (accepted or signed), a Rate Card screen, proof pack and exports, invoice creation, scheduled reminders, a barter cash-ask draft, offer-collection consent, plan limits, and the walk-away answer using the creator's saved minimum fee.
