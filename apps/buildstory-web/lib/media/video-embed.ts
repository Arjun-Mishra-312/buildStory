export type VideoEmbed = { provider: "youtube" | "vimeo" | "loom"; embedUrl: string };

/**
 * Resolves a creator-supplied video URL to a canonical, constructed embed URL
 * against a small host allowlist - never by interpolating the raw URL into
 * an iframe src. Only well-formed IDs matching each provider's known shape
 * are accepted; anything else (unknown host, malformed ID) returns null and
 * the caller renders a plain link instead of an embed.
 */
export function resolveVideoEmbed(rawUrl: string | null | undefined): VideoEmbed | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLocaleLowerCase("en-US");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") {
    const fromQuery = url.searchParams.get("v");
    const fromPath = url.pathname.startsWith("/embed/")
      ? url.pathname.slice("/embed/".length)
      : url.pathname.startsWith("/shorts/")
        ? url.pathname.slice("/shorts/".length)
        : null;
    const id = (fromQuery ?? fromPath ?? "").split("/")[0];
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    const id = url.pathname.slice(1).split("/")[0];
    return id && /^\d{6,12}$/.test(id) ? { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (host === "www.loom.com" || host === "loom.com") {
    const segments = url.pathname.split("/").filter(Boolean);
    const id = segments[0] === "share" || segments[0] === "embed" ? segments[1] : null;
    return id && /^[A-Za-z0-9]{20,40}$/.test(id) ? { provider: "loom", embedUrl: `https://www.loom.com/embed/${id}` } : null;
  }
  return null;
}
