#!/usr/bin/env bash
# Generates the two remaining bug sprites with Nano Banana, then rebuilds src/sprites.ts.
set -u
cd "$(dirname "$0")/.."
GI=~/.local/bin/gemini-image; REF=$PWD/art/gpt/hamster-c.png
B="Pixel art game sprite in exactly the same style as the reference hamster image (same chunky square pixels, same dark outline approach, same warm saturated palette feel). Single object centered on a flat pure black background (#000000). No text, no ground shadow, crisp hard-edged square pixels, no anti-aliasing, no gradients, max 6 colors, must read clearly at tiny size, square 1:1."
$GI -o "$PWD/art/gpt/bug-mite.png" -r "$REF" -a 1:1 "$B Draw it on a 12x12 pixel grid upscaled with nearest-neighbor. Subject: a small round rust-orange mite bug seen from the front, six tiny legs, two big white eyes, mischievous." > art/gpt/bug-mite.log 2>&1
$GI -o "$PWD/art/gpt/bug-beetle.png" -r "$REF" -a 1:1 "$B Draw it on a 12x12 pixel grid upscaled with nearest-neighbor. Subject: a sturdy armored olive-green beetle seen from the front, thick shell plates, short legs, two white eyes, tough look." > art/gpt/bug-beetle.log 2>&1
for n in bug-mite bug-beetle; do
  [ -s art/gpt/$n.png ] && python3 scripts/dotify.py art/gpt/$n.png art/dots/$n.json --max 60 --colors 6 --target 12
done
python3 scripts/build-sprites.py
