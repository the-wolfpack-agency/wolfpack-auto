# How to use the case-study template

Companion to `docs/case-study-template.md`. Read this once before drafting
your first case study, then keep it handy as a checklist.

## When to start collecting data

Start the moment a dealer signs. A case study is built from analytics
captured during normal operation, not from a one-time audit at the end.

- **At signup**: snapshot baseline metrics. Lead-to-sale conversion,
  average days-to-funded, total back-end gross per deal, support ticket
  volume. Save these as a row in your CRM or in a private gist. Without a
  baseline, every later number is unverifiable.
- **At week 1**: confirm the dealer's analytics events are flowing. Pull
  the first 24 hours of `analytics_events` rows and verify the expected
  event types appear. If they do not, fix the integration before claiming
  data later.
- **At week 4**: first interim review. Compare the first three weeks
  against the baseline. Surface anything that moved more than 10 percent.
- **At month 3**: case study draft window opens. Three months of operation
  is usually enough operational data to produce defensible numbers.
- **Quarterly thereafter**: refresh the numbers. A live case study is more
  valuable than a static one.

## How to get quote approval

Never publish a quote without written approval. The legal exposure is real,
and a misquoted dealer becomes a former dealer.

1. Draft the quote yourself first, sourced from a call transcript, an
   email, or an in-product comment. Do not invent or smooth.
2. Send the quote plus the surrounding context paragraphs to the named
   customer. Use the exact wording they will see.
3. Ask for written approval in the same channel. Email is the bar. Text
   message or Slack is acceptable only if the message is preserved.
4. If the customer edits the quote, the edited version is what you
   publish. Do not partially incorporate their edits.
5. Store the approval thread alongside the case study draft. A future
   reviewer must be able to find it without asking you.

## What stats matter to prospects

Prospects care about the same five buckets, in this order:

1. **Revenue impact**. Lift in back-end gross per deal, lift in F&I
   penetration, lift in monthly funded deals. Always state the percentage
   and the absolute dollar figure for the window you are reporting on.
2. **Time saved**. Hours per week per role saved on workflows the dealer
   was doing manually before. Source from `analytics_events` action
   durations or `audit_log` event spacing. Translate to dollars at a
   blended labor rate when it strengthens the argument.
3. **Conversion**. Lead-to-appointment, appointment-to-test-drive,
   test-drive-to-funded. Each step in the funnel matters because each step
   is where a competing product loses dealers.
4. **Customer experience**. NPS from `survey_responses`, review sentiment
   from the `reviews` table, repeat-purchase or service-retention rate
   from the customer-touchpoints history.
5. **Risk reduction**. Compliance check pass rate, OFAC hit handling time,
   audit log completeness, security incident count. Less universally
   compelling, but decisive for dealer groups with a compliance officer.

A useful case study answers at least three of these five buckets with real
numbers, not adjectives.

## Sourcing numbers, defensibly

Every numeric claim in a case study should be backed by a query you can
re-run. Pin the query in the internal-notes section of the draft. Examples:

- **Funded deals**: `SELECT COUNT(*) FROM deal_worksheets WHERE dealer_id = $1 AND status = 'funded' AND funded_at BETWEEN $2 AND $3;`
- **Back-end gross lift**: aggregate `back_gross` from the same table over
  the comparison and baseline windows.
- **NPS**: `SELECT AVG(nps_score) FROM survey_responses WHERE dealer_id = $1 AND created_at >= $2;`
- **Time to funded**: `extract(epoch FROM funded_at - created_at) / 86400` over funded deals.

If a stat cannot be derived from a query, do not include it. Adjective-only
claims (faster, easier, better) get pulled by reviewers and weaken the
whole document.

## Messaging guardrails

- No competitor product names. Refer to "their prior DMS" or "their prior
  CRM".
- No client names from outside the named dealer. The bigger your library
  grows, the more often this rule matters.
- No PII in screenshots. Use the demo dealer (`wolfpack-demo`) or
  synthesize. The demo seed script `scripts/seed-demo-dealer.ts` is
  designed for this.
- Mobile-friendly formatting. Bulleted lists beat paragraphs.

## Format and length

- 600 to 1200 words total. Longer than that is read by no one.
- Single visual per case study at most. A funnel chart or a before/after
  number callout.
- One headline outcome in the title. The reader should know what they get
  from this story before they finish the first sentence.

## Distribution

- Sales: link in the first outbound to a prospect in the same vertical.
- Marketing: feature on the marketing site under a "customers" route.
- Product: review quarterly with engineering to see which features earned
  the wins. Use that to prioritize roadmap.
