import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/legal-document";

export const metadata: Metadata = { title: "Terms of Service" };

const sections: LegalSection[] = [
  {
    heading: "1. Who this agreement is with",
    paragraphs: [
      <>These terms are between you and Arjun Mishra, an individual based in British Columbia, Canada, operating Buildstory (the website, the <code>buildstory-scan</code> command-line tool, and related services — together, the &ldquo;Service&rdquo;). Buildstory is not operated by a company. By creating an account or using the Service you agree to these terms and to our <Link href="/privacy">Privacy Policy</Link>.</>,
    ],
  },
  {
    heading: "2. What Buildstory is",
    paragraphs: [
      "Buildstory lets people who build software with AI coding agents publish a verified “build story”: a public page combining their own writing with structural facts derived from local Git history and AI coding-session data. The scanner does not read or upload repository source-file bodies or diffs and discards raw transcript/tool payloads locally. Buildstory Cloud is the explicit exception for conversation text: it uploads only the reviewed, size-capped, pattern-redacted excerpts described in the Privacy Policy.",
      "AI narrative generation runs in one of four modes you choose: Local (a small model on your machine via Ollama), Bring Your Own Key (a cloud model you configure with your own API key, called directly from your machine), Buildstory Cloud (an explicit, reviewed opt-in that routes redacted excerpts through Buildstory to our narrative provider), or Off (no narrative generation at all). See the Privacy Policy for exactly what each mode sends and to whom.",
    ],
  },
  {
    heading: "3. Accounts",
    list: [
      "You need a Google account to sign in, or optionally a GitHub account where that's enabled. You're responsible for keeping your account secure and for all activity under it.",
      "Your handle must be your own and must not impersonate anyone else. A short list of reserved handles is enforced automatically at signup.",
      "You must be at least 13 years old to use the Service.",
    ],
  },
  {
    heading: "4. Your content",
    list: [
      <><strong>You own what you publish.</strong> Your build stories, comments, and any other content you submit (&ldquo;Your Content&rdquo;) remain yours.</>,
      <><strong>License you grant us:</strong> by publishing Your Content, you grant Buildstory a worldwide, non-exclusive, royalty-free license to host, display, and distribute it as part of operating the Service (e.g. showing your published story to other visitors, including it in a feed or leaderboard). This license ends when you unpublish or delete the content, except for residual copies that reasonably persist in backups until they cycle out.</>,
      <><strong>AI-generated narrative text:</strong> whichever mode produced it, the resulting headline/narrative/turning-point/learnings text is treated the same as content you wrote — it&rsquo;s sanitized before storage, but you review and can edit it, and you&rsquo;re responsible for what you choose to publish. The law on ownership of AI-generated text is still unsettled in most jurisdictions; we make no representation about its copyright status beyond what&rsquo;s stated here.</>,
      <><strong>Bring Your Own Key:</strong> in BYOK mode, the model provider, your API key, its cost, and your relationship with that provider are entirely yours. Buildstory is not a party to that relationship, has no visibility into it, and is not responsible for that provider&rsquo;s availability, output, pricing, or terms.</>,
      <><strong>What you must not publish:</strong> content that&rsquo;s unlawful, infringing, harassing, or that discloses someone else&rsquo;s private information without consent (including secrets, credentials, or private repository contents you might paste into a comment — remember the scanner&rsquo;s own redaction guarantees do not apply to text you type directly into comments).</>,
    ],
  },
  {
    heading: "5. Moderation and enforcement",
    list: [
      "Any signed-in user can report a comment, a story, or a profile for review (spam, harassment, impersonation, malicious content, or other).",
      "We may remove content, suspend, or terminate accounts that violate these terms, at our discretion. As a solo-operated project we don't commit to a specific response-time SLA for reports or appeals, but every report is logged and reviewed.",
      "Removed comments may be shown as “[deleted]” rather than fully erased from the page, to preserve the surrounding conversation for other participants; the comment's own text is discarded either way.",
    ],
  },
  {
    heading: "6. Account deletion",
    paragraphs: [
      "You can permanently delete your account and remove its live product data and public access (profile, projects, scan snapshots and narrative text, published stories, comments, reactions, and follow relationships) from Settings at any time. This is immediate in the product and cannot be undone; limited infrastructure recovery copies and provider security logs may cycle out later as described in the Privacy Policy.",
    ],
  },
  {
    heading: "7. Leaderboards and rankings",
    paragraphs: [
      "Leaderboard rank is computed from verified, structural build activity (commits, active days) across your published stories, with a per-project daily cap specifically so a single burst of activity can't dominate a ranking meant to reflect sustained work. We reserve the right to adjust the ranking methodology, exclude accounts found to be gaming it outside the built-in cap, or reset rankings; we'll state a reason if we do.",
    ],
  },
  {
    heading: "8. Pro",
    paragraphs: [
      "Pro adds the layered deep-analysis report for Buildstory Cloud and BYOK OpenRouter/OpenAI, including broader reviewed evidence, source-linked findings, risks, recommendations, and chapter-over-chapter observations. The launch promotion currently grants the deep tier to every account; ending it activates the durable Free/Pro distinction without changing existing reports.",
      "Local Ollama produces the standard-depth report, but its evidence capacity is not plan-gated: the scanner automatically selects a safe, balanced, or enhanced profile from the machine's available RAM and logical CPUs. Deep remains a cloud/BYOK pipeline because it depends on two high-reasoning passes and reliable large structured outputs, not because Buildstory intentionally reduces Local on paid or free accounts. Every account remains subject to a fair-use ceiling of 500 stored reports — an anti-abuse measure tied to storage cost, not a scan limit.",
    ],
  },
  {
    heading: "9. Disclaimers",
    paragraphs: [
      "The Service is provided “as is” without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. We don't guarantee the Service will be uninterrupted, secure, or error-free, or that any AI-generated content will be accurate. Nothing in this section limits any warranty that cannot be excluded under the laws of British Columbia or your jurisdiction.",
    ],
  },
  {
    heading: "10. Limitation of liability",
    paragraphs: [
      "To the maximum extent permitted by law, Buildstory (meaning Arjun Mishra, its operator) is not liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, revenue, or profits, arising from your use of the Service. Our total liability for any claim arising from these terms or the Service is limited to the greater of CAD $100 or the amount you paid us in the twelve months before the claim arose — which for a service that is currently free to use is CAD $100. Nothing here limits liability that cannot be limited under applicable law.",
    ],
  },
  {
    heading: "11. Governing law and disputes",
    paragraphs: [
      "These terms are governed by the laws of British Columbia, Canada, without regard to conflict-of-law principles. You agree to the exclusive jurisdiction of the courts of British Columbia for any dispute arising from these terms or the Service, without prejudice to any mandatory consumer-protection rights you may have in your own jurisdiction that cannot be waived by this clause.",
    ],
  },
  {
    heading: "12. Changes to these terms",
    paragraphs: [
      "If we make a material change to these terms, we'll update the effective date above and post an in-app notice before the change takes effect. Continuing to use the Service after that means you accept the updated terms.",
    ],
  },
  {
    heading: "13. Contact",
    paragraphs: ["For any question about these terms, email arjunmishra31204@gmail.com."],
  },
];

export default function TermsPage() {
  return (
    <section className="legal-page section-wrap">
      <span className="section-index">( TERMS )</span>
      <h1>Terms of Service</h1>
      <LegalDocument effectiveDate="August 8, 2026" sections={sections} />
    </section>
  );
}
