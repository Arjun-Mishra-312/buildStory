import type { Metadata } from "next";
import { LegalDocument, LegalDraftBanner, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = { title: "Privacy Policy" };

const sections: LegalSection[] = [
  {
    heading: "Who this covers",
    paragraphs: [
      "This policy describes how Buildstory (“we”, “us”, operated by [LEGAL ENTITY NAME, e.g. “Buildstory, Inc.”], a [STATE/COUNTRY OF INCORPORATION] [entity type]) collects, uses, and shares information when you use the Buildstory website, the buildstory command-line scanner, and related services (together, the “Service”).",
    ],
  },
  {
    heading: "Account information (Google sign-in)",
    paragraphs: [
      "When you sign in, we receive from Google: your name, email address, and a profile photo URL. We store this alongside an account record we create for you, including a handle you choose (or that's generated for you) and a display name you can edit.",
      <><em>Why:</em> to identify your account, let other builders find and follow you, and let you publish under a consistent identity.</>,
    ],
  },
  {
    heading: "What the local scanner sends us",
    paragraphs: [
      "The buildstory CLI runs entirely on your machine and reads your local Git history and local AI coding-session files (Claude Code, Codex, and similar tools) that you explicitly point it at. It never sends file contents, source code, diffs, prompts, AI responses, absolute file paths, or remote repository URLs to us. What it can send, only after you run scan-upload with explicit consent flags:",
    ],
    list: [
      "Aggregate counts and structural data: session counts, commit counts, lines added/removed, file-touch counts, active days, and similar numbers.",
      "Model and tool names you used (e.g. “Claude Sonnet”, “Codex”), and how many turns/requests were attributed to each.",
      "Deterministic, scanner-generated summary text (e.g. “Codex session with 3 user turns, 4 assistant messages, and 5 tool calls”) — never your own written text or the AI's own written text.",
      "Only if you separately opt in with --with-evidence --review and type a typed confirmation after reviewing the exact excerpts on screen: a small, size-capped set of redacted excerpts from your AI coding sessions (file paths, URLs, and hostnames replaced with placeholders before anything leaves your machine), used to generate an AI-written narrative about your build (see “Third parties” below).",
    ],
  },
  {
    heading: "What you write and publish yourself",
    paragraphs: [
      "Your public build story (tagline, description, reflection text), comments you post on other builders' stories, and reactions you give, are all collected as you create them and are visible to other users (comments and reactions) or to the public (anything you publish).",
    ],
  },
  {
    heading: "Automatically collected technical data",
    paragraphs: [
      "Standard web server logs (IP address, user agent, timestamps) as part of operating the Service securely and diagnosing problems. We do not use third-party analytics or advertising trackers. [CONFIRM: if you add Cloudflare Web Analytics, an error-tracking service like Sentry, or any other telemetry, it needs to be disclosed here.]",
    ],
  },
  {
    heading: "Third parties we share data with",
    list: [
      "Google — for sign-in only (OAuth). Google's own privacy policy governs what Google does with your Google account data.",
      "[LLM PROVIDER, e.g. OpenAI] — only if you explicitly opt into AI narrative generation (see above). The redacted excerpt bundle and deterministic build facts are sent to generate your story's headline, narrative, turning point, and learnings. [CONFIRM: name the exact provider(s) in production, and whether prompts/outputs are used by that provider to train their models — check their API terms.]",
      "Cloudflare — our hosting, database (D1), and edge-network infrastructure provider. Cloudflare processes all traffic and stored data as our infrastructure provider under their own data processing terms.",
      "We do not sell your personal information, and we do not share it with anyone else for their own marketing purposes.",
    ],
  },
  {
    heading: "How long we keep data",
    list: [
      "Account and published-content data is kept while your account is active.",
      "If you delete your account (Settings → Delete account), we permanently delete your profile, projects, published build stories, comments, reactions, and follow relationships. This is immediate and irreversible — see the in-product confirmation flow. [CONFIRM: whether you want a grace period before permanent deletion instead of the current immediate-delete behavior, and whether backups/logs are purged on a delay.]",
      "Comments you leave on someone else's story that has replies from other people may have their content removed but the row preserved (shown as “[deleted]”) so the surrounding conversation isn't broken — this matches ordinary comment-moderation behavior on most social platforms.",
    ],
  },
  {
    heading: "Your rights",
    list: [
      "Access & export — Settings → Export my data gives you a JSON file of your profile, projects, published reports, comments you've written, reactions you've given, and your follow graph.",
      "Deletion — Settings → Delete account, described above.",
      "Correction — edit your display name, bio, and published story content directly from your dashboard.",
      "[CONFIRM regional rights language: if you have EU/UK/California users, add explicit GDPR (Art. 15–21) and/or CCPA/CPRA rights language here, including how to designate an authorized agent and non-discrimination assurances, plus a named Data Protection Officer/EU representative if required at your scale.]",
    ],
  },
  {
    heading: "Cookies and local storage",
    paragraphs: [
      "We use a session cookie (via Auth.js) to keep you signed in, and browser local storage for your light/dark theme preference. We don't use advertising or cross-site tracking cookies.",
    ],
  },
  {
    heading: "Children's privacy",
    paragraphs: [
      "The Service is not directed at children under 13 (or the relevant age in your jurisdiction), and we don't knowingly collect their data. [CONFIRM age threshold and add a takedown-request contact if a minor's data is found.]",
    ],
  },
  {
    heading: "Security",
    paragraphs: [
      "Excerpts and secrets are redacted locally before anything leaves your machine (see the CLI's fail-closed redaction boundary). Uploads are short-lived, one-use, and bearer-authenticated. [CONFIRM: add a responsible-disclosure/security-contact section if you want one, and confirm your actual incident-response commitments before stating any.]",
    ],
  },
  {
    heading: "Changes to this policy",
    paragraphs: [
      "[CONFIRM: state how you'll notify users of material changes — e.g. an in-app notice and an updated “Effective date” above — before publishing.]",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [
      "[CONFIRM: a real contact email/address for privacy requests — the product currently shows hello@buildstory.community in the footer as a general contact; decide whether privacy requests should go there or to a dedicated address.]",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <section className="legal-page section-wrap">
      <span className="section-index">( PRIVACY )</span>
      <h1>Privacy Policy</h1>
      <LegalDraftBanner />
      <LegalDocument preparedDate="2026-08-05" sections={sections} />
    </section>
  );
}
