import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = { title: "Privacy Policy" };

const sections: LegalSection[] = [
  {
    heading: "Who this covers",
    paragraphs: [
      "This policy describes how Buildstory, a service operated by Arjun Mishra, an individual based in British Columbia, Canada (“we”, “us”), collects, uses, and shares information when you use the Buildstory website, the buildstory-scan command-line scanner, and related services (together, the “Service”).",
      "Buildstory is operated by one person, not a company. References to “we” and “us” throughout this policy mean Arjun Mishra acting as the Service's operator.",
    ],
  },
  {
    heading: "Account information (Google or GitHub sign-in)",
    paragraphs: [
      "When you sign in with Google, we receive your name, email address, and a profile photo URL. When you sign in with GitHub (an optional second identity provider), we receive the same categories of information from GitHub's OAuth response. We store this alongside an account record we create for you, including a handle you choose (or that's generated for you) and a display name you can edit.",
      <><em>Why:</em> to identify your account, let other builders find and follow you, and let you publish under a consistent identity.</>,
      "If you sign in with both providers using the same verified email address, we link them to one account rather than creating two.",
    ],
  },
  {
    heading: "What the local scanner sends us",
    paragraphs: [
      "The buildstory-scan CLI runs entirely on your machine and reads your local Git history and local AI coding-session files (Claude Code, Codex, Cursor, and Google Antigravity) that you explicitly point it at. It never sends file contents, source code, diffs, prompts, AI responses, absolute file paths, or remote repository URLs to us. What it sends depends on which of four narrative modes you choose on the dashboard before scanning — each is a genuinely different data flow, not a label on the same flow:",
    ],
    list: [
      <><strong>Local (the default).</strong> A small language model runs on your own machine through Ollama. Conversation excerpts are used only in your machine&rsquo;s memory during generation and are never sent anywhere. The AI-written narrative text the model produces is redacted on your machine and then uploaded to us — this is prose written from your private sessions, and it becomes part of your private report.</>,
      <><strong>Bring your own key (BYOK).</strong> The scanner calls a cloud model you configure yourself, using an API key you hold. Redacted excerpts are sent from your machine directly to that provider, under that provider&rsquo;s own terms — never through Buildstory, and never seen or stored by us. We receive only the resulting redacted narrative text, exactly as in Local mode. We never receive your API key.</>,
      <><strong>Cloud.</strong> An explicit opt-in. After you type a confirmation on screen, a small, size-capped set of redacted excerpts from your AI coding sessions (file paths, URLs, and hostnames replaced with placeholders before anything leaves your machine) is uploaded to us and forwarded to our configured cloud model provider to generate the narrative text. This is the only mode where Buildstory itself receives excerpt text.</>,
      <><strong>Off.</strong> No AI narrative step runs at all. Only deterministic, scanner-computed metrics and profile scores are uploaded — counts, dates, and formula-derived numbers, never prose.</>,
    ],
  },
  {
    heading: "What's uploaded in every mode",
    list: [
      "Aggregate counts and structural data: session counts, commit counts, lines added/removed, file-touch counts, active days, and similar numbers.",
      "Model and tool names you used (e.g. “Claude Sonnet”, “Codex”), and how many turns/requests were attributed to each.",
      "Deterministic, scanner-generated summary text (e.g. “Codex session with 3 user turns, 4 assistant messages, and 5 tool calls”) — never your own written text or the AI's own written text.",
    ],
  },
  {
    heading: "What you write and publish yourself",
    paragraphs: [
      "Your public build story (tagline, description, reflection text), comments you post on other builders' stories, and reactions you give, are all collected as you create them and are visible to other users (comments and reactions) or to the public (anything you publish).",
    ],
  },
  {
    heading: "Cover images, screenshots, and generated share cards",
    paragraphs: [
      "If you upload a cover image or screenshots for a report, we store the file in our object storage and serve it back through our CDN. Deleting the report or your account removes the reference to it; the underlying file is deleted on a best-effort basis and may occasionally be orphaned if deletion fails partway — this doesn't expose it publicly, but we note it for completeness. We also generate social share (Open Graph) card images from your published story's own public fields — nothing beyond what's already on the public page.",
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
      "Standard web server logs (IP address, user agent, timestamps) as part of operating the Service securely and diagnosing problems. IP addresses are also used, keyed and time-windowed, to rate-limit requests and prevent abuse; these rate-limit records expire automatically and are not used to build a profile of you.",
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
      "Our configured cloud narrative model provider — only in Cloud mode, and only the redacted excerpt bundle and deterministic build facts you explicitly reviewed and released. We do not permit that provider to use your data to train their models, per our agreement with them.",
      "Your own chosen cloud model provider — only in BYOK mode, and only because you configured your machine to call it directly. That is a relationship and a data flow between you and that provider; Buildstory is not a party to it and never sees the excerpts or your key. Your provider's own terms and privacy policy govern that flow.",
      "Cloudflare — our hosting, database (D1), object storage (R2), and edge-network infrastructure provider. Cloudflare processes all traffic and stored data as our infrastructure provider under their own data processing terms. This also means the Service is served from Cloudflare's global edge network and, in Cloud mode, reaches a cloud model provider that may process data outside Canada — including in the United States.",
      "We do not sell your personal information, and we do not share it with anyone else for their own marketing purposes.",
    ],
  },
  {
    heading: "How long we keep data",
    list: [
      "Account and published-content data is kept while your account is active.",
      "If you delete your account (Settings → Delete account), we permanently delete your profile, projects, private and published build stories and their underlying scan snapshots, narrative text, uploaded evidence excerpts, comments, reactions, and follow relationships. This is immediate and irreversible — see the in-product confirmation flow. Cover images and screenshots in object storage are deleted on a best-effort basis, as noted above. We do not currently offer a grace period before deletion; if you're unsure, export your data first.",
      "Comments you leave on someone else's story that has replies from other people may have their content removed but the row preserved (shown as “[deleted]”) so the surrounding conversation isn't broken — this matches ordinary comment-moderation behavior on most social platforms.",
      "As an anti-abuse measure (not a plan limit — see the Terms), an account may hold up to 500 stored reports. This has no bearing on retention of the reports you do have; it only prevents new scans once the ceiling is reached, with a clear message and no charge implied.",
    ],
  },
  {
    heading: "Your rights",
    list: [
      "Access & export — Settings → Export my data gives you a JSON file of your profile, projects, scan snapshots and narrative text, uploaded evidence excerpts, upload-session records, published reports, comments you've written, reactions you've given, and your follow graph.",
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
      "Excerpts and secrets are redacted locally before anything leaves your machine (see the CLI's fail-closed redaction boundary, documented in the buildstory-scan package). Uploads are short-lived, one-use, and bearer-authenticated. If you believe you've found a security vulnerability in the Service, email arjunmishra31204@gmail.com — as a solo-operated project we can't commit to a formal bug-bounty program, but we take reports seriously and will acknowledge them promptly.",
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
