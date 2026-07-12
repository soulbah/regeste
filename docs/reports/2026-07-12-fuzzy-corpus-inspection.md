# Fuzzy corpus inspection — 2026-07-12

All binaries are development-only, gitignored and hash-pinned in
`benchmarks/fuzzy-corpus-manifest.json`. A 50 MiB per-file cap and HTTPS allowlist are enforced by the
fetch script. A second fetch verified every existing file without downloading again.

## Visual/text inspection

| File                    |   Pages / size | Extractable text    | Deliberate traps                                                             | Result   |
| ----------------------- | -------------: | ------------------- | ---------------------------------------------------------------------------- | -------- |
| Apollo 11 flight plan   | 340 / 10.96 MB | 286 text, 54 sparse | scanned diagrams, landscape and 90°/270° rotations, timelines, abbreviations | accepted |
| Apollo planning report  |   50 / 2.63 MB | 48 text, 2 sparse   | historical OCR errors, figures, split words, dense timelines                 | accepted |
| Federal Register notice |    3 / 0.22 MB | 3 pages             | two/three columns, running headers, legal dates                              | accepted |
| CFR §178.516            |    1 / 0.18 MB | 1 page              | exact near-identifiers, units, dense columns                                 | accepted |
| RFC 9110 PDF            |  194 / 2.86 MB | 194 pages           | long hierarchy, ABNF, tables, repeated headers                               | accepted |
| RFC 9110 TXT            |  n/a / 0.50 MB | native text         | same truth in another supported format                                       | accepted |
| SEC 10-K HTML source    |  n/a / 2.45 MB | native HTML         | iXBRL, repeated boilerplate, large tables; conversion input only             | accepted |

Rendered contact sheets were inspected at original detail. No personal/private source was included.
Known extraction defects are intentional benchmark inputs, not silently repaired ground truth.
