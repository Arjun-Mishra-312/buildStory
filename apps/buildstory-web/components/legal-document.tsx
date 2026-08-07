import type { ReactNode } from "react";

export type LegalSection = {
  heading: string;
  paragraphs?: ReactNode[];
  list?: ReactNode[];
};

export function LegalDraftBanner() {
  return (
    <div className="legal-page__banner" role="note">
      <strong>Draft — not yet legally reviewed.</strong> This reflects Buildstory&rsquo;s actual
      implemented behavior, but has not been reviewed by counsel and is not a final, binding
      agreement. Bracketed text like <code>[LEGAL ENTITY NAME]</code> marks a placeholder that is
      still being decided.
    </div>
  );
}

export function LegalDocument({ preparedDate, sections }: { preparedDate: string; sections: LegalSection[] }) {
  return (
    <article className="legal-page__doc">
      <p className="legal-page__meta">Draft prepared {preparedDate} · Effective date: not yet in effect</p>
      {sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          {section.list ? (
            <ul>
              {section.list.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </article>
  );
}
