import type { ReactNode } from "react";

export type LegalSection = {
  heading: string;
  paragraphs?: ReactNode[];
  list?: ReactNode[];
};

export function LegalDocument({ effectiveDate, sections }: { effectiveDate: string; sections: LegalSection[] }) {
  return (
    <article className="legal-page__doc">
      <p className="legal-page__meta">Effective date: {effectiveDate}</p>
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
