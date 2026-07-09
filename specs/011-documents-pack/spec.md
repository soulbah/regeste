# Spec 011 — Documents pack (D1/D2/D4, F2, version replace, # picker)

## Why

FEATURES D1 (document sheet), D2 (language detection), D4 (re-index), F2 (library sort/filter), MVP core "remplacement atomique de version" (PRD §5) and the `#` inline picker, plus the "Ajouté à Mes documents" toast. Rounds out document management.

## What

- D2: WHEN a document is ingested THEN its language SHALL be detected (FR/EN heuristic, no network) and shown as a badge; unknown language shows nothing.
- D1: clicking a library row SHALL open a document sheet: pages, size, short hash, language, indexed date, embedding model, chats using it, egress history for this document, and actions (open, re-index, replace, delete).
- D4: "Re-index" SHALL rebuild chunks+embeddings from the OPFS original, with the usual phase states; existing citations keep working as snapshots.
- Replace: "Replace file…" SHALL ingest the new version fully (parse → chunk → embed) BEFORE swapping: on success the document's content/hash/pages update atomically and the old version is recorded in `document_versions`; on failure the old version stays active untouched. Old citations degrade to snapshots (already handled by the viewer).
- F2: the library SHALL offer sort (recent, name, size) and type filter (all/PDF/DOCX/MD/TXT).
- `#` picker: typing `#` in the composer SHALL suggest library documents matching the text after `#`; picking one attaches it to the chat and removes the token.
- Toast: uploading in a chat SHALL toast "Added to My documents" for newly created documents.
- The app SHALL CONTINUE TO pass `bun run verify`; everything is local.

## Out of scope

- Tags (V1.1), OCR, per-version diffing, multi-version history UI beyond the audit rows.

## Open questions

(none)

## Verification

1. Ingest an FR doc and an EN doc → FR/EN badges in library + sheet.
2. Library row → sheet shows facts, chats, egress; sort by name/size and type filter work.
3. Re-index completes with phases; a question still retrieves.
4. Replace with a valid file → content swaps (new question hits new text), old citation opens as snapshot; replace with a corrupt file → old content still answers.
5. `#gui` in the composer suggests guide.md; picking attaches + clears token; toast on new upload in chat.
6. `bun run verify` exits 0.
