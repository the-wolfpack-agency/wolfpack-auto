# Wolfpack Assistant integration — eliminate the settings page

**Date:** 2026-05-12
**Status:** Strategic direction + initial scaffolding ships this session. Full conversational layer is year-one Q3-Q4 work. This doc captures the vision and the first foundation.

## The vision

Wolfpack Auto's configuration surface becomes the **Wolfpack Assistant** sourced from Wolfpack Instinct. Users do not navigate settings pages to configure the platform; they talk to the assistant.

Examples of what replaces what:

| Old: settings page | New: assistant interaction |
|---|---|
| "Lead Routing Rules" page with a form | "Set up lead routing so my new leads go to whoever is available first, then balance across the team." |
| "Email Templates" page with WYSIWYG | "Write me a follow-up email for a customer who test-drove a vehicle yesterday." |
| "F&I Product Menu" config | "I want to focus on tire-and-wheel attach this quarter. Reorder my F&I menu accordingly." |
| "Service Hours" config | "We're closing early on Saturdays for the next month. Update the booking system." |
| "Notification Preferences" page | "Stop sending me weekend alerts unless something is broken." |

The assistant is the configuration interface. The platform supplies the actions; Instinct supplies the conversational layer; the literacy ontology supplies the vocabulary.

## Why this changes the product fundamentally

1. **Eliminates settings-page fatigue.** Most dealership employees never touch a settings page. The assistant meets them where they are.
2. **Leverages Instinct's cost-efficient-AI thesis.** Structured action registry controls what the assistant can do; LLM as the natural-language layer; tight token budget; controlled output quality.
3. **Makes the platform usable by non-technical employees.** Salesperson does not need to know what "lead routing rules" are. They tell the assistant what they want and the assistant does it.
4. **Embeds learning into the configuration moment.** The assistant explains what it just did in dealership language, ontology-sourced. Users learn the platform by using it conversationally.
5. **Unlocks role-aware personalization.** The assistant knows the user's role and adjusts capability + vocabulary accordingly.

## Architecture overview

Four components, three of which we scaffold this session:

### 1. Action registry (this session)

Migration 077 ships `assistant_actions` and `assistant_capabilities` tables. Every platform action the assistant can take is registered with:

- A canonical slug (`leads.update_routing_rule`)
- A natural-language description ("Update which sales rep gets which leads")
- Required parameters with typed validation
- Role allowlist (which roles can trigger this action)
- Side-effect scope (read-only, mutating, irreversible)
- Audit-log writeback (every assistant-triggered action is logged immutably)
- Dry-run support (assistant can describe what it would do before doing it)

### 2. Capability framework (this session)

Maps user role + dealer-tenant context to the subset of actions available. A salesperson cannot trigger F&I configuration changes; an F&I manager can. Capability checks happen at the action layer, not the conversation layer.

### 3. Conversation logger (this session)

`assistant_conversations` table logs every user prompt, assistant interpretation, action taken (or proposed and rejected), and outcome. Feeds the learning loop: which prompts confuse the assistant, which actions get reverted, which conversations succeed.

### 4. Conversational layer (year-one Q3-Q4)

This is where Instinct plugs in. The LLM interprets the user's natural-language prompt, maps it to one or more registered actions (with parameters), describes the action in plain language, asks for confirmation if the action is mutating or irreversible, then executes. Audit log + analytics events + learning feedback all happen automatically.

The conversational layer is deferred to Q3-Q4 because:
- The Instinct integration interface needs to be defined alongside Instinct team
- Action registry needs to be substantial (50+ registered actions) before the LLM has enough surface to be useful
- Real-world conversation data needs to be collected via the logger to tune prompts

## What ships this session

- Migration 077 (`assistant_actions`, `assistant_capabilities`, `assistant_conversations`)
- Lib at `src/lib/wolfpack-assistant/` with the action-registry API
- Initial action registry: 15-20 actions across the platform (lead routing update, F&I menu reorder, service hours change, notification preferences, email template generation request, etc.)
- Capability framework with role mappings
- Stub `/api/admin/assistant/chat` endpoint that accepts a prompt, currently returns a list of matching actions for the prompt (no LLM execution; deterministic keyword match for now)
- Audit-log + analytics-events + triple-write wiring on every action invocation
- Tests at every layer

## What this means for the zero-config principle

The earlier proposed `zero-config-principle.md` becomes a stronger statement: **we do not offer configuration for things users won't configure.** Defaults exist for everything; the assistant handles whatever the user wants to change; the settings page surface is minimal.

Codified rule for future PRs: a new settings page is justifiable only if:
1. The action it configures is high-frequency enough to warrant direct UI (e.g., not "configure once" data)
2. The assistant cannot reasonably handle it via conversation
3. The user explicitly needs to see all options at once (rare; usually a sign of unclear product thinking)

Most PRs that add settings pages should instead add an entry to the action registry and let the assistant handle it.

## Connection to the literacy layer

The assistant and the literacy layer (walkthroughs + tooltips) are two surfaces of the same underlying ontology:

- Literacy layer: passive, in-context, education during normal use
- Assistant: active, conversational, configuration during user intent

Both pull from the same ontology. Both improve the same outcome (user becomes more effective). Both render through Megan-designed surfaces.

## Risks (honest list)

1. **LLM hallucination on action mapping.** An LLM that confidently maps "delete all my leads" to `leads.delete_all` is a disaster. Mitigation: dry-run mandatory for irreversible actions; explicit confirmation required for mutating actions; allowlist of actions per role; audit log on every invocation.
2. **Prompt injection.** A customer's lead form input becomes part of the assistant's prompt context. Mitigation: strict separation between user prompts and lead/customer data in prompt construction. Treat all customer-supplied text as untrusted.
3. **Cost scaling.** LLM tokens per dealer per month must stay tight. Mitigation: structured action registry means the LLM does mapping, not generation. Tokens per interaction stay in the hundreds, not thousands.
4. **Conversational discoverability.** Users do not always know what they can ask. Mitigation: assistant exposes a "what can you help with?" capability that lists actions in role-appropriate language.
5. **Assistant becomes a single point of failure.** If the LLM is down, users can still fall back to direct platform interaction. Settings pages are not removed, just deprioritized in the UX.

## Decision needed at founder meeting

**D6 (additive to prior decisions):** Adopt Wolfpack Assistant as the primary configuration interface for Wolfpack Auto, with traditional settings as a fallback?

If yes: the scaffolding shipping this session is the foundation; Q3-Q4 builds the conversational layer in coordination with the Instinct team.

If no: the scaffolding stays as a future-option investment; the platform continues building toward traditional settings UIs.

## Bottom line

The Wolfpack Assistant is the right product direction because it eliminates the largest source of confusion for non-technical dealership employees (settings pages and configuration choices), leverages Wolfpack Instinct's cost-efficient-AI thesis, and creates a structurally simpler user experience that no DMS competitor offers. This session ships the foundation. The full conversational layer is year-one Q3-Q4 work with the Instinct team.
