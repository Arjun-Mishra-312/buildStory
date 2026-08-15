# BuildStory architecture brief (for marketing)

This is the current product architecture after the open-source engine migration (engine `buildstory-scan@1.2.0`, August 2026). Use it as source of truth for copy, landing pages, launch posts, and docs. Do not invent capabilities that are not listed here.

**Pricing and plan changes are a later workstream.** Do not announce new prices from this document. Mention current product surfaces only.

---

## One-line positioning

> The part that reads your machine is inspectable and self-hostable. You can generate a BuildStory report without an account. BuildStory.com is the hosted renderer, history, and community for that same report.

Product sentence for the engine:

> Turn AI-assisted Git work into the story of how it was built — on your machine.

Site tagline currently used on the homepage:

> Your AI build, decoded.

Do **not** describe this as “we open-sourced some backend.” The trust story is: the code that touches the user’s machine is public; the polished product around the report is hosted.

---

## Canonical names and links

| Thing | Correct name | Link |
| --- | --- | --- |
| Hosted product | BuildStory / Buildstory | https://buildstory.dev |
| Open-source engine (GitHub) | `buildstory-scan` | https://github.com/Arjun-Mishra-312/buildstory-scan |
| npm package | `buildstory-scan` | https://www.npmjs.com/package/buildstory-scan |
| CLI binary | `buildstory-scan` | same as npm |
| Privacy policy | Privacy | https://buildstory.dev/privacy |
| Terms | Terms | https://buildstory.dev/terms |
| About | About | https://buildstory.dev/about |
| Engine license | MIT | in the GitHub repo |

**Never advertise these:**

- `npx buildstory` — unrelated npm package, not ours
- `buildstory` as an npm package or binary — taken by someone else
- `story-scanner` — old/unrelated name, not the install target
- `buildstory-backend` — rejected name; do not use it

The **only** correct install names are the package, the binary, and the `npx` target: **`buildstory-scan`**.

Operator: Arjun Mishra, an individual in British Columbia, Canada. BuildStory is not operated by a company. Do not imply a team, corporation, or “we raised…” unless separately briefed.

---

## What is open source vs closed source

```text
┌─────────────────────────────────────────────────────────┐
│  OPEN SOURCE  (MIT)  github.com/Arjun-Mishra-312/       │
│                  buildstory-scan                         │
│                                                          │
│  Reads the machine. Writes the report.                   │
│  Git aggregates · AI session adapters · redaction        │
│  schema · profile · signals · StoryPack · Ollama/BYOK    │
│  CLI generate · JSON/Markdown/HTML · Ink TUI             │
└──────────────────────────┬──────────────────────────────┘
                           │ optional upload
                           ▼
┌─────────────────────────────────────────────────────────┐
│  CLOSED SOURCE   BuildStory.com  (this product)          │
│                                                          │
│  Auth · interactive report UI · recap / share cards      │
│  publish · profiles · feed · leaderboard · chapters      │
│  GitHub sync · notifications · moderation · billing      │
│  hosted Cloud keys · job queue · evidence at rest        │
└─────────────────────────────────────────────────────────┘
```

### Open (inspectable, MIT)

The engine is what **touches the user’s computer**. Anyone can read it, run it, and generate a real report with no BuildStory account.

- Git **metadata only** (counts, not file bodies)
- Adapters for **Codex, Claude Code, Cursor, Google Antigravity**
- Redaction, schema, validation, canonical JSON
- Builder profile and deterministic signals
- StoryPack generation (standard and deep), with the user’s own model
- Ollama (local) and BYOK (OpenRouter / OpenAI with the user’s key)
- CLI, including account-free `generate`
- Local artifacts: `report.json`, `report.md`, `report.html`
- Privacy docs and the public snapshot schema

Hero command:

```text
npx buildstory-scan generate --repo . --consent local-scan
```

Install:

```text
npm install --global buildstory-scan
```

On a terminal, `generate` opens an interactive dashboard (story, receipt, sessions, signals, evidence). In CI or pipes it writes the same files and prints a short receipt. Nothing is sent to BuildStory during `generate`.

### Closed (the product, not the engine)

BuildStory.com is **not** open source. A person who clones the engine should get a real report. They should **not** get the website.

