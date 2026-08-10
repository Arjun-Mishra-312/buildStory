# Buildstory — Project Summary and Marketing Context

## Purpose of this document

This is a source-of-truth brief for creating Buildstory marketing, launch, content, and distribution material. Use it to understand the product, audience, positioning, user journey, differentiators, and language. Keep public claims aligned with the implemented product and verify live deployment details before publishing.

## Executive summary

Buildstory is a private-first platform for turning AI-assisted software work into thoughtful, shareable build stories.

Most software projects are presented through the final artifact: a repository, a product demo, a launch post, or a list of features. Buildstory captures the missing layer around that artifact — the decisions, experiments, false starts, tools, model mix, milestones, turning points, and work patterns that explain how the project came to exist.

The product has two connected parts:

1. A local, read-only scanner that turns a selected Git repository and supported local AI coding-session history into a sanitized, deterministic project snapshot.
2. A web-based creator and community platform where builders review a private report, decide what to disclose, edit the story in their own voice, publish it as a public build story, and share ongoing project chapters.

The core promise is simple: **private evidence in, public story out.**

Buildstory is not positioned as a productivity scoreboard or a tool that judges the quality of a person’s code. It is a process-aware publishing layer for builders who want to show the thinking behind what they make without exposing their entire private working history.

## Product name and basic facts

- Product: Buildstory / BuildStory
- Website referenced in the codebase: `https://buildstory.dev`
- Scanner package: `buildstory-scan`
- Scanner command: `buildstory-scan`
- Repository: a standalone npm workspace containing the web app and scanner package
- Web stack: Next.js 16/Vinext application designed for deployment as a Cloudflare Worker
- Persistence: Cloudflare D1 in production; disposable in-memory storage for local development and tests
- Authentication: verified Google identity through Auth.js for creator features
- Scanner requirement: Node.js 22.5+ for the package; Node.js 22.13+ for the complete workspace

Do not imply that Buildstory is compatible with every AI coding tool. The implemented scanner has adapters for Codex, Claude Code, Cursor, and Google Antigravity, with best-effort handling for some provider formats.

## The problem

AI has made it dramatically easier to start and iterate on software. It has also made the visible artifact less informative.

From the outside, a project can look like it appeared fully formed. A repository does not explain:

- What the builder was trying to solve
- Which ideas were discarded
- Where the build became difficult
- How the builder made trade-offs
- Which tools and models shaped the work
- How long the process unfolded
- What changed from one version to the next
- What was learned along the way

Traditional launch posts tend to compress all of this into polished outcome language. Developer portfolios often show screenshots and links but not the process. Raw AI transcripts, on the other hand, are too private, noisy, and revealing to publish by default.

Buildstory is designed for the middle ground: meaningful process evidence without turning a private workspace into a public transcript.

## The solution

Buildstory creates an inspectable, editable, and privacy-conscious record of a project’s build process.

The local scanner reads repository metadata and supported local AI-session metadata without reading source-file bodies. It aggregates the shape of the work — sessions, activity windows, model usage, tools, token and cost estimates when available, Git aggregates, milestones, and deterministic work-pattern signals. Sensitive and content-bearing material is discarded or redacted locally before upload.

The creator then receives a private report. The report can include deterministic metrics, a rule-based builder profile, evidence-linked story sections, and optional AI-generated narrative. The creator chooses which fields become public, edits the framing, adds context and links, and publishes deliberately.

The result is a public build story that feels more like a living project record than a static portfolio entry.

## Intended audience

### Primary audience

- Independent builders and solo founders
- AI-assisted developers and engineers
- Product-minded makers
- Designers who prototype with AI
- Students and people learning by building
- Small teams that want to document how a product evolved
- Technical creators who want a credible alternative to generic launch content

### Secondary audience

- People discovering new products and experiments
- Developers learning from other builders’ process
- Communities interested in transparent, evidence-backed making
- Recruiters, collaborators, and potential customers evaluating how someone works
- Audiences that enjoy product stories, build-in-public content, and development journeys

### Psychographic profile

