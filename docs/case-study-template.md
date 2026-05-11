# [Dealer Name]: [Outcome headline]

**At a glance**: [rooftops] · [vehicles in inventory] · [team size] · [tenure with Wolfpack]

## The challenge

[1 to 2 paragraphs on what they tried before, the pain points they were
solving for, and why they switched. Be concrete: name the workflows that
broke down, not just abstractions. Avoid competitor product names per the
client messaging guardrail. Substitute "their prior DMS" or "their prior
CRM" where needed.]

## What we built together

- [Specific feature or integration shipped, with the migration number or
  module name if relevant. Example: "Triple-write learning loop for lead
  scoring (migration 054)."]
- [Specific feature or integration shipped.]
- [Specific feature or integration shipped.]
- [Optional: integration touchpoints. DMS provider, accounting system,
  payroll, OFAC, credit bureau.]
- [Optional: dashboard or admin surface enabled.]

## Outcomes (measured)

- [Lead to sale conversion rate, before vs after. Source the numbers from
  analytics_events plus deal_worksheets.status = 'funded' counts.]
- [Time saved per workflow. Pull from analytics_events action durations or
  audit_log timestamps.]
- [Revenue lift or back-end gross lift. Source from deal_worksheets
  total_gross delta over the comparison window.]
- [Support ticket reduction or NPS improvement. Source from survey_responses
  nps_score plus client_errors counts.]
- [Optional fifth metric tied to the headline outcome.]

## In their words

> [Direct customer quote about a specific moment. Avoid generic
> testimonials. The best quotes name the workflow that improved.]
>
> [Title, Dealer]

## Implementation timeline

- **Week 1**: [Discovery, data audit, environment provisioning. List
  Vercel env vars set, DMS feed configured, RLS verified.]
- **Week 2**: [First production cut. Onboarding wizard completed, first
  10 leads imported, audit_log verified.]
- **Week 3 to 4**: [Feature rollout. Specific modules turned on.]
- **Week 5 onward**: [Steady-state operations and adoption metrics.]

## What's next

- [Roadmap item co-developed with this dealer. Tie it back to a specific
  pain or opportunity.]
- [Roadmap item.]
- [Roadmap item.]

---

_Internal notes (delete before publishing):_
- Verify every numeric claim against a query you can re-run.
- Get written quote approval from the named customer before publishing.
- Strip any competitor product names per `.ai/client-context.md`.
- Confirm no PII in screenshots or sample data references.
