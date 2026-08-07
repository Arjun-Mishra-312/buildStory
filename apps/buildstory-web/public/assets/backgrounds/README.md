# Buildstory selectable backgrounds

These sixteen WebP assets were generated with the built-in image generation
tool and normalized for production use.

- `story/`: three 1024×1024 options, each with light and dark artwork.
- `share/`: five 1080×1350 options, each with light and dark artwork.

Every pair preserves its composition across themes and changes only its color
system. Dark assets use midnight/charcoal with paper, coral, and cobalt accents.
Light assets use warm paper with ink, coral, and cobalt accents.

Story prompts reserve the top-left for a status badge, the center-left for the
receipt kicker/title/rule/subtitle, and the bottom-left for stack metadata.
Share prompts reserve the left side for the header, project title, tagline,
archetype, stats, model mix, URL, and closing tagline. Decorative detail stays
on the right and extreme lower edge.

The typed option registry lives in `lib/background-options.ts`.
