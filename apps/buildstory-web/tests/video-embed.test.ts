import assert from "node:assert/strict";
import test from "node:test";
import { resolveVideoEmbed } from "../lib/media/video-embed";

test("resolveVideoEmbed builds a canonical embed URL for known providers, never the raw input", () => {
  assert.deepEqual(resolveVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s"), {
    provider: "youtube",
    embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  });
  assert.deepEqual(resolveVideoEmbed("https://youtu.be/dQw4w9WgXcQ"), {
    provider: "youtube",
    embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  });
  assert.deepEqual(resolveVideoEmbed("https://vimeo.com/123456789"), {
    provider: "vimeo",
    embedUrl: "https://player.vimeo.com/video/123456789",
  });
  assert.deepEqual(resolveVideoEmbed("https://www.loom.com/share/abcdefabcdefabcdefabcdefabcdef12"), {
    provider: "loom",
    embedUrl: "https://www.loom.com/embed/abcdefabcdefabcdefabcdefabcdef12",
  });
});

test("resolveVideoEmbed refuses unknown hosts, non-https, and malformed IDs rather than embedding anything unvetted", () => {
  assert.equal(resolveVideoEmbed(null), null);
  assert.equal(resolveVideoEmbed(""), null);
  assert.equal(resolveVideoEmbed("http://www.youtube.com/watch?v=dQw4w9WgXcQ"), null, "non-https is refused");
  assert.equal(resolveVideoEmbed("https://evil.example.com/watch?v=dQw4w9WgXcQ"), null, "an unknown host is never embedded");
  assert.equal(resolveVideoEmbed("https://www.youtube.com/watch?v=<script>"), null, "a malformed id is refused");
  assert.equal(resolveVideoEmbed("javascript:alert(1)"), null);
  assert.equal(resolveVideoEmbed("not a url"), null);
});