Keep closed, and do not promise these as “open”:

- Next.js / Vinext UI, design system, recap motion, share cards
- Auth (Google, optional GitHub)
- Hosted storage (D1, R2), publication, chapters, profiles, explore, feed, leaderboard
- Notifications, moderation, analytics
- Billing / entitlement
- Hosted Cloud LLM keys, job queue, evidence stored on our servers

Marketing may say “the scanner is open source” or “the report engine is open source.” Do **not** say “BuildStory is open source” or “the whole product is public.”

---

## How the product works (two paths)

Both paths use the **same engine**. Cloud is hosted generation of that engine, not a second secret brain.

### Path A — local only (no account)

1. User has a Git repo they worked on with AI coding tools.
2. They run `npx buildstory-scan generate --repo . --consent local-scan`.
3. Engine inspects git aggregates + local session metadata, redacts, generates a story (Ollama by default, or their own API key).
4. Files land in `./buildstory/`: JSON (canonical snapshot + StoryPack), Markdown, basic HTML.
5. HTML footer can point to the interactive version on [buildstory.dev](https://buildstory.dev).

This is the trust and acquisition path. Stars and GitHub traffic belong on the engine repo.

### Path B — optional: open it on BuildStory.com

1. User creates an account and a studio session.
2. Dashboard shows `connect` + `scan-upload` commands (same CLI).
3. CLI pins a single origin, exchanges a short-lived device code, uploads **one** validated snapshot.
4. Site stores the private report, runs hosted Cloud generation if they chose Cloud, and offers publish / chapters / profile / discovery.

Connect is **optional**. Do not lead marketing with “install our uploader.” Lead with local generate; then “open it on BuildStory when you want history, publishing, and the interactive report.”

Typical optional commands (session ID and code come from the dashboard):

```text
buildstory-scan connect '<UPLOAD_SESSION_ID>' --code '<DEVICE_CODE>' --remote
buildstory-scan scan-upload --repo . --consent local-scan --upload-consent local-dashboard
```

The wire protocol did not change in this migration. Existing connect → scan-upload → status still works with `buildstory-scan@1.2.0`.

---

## Privacy (must not be contradicted)

This is the opposite of “we read your git diffs and source to write a story.” **Never** claim source-code analysis, diff analysis, or commit-message mining. Opening those would destroy the privacy story.

**Reads, after explicit `--consent local-scan`:**

- Git aggregates: commit / insertion / deletion **counts**, not subjects or diffs
- AI-session **metadata** from Codex, Claude Code, Cursor, Antigravity (standard locations or roots the user provides)

**Never reads / never uploads as source:**

- Source-file bodies
- Diffs or patches
- Commit subjects as public content
- Raw remote URLs (opaque hashes only)
- Absolute local paths

Raw transcript and tool-payload fields are discarded locally. Recognized emails, paths, URLs, hostnames, and known secret formats are redacted or dropped before anything can leave the machine. Pattern redaction is not perfect; Cloud/BYOK still require the user to review excerpts.

### Four narrative modes (genuinely different data flows)

| Mode | User-facing label | What leaves the machine |
| --- | --- | --- |
| `local` | Local | Story is written by **Ollama on loopback**. Excerpts never go to BuildStory or an external vendor. Uploaded snapshot (if they connect) is sanitized prose + metrics. |
| `byok` | Bring your own key | User’s OpenRouter or OpenAI key. Excerpts go to **their** provider after on-screen review. BuildStory never sees the key or the excerpts. |
| `cloud` | Buildstory Cloud | Explicit choice. Reviewed redacted excerpts upload to BuildStory; we generate with our hosted OpenRouter / DeepSeek path (ZDR). |
| `off` | Off | No AI story step. Metrics and profile scores only. |

Default for a new dashboard connection is **Local**. Cloud is not silent. Do not market Cloud as “the only way to get a report.”

Local generate with `--off` is metrics-only and still writes files. Local generate never falls back to a proprietary BuildStory LLM API — that was a trust requirement of this migration.

---

## What the local report contains

Not a dump of JSON for humans. `generate` writes:

- `report.json` — canonical `ProjectSnapshot` + StoryPack (the public contract)
- `report.md` — readable story, receipts, signals
- `report.html` — basic local report, **not** a clone of the website design

Terminal UX (when run in a real terminal): live stages while it runs, then a keyboard dashboard:

1. Story  
2. Receipt (sessions, days, commits, tokens, cost estimate, model mix)  
3. Sessions (counts only, no raw transcript)  
4. Signals (deterministic, by the numbers)  
5. Evidence / trust (what was read, what left the machine)

CI / pipes use `--json` or `--no-tui` and never wait for arrow keys.

Inside a Git folder, `npx buildstory-scan` with no command can start generate and ask for scan consent in the TUI.

---

## What the website is for

Once a report is on BuildStory.com, the closed app provides:

- Sign-in (Google; GitHub optional)
- Private studio reports and project chapters
- Interactive report UI (recap, constellation-style presentation, Ask-your-build, charts) — **presentation stays closed**
- Publish to a public story at `/u/<handle>/<slug>` after an explicit privacy review
- Profiles, explore, search, feed, leaderboard
- Cover images / screenshots, generated share cards
- Optional GitHub repo **verification** (exists / access), not cloning source

Public pages only show fields the creator approved in publication review. Engine artifacts are the same family of report; the site is the polished renderer and community.

---

## Technical shape (enough for accurate “how it works” copy)

- Engine package exports:
  - `buildstory-scan` — CLI / scanner
  - `buildstory-scan/engine` — Worker-safe generation (prompts, profile, signals, StoryPack). No git, no filesystem session scrape, no Ink.
  - `buildstory-scan/schema` — portable snapshot schema
- Hosted Cloud generation **imports that engine**. Same prompts as local CLI. Cloud adds our API key, job queue, and evidence TTL — not a parallel prompt stack.
- The web app is closed and **depends on** the published engine; the scanner no longer lives inside the product repo.
- Current published engine version: **1.2.0** (MIT).

Do not describe folders like `ingestion/git` / `diffs` / `code`. Those are the wrong product. We do not ship source or diff analysis.

---

## Copy rules for the marketing agent

**Do**

- Link the GitHub repo whenever you talk about trust, install, or “what runs on my machine.”
- Lead acquisition with `npx buildstory-scan generate --repo . --consent local-scan`.
- Say users can generate a report with **no account**.
- Say BuildStory.com is optional: interactive report, history, publish, community.
- Repeat what is never read: source, diffs, commit subjects.
- Name supported tools: Codex, Claude Code, Cursor, Google Antigravity.
- Use **`buildstory-scan`** as the only install/npx name.
- Point legal/trust readers at https://buildstory.dev/privacy and the engine `docs/privacy.md` on GitHub.

**Do not**

- Call the whole company/product open source.
- Advertise `npx buildstory`.
- Claim we read source code, diffs, or commit messages to write the story.
- Claim generate phones home to BuildStory for the LLM.
- Promise that the website UI, recap motion, or social graph are in the public repo.
- Invent pricing, discounts, or plan names beyond what live UI already shows. Pricing is a follow-up; this brief does not authorize price copy.
- Imply a large company, VC, or multi-founder team.

---

## Suggested narrative for a launch / landing

1. **Problem:** People shipping with AI coding tools have a real build story, but it is trapped in session logs and git counts — and they should not have to upload a black-box binary to get it.
2. **Trust fix:** The scanner is public MIT. Inspect redaction. Run it yourself.
3. **Product:** One command, on your machine, produces the story of how it was built.
4. **Optional product:** Bring that same report to BuildStory.com to replay it, publish a chapter, and show up in the community.
5. **Privacy punchline:** We never needed your source. We never will.

---

## Live surfaces the agent may link

- Product: https://buildstory.dev  
- Engine source: https://github.com/Arjun-Mishra-312/buildstory-scan  
- npm: https://www.npmjs.com/package/buildstory-scan  
- Privacy: https://buildstory.dev/privacy  
- Terms: https://buildstory.dev/terms  
- About: https://buildstory.dev/about  
- Explore / public stories: https://buildstory.dev/explore  
- Studio connect (logged-in): https://buildstory.dev/studio/connect  

Engine README hero and privacy language are already aligned with this brief. Prefer those words over paraphrases that sound like a generic “git history + LLM” tool.
