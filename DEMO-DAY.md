# Demo day checklist

Do the first four the day before, and again an hour before.

## Before

1. **Wake the database.** Open your Supabase project in the dashboard. If it says paused, press Restore and wait about a minute. (A daily Vercel cron job pings the database to prevent pausing, but check anyway.)
2. **Open the live site** (your `*.vercel.app` address). Confirm it loads in under a few seconds.
3. **Warm it up.** Open Rate Intelligence, keep GlowSkin selected and press **Analyze This Offer** once. This wakes the serverless function so the live demo is fast.
4. **Check the label.** Under the result it must say **"Live model (Groq, openai/gpt-oss-20b). Numbers checked by CreVa engine."** On Profile there must be no "Demo data (database offline)" note.
5. Run `npm run smoke:live -- https://YOUR-SITE.vercel.app` from the project folder. All lines should say PASS.
6. Open the site once on your phone, or in the browser at 390px width. No sideways scrolling.
7. Close other tabs, set the theme you want (the Theme pill, top right), and clear the tour flag if you want the welcome tour to show: in the browser console run `localStorage.removeItem('creva_tour')`.

## If the label says "Fallback engine"

That is by design, not a failure. Say it plainly:

> "The live model can be unavailable: the free tier has strict rate limits. CreVa never depends on it. A built-in rules engine prices the offer and reads the contract, the numbers always come from that engine, and the label tells you honestly which one answered. The model only writes the explanations."

Why it happens, and what to do:

| Label reason | Meaning | Fix |
|---|---|---|
| rate limit reached, try again in a minute | Groq free limits (about 8K tokens per minute) | Wait 60 seconds, press Analyze again |
| live model is not configured | The key is missing in Vercel | Add GROQ_API_KEY in Vercel, then redeploy |
| live model took too long / unusable answer | Groq was slow, or the model gave a bad answer that CreVa rejected | Press Analyze again |
| no connection to the server | Wi-Fi problem | Check your connection |

Do not keep pressing Analyze in a loop. It burns the free quota.

## The 60-second demo

1. **Home (5 s).** "This is what needs my attention today. GlowSkin has 4 contract risks; FintechCo is calm."
2. **Opportunities, GlowSkin, Analyze Deal (10 s).** "₹30,000 for one Reel and three Stories. Looks fine. CreVa says the licence, not the fee, is the issue." Point at the fair range ₹62,000 to ₹70,000, the Medium confidence, Tier 2 with 12 deals, and the **Unknown** box: "It tells me what it does not know."
3. **Breakdown (8 s).** "Content is worth ₹47,000. The rights they are taking are worth ₹25,000. They offered ₹30,000: less than the content alone."
4. **Contracts (10 s).** "Four issues in plain language. I mark one reviewed and clear another, and every screen updates." Point at "CreVa explains commercial consequences, not legal validity."
5. **Negotiate (12 s).** "Three approaches. Preserve budget keeps their ₹30,000 number and shrinks what they get. The draft names the terms behind the number. And look: *CreVa will not send this. You send it.* There is no send button."
6. **Guardrail (8 s).** In Deal Intelligence press the "Accept this contract and send it back to the brand" prompt chip. "It refuses and offers a draft instead. No model was called."
7. **Growth, Post Autopsy (7 s).** "Why did this post flop? 'I don't have enough evidence.' That is the correct answer, and it says so confidently."

## After

Nothing needs shutting down. The site is public: anyone with the link edits the same demo profile.