Buildstory is for people who:

- Build seriously but do not want to overshare
- Want their work to be understood, not merely announced
- Use AI as part of a broader creative and engineering process
- Value transparency with boundaries
- Prefer evidence and reflection over hype
- Want a durable public record of progress, not only a one-time launch post

## Core user journey

1. A creator signs in and sets up a public profile.
2. The creator opens the guided scanner connection flow and names the project.
3. Buildstory generates a short-lived, account-bound connection code.
4. The creator installs or runs `buildstory-scan` locally and connects it to the session.
5. The creator runs a separate scan/upload command from the selected Git repository, with explicit local-scan and upload consent.
6. The scanner reads the selected worktree in a read-only manner, discovers supported local AI-session records, aggregates metadata, redacts retained strings, validates the snapshot, and sends one strict snapshot through the pinned connection.
7. Buildstory creates a private report and shows progress in the creator dashboard.
8. The creator reviews the report, its provenance, redaction information, deterministic metrics, narrative, and any evidence available to the private view.
9. The creator edits the title/tagline, description, reflection, category, visual treatment, links, and media.
10. The creator selects the exact fields that can cross the public boundary.
11. The creator previews the public projection and publishes Chapter 1.
12. On future scans of the same project, the creator reviews what changed and publishes a new chapter.

The browser never reads the creator’s repository. The scanner is the local bridge, and the creator remains the decision-maker at the publication boundary.

## Core product features

### 1. Privacy-first local scanner

`buildstory-scan` is a TypeScript/Node.js CLI that scans one user-selected Git worktree read-only.

It can discover repository-scoped activity from:

- Codex
- Claude Code
- Cursor
- Google Antigravity

It produces a portable `ProjectSnapshot` with a strict schema and deterministic serialization. The scanner supports offline inspection, local scanning, and a guided one-time upload flow.

Important privacy properties:

- Source-file bodies are not read.
- Diffs and patches are not retained.
- Commit subjects and author identities are not collected as public content.
- Raw remote URLs and hosts are not returned; remote identity is represented with opaque hashes.
- Prompts, responses, reasoning, transcript bodies, and tool arguments/results are not sent as raw data.
- Content-bearing values are discarded locally by default.
- Retained strings pass through normalization, length limits, secret detection, and redaction.
- The final snapshot is schema-validated, checked for forbidden keys, canonicalized, and scanned again before upload.

The scanner has separate consent steps for local collection and upload. A connection grant permits one validated snapshot upload. After the upload, the CLI may read bounded status/report information until the short-lived grant expires.

### 2. Private build reports

Each scan becomes a private report before anything is published. Reports can surface:

- Build window and active days
- AI session count and active build time
- Model mix and request counts
- Token usage and estimated API-equivalent cost when pricing data is available
- Tool usage
- Git aggregates such as commits, files touched, insertions, deletions, branches, and contributors
- Milestones and activity windows
- Coverage and quality warnings
- Redaction summary
- Repository stack signals such as framework, primary language, and package manager
- A deterministic builder profile
- A narrative story pack when narrative generation is enabled

The report is designed to be reviewed, questioned, and edited — not accepted as an unquestionable AI verdict.

### 3. Evidence-linked build storytelling

The standard story pack can include:

- A headline and summary
- A three-part build arc: discover, decide, deliver
- Build moments such as discoveries, decisions, breakthroughs, and delivery milestones
- A turning point
- Decisions, rationale, and outcomes
- Learnings
- Standout traits
- A private growth edge
- Deterministic “by the numbers” signals

Deep analysis can add:

- An opening line
- Signature moves
- Where it got hard
- Chapter changes
- AI framing over deterministic signals

Story content is linked to source metadata where possible. The “by the numbers” layer is computed from validated snapshot data; model-generated prose can frame a computed signal but cannot invent its underlying number.

### 4. Creator-controlled publication boundary

Creators choose the public story field by field. Available public controls include:

