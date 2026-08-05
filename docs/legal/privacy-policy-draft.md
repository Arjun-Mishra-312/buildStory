# Buildstory Privacy Policy — DRAFT

> **This is a working draft, not a published or legally reviewed policy.**
> It was written by an engineering assistant from the product's actual
> implemented behavior as of this draft's date, to give a lawyer and the
> founder a concrete, accurate starting point — not to be published,
> linked from the live site, or relied on as legal advice. Every
> `[BRACKETED]` field needs a real answer before this goes anywhere near
> a "Publish" button. Have this reviewed by counsel qualified in your
> jurisdiction before it becomes the actual policy.

**Draft prepared:** 2026-08-05
**Effective date:** [NOT YET IN EFFECT]

## Who this covers

This policy describes how Buildstory ("we", "us", operated by
[LEGAL ENTITY NAME, e.g. "Buildstory, Inc."], a [STATE/COUNTRY OF
INCORPORATION] [entity type]) collects, uses, and shares information
when you use the Buildstory website, the `buildstory` command-line
scanner, and related services (together, the "Service").

## What we collect, and why

### Account information (Google sign-in)

When you sign in, we receive from Google: your name, email address, and
a profile photo URL. We store this alongside an account record we
create for you, including a handle you choose (or that's generated for
you) and a display name you can edit.

*Why:* to identify your account, let other builders find and follow you,
and let you publish under a consistent identity.

### What the local scanner sends us

The `buildstory` CLI runs entirely on your machine and reads your local
Git history and local AI coding-session files (Claude Code, Codex, and
similar tools) that you explicitly point it at. It never sends file
contents, source code, diffs, prompts, AI responses, absolute file
paths, or remote repository URLs to us. What it *can* send, only after
you run `scan-upload` with explicit consent flags:

- Aggregate counts and structural data: session counts, commit counts,
  lines added/removed, file-touch counts, active days, and similar
  numbers.
- Model and tool names you used (e.g. "Claude Sonnet 4", "Codex"), and
  how many turns/requests were attributed to each.
- Deterministic, scanner-generated summary text (e.g. "Codex session
  with 3 user turns, 4 assistant messages, and 5 tool calls") — never
  your own written text or the AI's own written text.
- **Only if you separately opt in** with `--with-evidence --review` and
  type a typed confirmation after reviewing the exact excerpts on
  screen: a small, size-capped set of redacted excerpts from your AI
  coding sessions (file paths, URLs, and hostnames replaced with
  placeholders before anything leaves your machine), used to generate an
  AI-written narrative about your build (see "Third parties" below).

*Why:* to build the "build receipt" and, optionally, an AI-written story
about your project that you can choose to publish.

### What you write and publish yourself

Your public build story (tagline, description, reflection text),
comments you post on other builders' stories, and reactions you give,
are all collected as you create them and are visible to other users
(comments and reactions) or to the public (anything you publish).

### Automatically collected technical data

Standard web server logs (IP address, user agent, timestamps) as part
of operating the Service securely and diagnosing problems. We do not
use third-party analytics or advertising trackers. [CONFIRM: if you add
Cloudflare Web Analytics, an error-tracking service like Sentry, or any
other telemetry, it needs to be disclosed here.]

## Third parties we share data with

- **Google** — for sign-in only (OAuth). Google's own privacy policy
  governs what Google does with your Google account data.
- **[LLM PROVIDER, e.g. OpenAI]** — *only* if you explicitly opt into
  AI narrative generation (see above). The redacted excerpt bundle and
  deterministic build facts are sent to generate your story's headline,
  narrative, turning point, and learnings. [CONFIRM: name the exact
  provider(s) in production, and whether prompts/outputs are used by
  that provider to train their models — check their API terms; OpenAI's
  API terms as of this draft state API data is not used for training by
  default, but verify current terms before publishing.]
- **Cloudflare** — our hosting, database (D1), and edge-network
  infrastructure provider. Cloudflare processes all traffic and stored
  data as our infrastructure provider under their own data processing
  terms.
- We do not sell your personal information, and we do not share it with
  anyone else for their own marketing purposes.

## How long we keep data

- Account and published-content data is kept while your account is
  active.
- If you delete your account (Settings → Delete account), we
  permanently delete your profile, projects, published build stories,
  comments, reactions, and follow relationships. This is immediate and
  irreversible — see the in-product confirmation flow.
  [CONFIRM: whether you want a grace period before permanent deletion
  instead of the current immediate-delete behavior, and whether
  backups/logs are purged on a delay — say so here if they are.]
- Comments you leave on someone else's story that has replies from other
  people may have their content removed but the row preserved (shown as
  "[deleted]") so the surrounding conversation isn't broken — this
  matches ordinary comment-moderation behavior on most social platforms.

## Your rights

- **Access & export** — Settings → Export my data gives you a JSON file
  of your profile, projects, published reports, comments you've
  written, reactions you've given, and your follow graph.
- **Deletion** — Settings → Delete account, described above.
- **Correction** — edit your display name, bio, and published story
  content directly from your dashboard.
- [CONFIRM regional rights language: if you have EU/UK/California users,
  add explicit GDPR (Art. 15–21) and/or CCPA/CPRA rights language here,
  including how to designate an authorized agent and non-discrimination
  assurances, plus a named Data Protection Officer/EU representative if
  required at your scale.]

## Cookies and local storage

We use a session cookie (via Auth.js) to keep you signed in, and browser
local storage for your light/dark theme preference. We don't use
advertising or cross-site tracking cookies.

## Children's privacy

The Service is not directed at children under 13 (or the relevant age
in your jurisdiction), and we don't knowingly collect their data.
[CONFIRM age threshold and add a takedown-request contact if a minor's
data is found.]

## Security

Excerpts and secrets are redacted locally before anything leaves your
machine (see the CLI's fail-closed redaction boundary). Uploads are
short-lived, one-use, and bearer-authenticated. [CONFIRM: add a
responsible-disclosure/security-contact section if you want one, and
confirm your actual incident-response commitments before stating any.]

## Changes to this policy

[CONFIRM: state how you'll notify users of material changes — e.g. an
in-app notice and an updated "Effective date" above — before publishing.]

## Contact

[CONFIRM: a real contact email/address for privacy requests — the
product currently shows hello@buildstory.community in the footer as a
general contact; decide whether privacy requests should go there or to
a dedicated address.]
