import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

// The card a link to this site unfurls into, generated rather than drawn by hand so
// it cannot fall out of date with the copy on the page.
//
// It is an SVG rasterised by rsvg-convert. A browser would have rendered it in the
// product's own faces, but the only copies of Newsreader and Geist in this repo are
// woff2, which no rasteriser here reads, and there is no woff2 converter installed.
// Charter is the closest transitional serif macOS ships and is what the card uses;
// the site's own CSS already names Georgia as the fallback for the same face, so this
// is the documented substitution rather than a new decision. Regenerate with
// `node scripts/build-og-image.mjs` if the wording changes.
const OUT = 'static/og.png';

// The dark scheme's own tokens, converted from the oklch values in layout.css.
const BG = '#1c1916';
const CARD = '#24211d';
const FG = '#e6e5de';
const ACCENT = '#8bb79d';
const MUTED = '#a7a59c';

const SERIF = 'Charter, Georgia, Times New Roman, serif';
const SANS = 'Helvetica Neue, Helvetica, Arial, sans-serif';
const MONO = 'Menlo, SFMono-Regular, Consolas, monospace';

// One margin, one baseline grid, and nothing drawn that does not mean something.
//
// The first attempt put four empty rounded squares in a row and called it the
// diagram. Empty boxes say nothing at thumbnail size, their positions were picked by
// hand and sat symmetrically on neither the card nor each other, and the dashed rule
// ran straight under its own label. This version keeps the type on a single left
// margin, states the pipeline as words, and opens the rule for the label rather than
// crossing it.
const M = 80; // the one left margin, and the one right inset
const R = 1200 - M; // 1120
const GAP = 26; // the rule's opening around its label, both sides

// 1200×630 is the size every platform crops from.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${BG}"/>

  <text x="${M}" y="118" font-family="${SERIF}" font-size="40" fill="${FG}">
    <tspan fill="${ACCENT}">[</tspan>Regeste
  </text>
  <text x="${M}" y="228" font-family="${SERIF}" font-size="62" fill="${FG}">Your documents have the answer.</text>
  <text x="${M}" y="282" font-family="${SANS}" font-size="24" fill="${MUTED}">Ask a question, get an answer that cites the exact passages.</text>

  <!-- The room, and the line nothing crosses: the one idea that survives being
       shrunk to a thumbnail. The steps are words because a reader can read words at
       this size, and the header rule runs the full width of the box exactly as the
       component's own does, with its label inset. -->
  <rect x="${M}" y="344" width="${R - M}" height="128" rx="16" fill="${CARD}" stroke="#3a352f"/>
  <text x="${M + 32}" y="382" font-family="${MONO}" font-size="14" letter-spacing="2.5" fill="${MUTED}">THIS BROWSER</text>
  <line x1="${M}" y1="400" x2="${R}" y2="400" stroke="#3a352f"/>
  <text x="${M + 32}" y="442" xml:space="preserve" font-family="${MONO}" font-size="19" fill="${MUTED}" letter-spacing="0.4">Your document<tspan fill="#5a534a">   →   </tspan>Reading<tspan fill="#5a534a">   →   </tspan>Local index<tspan fill="#5a534a">   →   </tspan><tspan fill="${ACCENT}">Answer + citations</tspan></text>

  <line x1="${M}" y1="530" x2="${600 - 108 - GAP}" y2="530" stroke="#4a443c" stroke-dasharray="6 8"/>
  <text x="600" y="536" font-family="${MONO}" font-size="14" letter-spacing="3" fill="${MUTED}" text-anchor="middle">NOTHING CROSSES</text>
  <line x1="${600 + 108 + GAP}" y1="530" x2="${R}" y2="530" stroke="#4a443c" stroke-dasharray="6 8"/>

  <text x="${M}" y="594" font-family="${MONO}" font-size="15" letter-spacing="1.5" fill="${MUTED}">Free · No account to start · open source</text>
</svg>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync('/tmp/og.svg', svg);
execFileSync('rsvg-convert', ['-w', '1200', '-h', '630', '-o', OUT, '/tmp/og.svg']);
console.log(`  ${OUT}: ${(statSync(OUT).size / 1024).toFixed(1)} KB`);