- Tagline
- Opening narrative and reflection
- Build window
- Session summary
- Milestones
- Model mix
- Estimated cost
- Tool usage
- Git aggregates
- Redaction summary
- Builder archetype
- Profile scores
- Work patterns
- Narrative sections
- Build arc, moments, turning point, decisions, learnings, traits, growth edge
- Deterministic signals
- Deep-analysis sections
- Project links
- Uploaded media
- Share-card headline fact

This field-level approach is a major product differentiator. Buildstory does not force a creator to publish the full private report or accept a single all-or-nothing visibility setting.

### 5. Public build stories

Published stories are accessible without viewer sign-in. A public story can include:

- Project name and status: shipped, building, or prototype
- Category and stack
- Creator profile and builder role
- Selected narrative sections
- Selected metrics and build receipt
- AI model mix and tools, if disclosed
- Git aggregates, if disclosed
- Milestones and turning points
- Project links, live demos, screenshots, cover images, or demo videos when added
- Social reactions and community discussion
- Open Graph and share-card previews for social distribution

The visual language centers on the idea of an “AI build receipt”: a compact, evidence-oriented record of how the work happened. The receipt is framed as process evidence, not a productivity score.

### 6. Projects as ongoing chapters

Projects can evolve through multiple published chapters. A creator can scan the same repository again, review a private update report, inspect the delta from the previous chapter, and publish an update.

Public project history can show:

- Chapter timeline
- Publication dates
- Per-chapter taglines
- Change summaries
- Commit and active-day deltas when selected
- Project changelog

This supports a “project as a living thing” narrative rather than a single frozen launch page.

### 7. Community and discovery layer

Buildstory includes social and discovery features around public work:

- Explore feed for latest and trending stories
- Search across projects, tools, and topics
- Filters by category, tools, models, and live-demo availability
- Builder profiles with handles, bios, roles, followers, and published stories
- Follow builders
- Reactions: fire, mindblown, relatable, and shipped
- Comments, replies, and comment upvotes
- Notifications for follows, reactions, comments, replies, upvotes, and story updates
- Content reporting and moderation flows
- A leaderboard based on verified, provenance-backed activity

The community is meant to reward thoughtful making and learning, not only polished outcomes.

### 8. Anti-gaming leaderboard

The leaderboard is intentionally framed around sustained building rather than raw volume.

Its current rules include:

- A cap of 20 commits per active day per project
- A verification multiplier for repositories whose ownership is verified through GitHub
- Ranking across published stories and verified activity

The marketing message should emphasize “sustained building, not burst” and avoid describing the leaderboard as a universal measure of skill, impact, or product quality.

### 9. Visual sharing and distribution assets

Buildstory supports shareable public URLs, Open Graph story images, profile images, downloadable story cards, selectable visual backgrounds, badges, and optional project media.

This gives creators a distribution loop:

1. Publish a story on Buildstory.
2. Share a visual receipt or story link externally.
3. Bring readers back to the full process narrative.
4. Continue the project and publish a new chapter.

## Narrative modes and data handling

The creator selects a narrative mode for a scanner connection.

### Local mode — default

- Uses Ollama on the creator’s machine.
- Selected excerpts travel only over loopback to the local model.
- Excerpts are not uploaded to Buildstory or an external model provider.
- The evidence profile adapts to local RAM and logical CPU capacity.
- The uploaded snapshot contains generated prose, deterministic metrics, and the sanitized report data — not raw excerpts.

### Bring your own key

- The creator chooses OpenRouter/DeepSeek or OpenAI/Luna through environment configuration.
- A mandatory CLI review shows the exact redacted excerpts and deterministic facts before the provider request.
- The excerpts go directly to the creator’s configured provider, not through Buildstory.
- Buildstory receives the finished report and content-free receipt.

### Buildstory Cloud

- An explicit opt-in mode.
- Reviewed, redacted excerpts and disclosed deterministic facts are sent to Buildstory for report generation.
- Cloud generation uses a ZDR-eligible OpenRouter route with data-collection denial requirements.
- Standard evidence is capped at 80 excerpts, 800 characters per excerpt, and 60,000 characters total.
- Deep evidence is capped at 240 excerpts, 1,500 characters per excerpt, and 700 KiB total, subject to the upload limit.
- Evidence is temporary and is scrubbed after successful or terminal generation; the private report and content-free receipt remain.

