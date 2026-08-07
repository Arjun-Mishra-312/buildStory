export type ShareCardFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

/**
 * Every glyph a share card ever prints as literal text, beyond plain
 * A-Z/a-z/0-9. Sent to loadGoogleFont's `text` param so the requested
 * subset actually covers what gets rendered - a missing glyph renders as
 * tofu, not a silent fallback. Deliberately does NOT include the checkmark
 * seal or bullet dot; those are drawn as inline SVG in story-card.tsx so
 * they never depend on font glyph coverage at all.
 *
 * IMPORTANT: workers-og's loadGoogleFont builds its Google Fonts request URL
 * by interpolating this string directly into a query string WITHOUT
 * URL-encoding it (verified in its compiled source - only the family name
 * is encodeURIComponent'd, not text). A raw `#` here would be parsed as a
 * URL fragment and silently truncate every character after it out of the
 * actual request, so this charset must never contain `#`, `&`, `=`, or `?`
 * (all URL-structural characters) - confirmed by a live render that showed
 * "/" as tofu because it sat right after a `#` in an earlier version of
 * this charset.
 */
const CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
  " .,·%$@!:;()[]/\\+_-";

const FONT_SPECS: Array<{ name: string; family: string; weight: 400 | 700 }> = [
  { name: "Geist", family: "Geist", weight: 400 },
  { name: "Geist", family: "Geist", weight: 700 },
  { name: "Geist Mono", family: "Geist Mono", weight: 400 },
  { name: "Geist Mono", family: "Geist Mono", weight: 700 },
];

// Module-scope cache: a warm isolate reuses these across every request
// instead of re-fetching Google Fonts per card. Deliberately not keyed by
// request text - a fixed generous charset (above) is what makes this
// cache-across-requests strategy possible at all.
const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

async function loadOne(family: string, weight: 400 | 700): Promise<ArrayBuffer | null> {
  const key = `${family}:${weight}`;
  let cached = fontCache.get(key);
  if (!cached) {
    cached = (async () => {
      const { loadGoogleFont } = await import("workers-og");
      try {
        return await loadGoogleFont({ family, weight, text: CHARSET });
      } catch {
        return null;
      }
    })();
    fontCache.set(key, cached);
  }
  return cached;
}

/**
 * Loads the share-card font set. Never throws - a Google Fonts fetch
 * failure (network blip, outage) degrades to an empty array, and callers
 * must fall back to a plain fontFamily so a card still renders rather than
 * 500ing.
 */
export async function loadShareCardFonts(): Promise<ShareCardFont[]> {
  const results = await Promise.all(
    FONT_SPECS.map(async (spec) => {
      const data = await loadOne(spec.family, spec.weight);
      return data ? { name: spec.name, data, weight: spec.weight, style: "normal" as const } : null;
    }),
  );
  return results.filter((font): font is ShareCardFont => font !== null);
}
