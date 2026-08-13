import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = { title: "Privacy Policy" };

const sections: LegalSection[] = [
  {
    heading: "Who this covers",
    paragraphs: [
      "This policy describes how Buildstory, a service operated by Arjun Mishra, an individual based in British Columbia, Canada (“we”, “us”), collects, uses, and shares information when you use the Buildstory website, the buildstory-scan command-line scanner, and related services (together, the “Service”). The report-generation engine is open source at https://github.com/Arjun-Mishra-312/buildstory-scan — you can inspect exactly how a repository is processed, or generate a report entirely on your own machine.",
      "Buildstory is operated by one person, not a company. References to “we” and “us” throughout this policy mean Arjun Mishra acting as the Service's operator.",
    ],
  },
  {
    heading: "Account information (Google or GitHub sign-in)",
    paragraphs: [
      "When you sign in with Google, we receive your name, email address, and a profile photo URL. When you sign in with GitHub (an optional second identity provider), we receive the same categories of information from GitHub's OAuth response. We store this alongside an account record we create for you, including a handle you choose (or that's generated for you) and a display name you can edit.",
      <><em>Why:</em> to identify your account, let other builders find and follow you, and let you publish under a consistent identity.</>,
      "When you add GitHub sign-in to an existing account and GitHub supplies the same verified email address, we link that GitHub identity to the existing account. Do not assume identities will be merged in every provider order; contact us if you encounter a duplicate account.",
    ],
  },
  {
    heading: "What the local scanner sends us",
    paragraphs: [
      "The buildstory-scan process runs on your machine. It reads Git metadata without reading repository file bodies or diffs, and—only after explicit scan consent—parses supported local AI coding-session stores discovered in their standard locations or roots you provide. Raw transcript and tool-payload fields are discarded locally. The Buildstory Cloud exception below can upload a reviewed, redacted subset of conversation text; no mode uploads repository source files, diffs, absolute paths, or raw remote URLs to Buildstory. The four modes are genuinely different data flows:",
    ],
    list: [
      <><strong>Local.</strong> A language model runs through Ollama on your machine and produces a standard-depth report. The scanner automatically selects a safe, balanced, or enhanced evidence profile from available RAM and logical CPUs, allowing up to 40, 64, or 80 excerpts; this is not plan-gated. Selected excerpts are sent only over loopback, not to Buildstory or an external model provider. The AI-written narrative text is sanitized locally and uploaded as part of your private report.</>,
      <><strong>Bring your own key (BYOK).</strong> Choose OpenRouter with DeepSeek V4 Flash or OpenAI GPT-5.6 Luna. Before any provider request, the CLI shows and requires confirmation of the exact redacted excerpts and deterministic facts that will be sent: the cleaned repository label; session, turn, tool-call, Git-change, and work-pattern aggregates; model name; archetype; and formula-derived profile scores. Eligible Deep uses a private analysis pass followed by V3 synthesis. Each component may make at most one bounded JSON-repair request. Standard is capped at 80 excerpts, 800 characters each and 60,000 characters total; Deep at 400 excerpts, 1,500 characters each and 700 KiB total, dynamically reduced to fit the upload grant. Requests go directly to your provider; Buildstory receives only the finished report and content-free receipt, never your key or excerpts. OpenRouter requests require ZDR routing and deny data collection. OpenAI requests send <code>store: false</code>, but retention follows your OpenAI organization policy.</>,
      <><strong>Buildstory Cloud (recommended).</strong> Standard can upload up to 80 reviewed excerpts, 800 characters each and 60,000 characters total. Pro deep can upload up to 400 reviewed excerpts, 1,500 characters each and 700 KiB total, dynamically reduced within the 1 MiB upload limit. The same deterministic facts listed for BYOK are sent. For an update chapter, Deep also sends the prior stored chapter&apos;s build window, session and commit totals, usage aggregates, deterministic builder profile, and final retained narrative/story pack; it does not send the prior chapter&apos;s excerpts. Standard uses one generation request and at most one repair. Deep sends current excerpts in its analysis request and possible repair. Its synthesis request and possible repair do not directly include the excerpt strings, but do include deterministic facts, source metadata, and a model-produced analysis map that can summarize excerpt content. Hosted generation uses only DeepSeek V4 Flash through OpenRouter with a ZDR-eligible endpoint required, data collection denied, and parameter support required; no different model or direct OpenAI fallback is allowed.</>,
      <><strong>Off.</strong> No AI narrative step runs at all. Only deterministic, scanner-computed metrics and profile scores are uploaded — counts, dates, and formula-derived numbers, never prose.</>,
    ],
  },
  {
    heading: "What's uploaded in every mode",
    list: [
      "Repository metadata: a cleaned display name, branch, HEAD commit hash, detached/bare flags, an opaque repository fingerprint and remote-path hash (never the raw local path, remote URL, or host). These fields stay private unless the publication review expressly lists an aggregate derived from them; commit hashes are never put on the public page.",
      "Time and activity metadata: exact scan/build/session timestamps, UTC offset when available, session duration/status, active days, and aggregate session/message/tool/subagent counts.",
      "Usage and Git aggregates: model/tool names, request and token counts, static-table cost estimates and coverage, commits, insertions, deletions, file touches, branch and contributor counts, and working-tree status counts.",
      "Source diagnostics and integrity data: providers and roots considered as counts, matched/included file and session counts, warnings, opaque session/evidence references, schema/scanner versions, consent record, hashes, and redaction/quality summaries.",
      "Deterministic scanner summaries and milestones composed from counts and lifecycle metadata. Local and BYOK modes can also upload the sanitized model-written narrative. Buildstory Cloud additionally uploads only the reviewed excerpt bundle described above.",
    ],
  },
  {
    heading: "What you write and publish yourself",
    paragraphs: [
      "Before publication, Buildstory shows a final privacy review and requires acknowledgement. Project name, owner display name/handle/role, category, status, tech-stack labels, visual background, and an opaque public receipt ID are always public. Only optional categories checked in the review are copied from the private report. The review calls out AI-written prose, links, and uploaded images because those deserve a manual read. Your comments and reactions are visible to other users; published story fields are visible to anyone.",
    ],
  },
  {
    heading: "Cover images, screenshots, and generated share cards",
    paragraphs: [
      "If you upload a cover image or screenshots for a report, we store the file in object storage. It is readable by you while private and by anyone only while its exact media ID is included in a frozen public story. Unpublishing revokes public route access. Deleting media or your account removes its database authorization first and then deletes the underlying object on a best-effort basis, so an object orphaned by a partial storage failure is not readable through the application route. We also generate social share (Open Graph) cards only from fields already frozen on the public page.",
    ],
  },
  {
    heading: "GitHub repository verification",
    paragraphs: [
      "If you link a GitHub repository URL to a project, we make a request to confirm the repository exists and, where applicable, that you have access to it. We store the verified URL and the verification timestamp, not the repository's contents.",
    ],
  },
  {
    heading: "Notifications, content reports, and moderation",
    paragraphs: [
      "We store in-app notifications about activity on your account (follows, reactions, comments) so you can see them when you visit — we do not send these by email; see “No email” below. If you or someone else files a content report about a story, comment, or profile, we store the report, its reason, and (for reports we act on) a content-free audit trail of the resolution. If you're a moderator, actions you take are similarly logged.",
    ],
  },
  {
    heading: "Guidance, onboarding, and builder role",
    paragraphs: [
      "We store which product walkthroughs and onboarding steps you've seen or completed, and the builder role you select (e.g. “independent builder”) so we can tailor the interface and your public profile.",
    ],
  },
  {
    heading: "Automatically collected technical data",
    paragraphs: [
      "Standard web server logs (IP address, user agent, timestamps) are processed as part of operating the Service securely and diagnosing problems. A raw IP address may also appear inside a scoped, time-windowed rate-limit key for up to one hour; those records expire automatically and are not used to build a profile of you.",
      "We do not use third-party analytics or advertising trackers. This is a commitment, not just a description of today's configuration — if that ever changes (for example, by enabling Cloudflare's own web analytics), we will update this policy first, not after.",
    ],
  },
  {
    heading: "No email",
    paragraphs: [
      "Buildstory has no capability to send you email of any kind — no marketing email, no transactional email, no notification digests. Everything described as a “notification” above is shown only inside the product when you're signed in. Because we never send email, Canada's Anti-Spam Legislation (CASL) consent and unsubscribe requirements don't apply to anything we do; we note this for clarity rather than because it constrains us.",
    ],
  },
  {
    heading: "Third parties we share data with",
    list: [
      "Google and, optionally, GitHub — for sign-in only (OAuth). Each provider's own privacy policy governs what that provider does with your account data.",
      "OpenRouter — our only hosted narrative gateway. Hosted requests use DeepSeek V4 Flash and require Zero Data Retention-eligible downstream endpoints, deny provider data collection, and require parameter support. Those controls prevent prompt/response retention by the selected model endpoint; OpenRouter still processes and may retain operational, account, billing, security, and request metadata under its own privacy policy. OpenRouter can route only among endpoints that satisfy the request controls.",
      "OpenAI — only for a creator-selected BYOK request. The retained adapter sends store: false. OpenAI's API terms and the creator's organization settings govern retention; this is not covered by Buildstory's OpenRouter ZDR promise.",
      "Your own chosen cloud model provider — only in BYOK mode, and only because you configured your machine to call it directly. That is a relationship and a data flow between you and that provider; Buildstory is not a party to it and never sees the excerpts or your key. Your provider's own terms and privacy policy govern that flow.",
      "Cloudflare — our hosting, database (D1), object storage (R2), and edge-network infrastructure provider. Cloudflare processes all traffic and stored data as our infrastructure provider under their own data processing terms. This also means the Service is served from Cloudflare's global edge network and, in Buildstory Cloud mode, reaches our narrative provider, which may process data outside Canada — including in the United States.",
      "YouTube, Vimeo, or Loom — only when a published story contains one of those video links and a visitor explicitly clicks the load button. Until that click no provider iframe is requested; after it, the provider receives the visitor's IP address and normal browser request data under its own policy.",
      "We do not sell your personal information, and we do not share it with anyone else for their own marketing purposes.",
    ],
  },
  {
    heading: "How long we keep data",
    list: [
      "Account and published-content data is kept while your account is active.",
      "Hosted excerpt text is retained by Buildstory only while a narrative is queued, running, or retryable. It is erased from the live report and upload-session records on success or final failure, and is marked to expire two hours after the job is created; scheduled processing enforces that deadline. Only counts, byte size, policy and consent versions, and the scrub timestamp remain afterward. If you delete your account, we immediately remove the remaining live product records and public access. Infrastructure recovery copies may cycle out later. Object deletion is best-effort after route authorization is removed.",
      "As an anti-abuse measure (not a plan limit — see the Terms), an account may hold up to 500 stored reports. This has no bearing on retention of the reports you do have; it only prevents new scans once the ceiling is reached, with a clear message and no charge implied.",
    ],
  },
  {
    heading: "Your rights",
    list: [
      "Access & export — Settings → Export my data gives you a JSON file of your profile, projects, scan snapshots and narrative text, any hosted evidence excerpts that have not yet been scrubbed, content-free evidence receipts, upload-session records, published reports, comments you've written, reactions you've given, and your follow graph.",
      "Deletion — Settings → Delete account, described above.",
      "Correction — edit your display name, bio, and published story content directly from your dashboard.",
      "We are based in British Columbia, Canada, and handle these requests under Canada's federal Personal Information Protection and Electronic Documents Act (PIPEDA) and British Columbia's Personal Information Protection Act (PIPA). If you're contacting us about a rights request that isn't already self-service in Settings, or with a complaint about how we've handled your information, email arjunmishra31204@gmail.com and we will respond within 30 days.",
      "California residents: you have rights under the CCPA/CPRA to know, delete, and correct your personal information, and to not be discriminated against for exercising those rights. We do not sell or share personal information for cross-context behavioral advertising. You may exercise these rights through the same Settings tools above, through an authorized agent, or by emailing arjunmishra31204@gmail.com.",
      "EU/UK/EEA residents: you have rights under the GDPR (or UK GDPR) to access, rectify, erase, restrict, or port your personal data, and to object to certain processing, exercised the same way. Because Buildstory has no EU/UK establishment, there is no separate EU representative to name; contact arjunmishra31204@gmail.com directly.",
    ],
  },
  {
    heading: "Cookies and local storage",
    paragraphs: [
      "We use a session cookie (via Auth.js) to keep you signed in, and browser local storage for your light/dark theme preference and your chosen narrative mode/model preference (which is per-browser, not synced to your account). We don't use advertising or cross-site tracking cookies.",
    ],
  },
  {
    heading: "Children's privacy",
    paragraphs: [
      "The Service is not directed at children under 13, and we don't knowingly collect their data. If you believe a child under 13 has created an account, email arjunmishra31204@gmail.com and we will remove it.",
    ],
  },
  {
    heading: "Security",
    paragraphs: [
      "Recognized secrets, emails, locations, URLs, and hosts are redacted locally before an excerpt can leave your machine, followed by schema validation and a fail-closed location/secret scan. These controls do not identify every novel or low-entropy secret, personal name, proprietary idea, or pasted code fragment, so Cloud mode also requires human review. Upload grants are short-lived, bearer-authenticated, and server-side one-use. If you believe you've found a security vulnerability, email arjunmishra31204@gmail.com.",
    ],
  },
  {
    heading: "Changes to this policy",
    paragraphs: [
      "If we make a material change to this policy, we'll update the effective date above and post an in-app notice. Continuing to use the Service after a change takes effect means you accept the updated policy.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [
      "For any question about this policy or your data, email arjunmishra31204@gmail.com.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <section className="legal-page section-wrap">
      <span className="section-index">( PRIVACY )</span>
      <h1>Privacy Policy</h1>
      <LegalDocument effectiveDate="August 8, 2026" sections={sections} />
    </section>
  );
}