### Off mode

- No narrative generation.
- Only deterministic metrics, profile scores, and other validated snapshot data are uploaded.
- No conversation excerpts are selected or sent.

Use plain language in marketing: “local-first,” “redacted locally,” “you choose what becomes public,” and “no raw transcripts by default.” Do not say “anonymous,” “risk-free,” or “nothing ever leaves your machine,” because those claims are not universally true across all modes.

## Key differentiators

1. **Process is the product surface.** Buildstory explains how a project came together, not only what it does.
2. **Privacy is built into the architecture.** The scanner is local, read-only, consent-driven, and narrow by design.
3. **The publication boundary is explicit.** Creators review reports and choose individual public fields.
4. **Evidence without transcript dumping.** Buildstory turns activity into bounded, structured receipts and source-linked story sections.
5. **Deterministic facts under the narrative.** Metrics and signals are computed from validated data, with model prose constrained around them.
6. **Projects can keep evolving.** Chapters and changelogs preserve the arc of a build over time.
7. **Community discovery is part of the product.** Explore, follow, discuss, react, and learn from other builders.
8. **Credibility without hustle theater.** Receipts and anti-gaming rules make room for proof without turning every project into a vanity metric.

## Positioning statement

For AI-assisted builders who want their work to be understood, Buildstory is a private-first build storytelling platform that turns local project history into an editable, evidence-backed public narrative. Unlike a portfolio, launch post, raw transcript archive, or productivity dashboard, Buildstory preserves the decisions and turning points behind the artifact while letting the creator control exactly what is published.

## Messaging pillars

### Pillar 1: Every build has a story

The final product is only half the work. The other half is the reasoning, detours, decisions, and turning points that made it possible.

Useful phrases:

- “Every build has a story.”
- “Show how it came together.”
- “The artifact is only half the work.”
- “More than a launch post.”

### Pillar 2: Private evidence in, public story out

The scanner processes locally and produces a bounded snapshot. The creator reviews privately and publishes deliberately.

Useful phrases:

- “Your code stays local.”
- “Redacted before upload.”
- “Your scan stays private until you choose what to publish.”
- “You edit every word.”

### Pillar 3: Proof without posturing

Buildstory presents a receipt for the shape of the work without treating commits, tokens, or hours as a complete measure of value.

Useful phrases:

- “Process evidence, not a productivity score.”
- “Receipts for the work behind the work.”
- “Proof without posturing.”
- “Sustained building, not burst.”

### Pillar 4: Projects are living records

Stories can continue through chapters, letting a project’s public history evolve as the product changes.

Useful phrases:

- “Turn progress into chapters.”
- “Show what changed.”
- “A public record of the build, not just the launch.”

## Brand voice

The product voice should feel:

- Thoughtful, precise, and quietly confident
- Human and reflective, not corporate
- Technical enough to earn trust, but accessible to non-specialists
- Curious about process and decisions
- Respectful of privacy and user agency
- Skeptical of vanity metrics and exaggerated AI claims

Prefer concrete, editorial language over generic startup language. Use “builders,” “projects,” “process,” “turning points,” “receipts,” “chapters,” and “what changed.”

Avoid:

- “Revolutionary,” “game-changing,” or other empty superlatives
- Claims that Buildstory measures developer quality or productivity
- Claims that AI writes the truth about a person
- “Anonymous” or “fully private” without explaining the selected narrative mode
- Implying that the browser can access a repository
- Implying that Buildstory stores raw transcripts by default
- Presenting generated narrative as a replacement for creator judgment

## Strong marketing angles

These are promising angles for future copy, campaigns, and distribution:

### For builders

“Your repo shows the result. Buildstory shows the decisions that got you there.”

### For AI-assisted development

“Make AI-assisted work legible without publishing your entire transcript.”

### For build-in-public creators

“Build in public without giving everything away.”

### For portfolio and career storytelling

“Turn a project into a credible story about how you think, iterate, and ship.”

### For learning and community

“Find the turning points behind the tools people are actually building.”

### For ongoing products

“Publish the next chapter, not another generic progress update.”

## Distribution opportunities

Potential channels and formats include:

- Product Hunt launch material
- X/LinkedIn launch threads built around “the artifact is only half the work”
- Short demo videos showing repo → scan → private report → public story
- Founder and builder onboarding email sequences
- Developer-community posts explaining the local scanner and privacy model
- Individual share-card posts for standout build signals
- “Buildstory of the week” or “turning point of the week” editorial features
- Search-oriented pages for AI-assisted builders, build-in-public tools, and project storytelling
- Community prompts asking builders to share a decision, false start, or turning point
- Chapter-update campaigns that bring readers back to evolving projects
- Technical trust content about redaction, schema validation, and consent boundaries

The strongest demo is likely visual and sequential: a local terminal command, a private receipt, the creator’s publication controls, and the final public story page.

## Suggested calls to action

For visitors:

- Explore build stories
- See a real build receipt
- Find builders to follow
- Read how the project came together

For creators:

- Create your first story
- Scan a recent build
- Turn your repo into a story
- Start a private report
- Publish the next chapter

For privacy-conscious technical users:

- Inspect the local-first scanner
- See what leaves your machine
- Review the redaction boundary
- Choose your narrative mode

## Questions marketing material should answer

- What exactly does Buildstory capture?
- Does it read my source code?
- Does it upload raw AI transcripts?
- What AI coding tools are supported?
- Can I use local models?
- Can I bring my own provider key?
- What happens before anything is published?
- Can I choose individual public fields?
- Can I edit the generated story?
- Can a project have multiple updates or chapters?
- What can readers discover and interact with?
- How are receipts different from productivity scores?
- What is the difference between standard and deep reports?
- What does Pro unlock, and is pricing currently active on the deployment?

## Factual guardrails for downstream copy

- Buildstory is private-first, not universally offline.
- Local mode keeps narrative excerpts on the creator’s machine, but cloud and BYOK modes have different destinations.
- The scanner does not read source-file bodies, but it does inspect local metadata needed to identify repository and session activity.
- Redaction lowers risk; it does not guarantee anonymity or perfect removal of every sensitive fact.
- The creator must review and choose what becomes public.
- AI-generated narrative is evidence-linked and schema-validated, but it is still generated content and should be edited by the creator.
- The leaderboard is an engagement/discovery surface with anti-gaming rules, not a definitive ranking of builder quality.
- Cost figures are rate-card estimates when pricing data is available, not necessarily the creator’s billed spend.
- Some provider adapters are best-effort and may produce quality warnings when formats are unavailable or unverified.
- Production deployment, provider availability, billing configuration, and feature flags should be verified before using “available now” language.

## One-paragraph short description

Buildstory is a private-first platform for sharing the story behind AI-assisted software work. Its local, read-only scanner turns repository and supported AI-session metadata into a sanitized project snapshot, then gives creators a private report they can review, edit, and publish field by field. Public build stories show the decisions, detours, tools, milestones, and turning points behind the artifact — with receipts, chapters, community discovery, and shareable visuals built in.

## One-sentence description

Buildstory turns the private process behind AI-assisted software into an editable, evidence-backed public story.

## Instruction for future content generation

When creating marketing or distribution material from this brief:

1. Lead with the emotional/product insight that the artifact is only half the work.
2. Explain the local scanner and publication boundary concretely.
3. Show the creator journey visually whenever possible.
4. Focus on decisions, turning points, and learning rather than raw activity volume.
5. Use receipts and metrics as supporting evidence, not as a claim of productivity or quality.
6. Keep privacy language mode-specific and accurate.
7. Invite builders to explore, create a first story, or publish a new chapter.
8. Do not invent integrations, customer numbers, testimonials, launch dates, pricing details, or production availability that are not confirmed separately.

