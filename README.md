# Phrase

## Files

- `docs/PRODUCT_VISION.md` explains the product problem, vision, principles, target users, scope, and non-goals.
- `docs/ARCHITECTURE.md` defines the proposed technical boundaries, domain model, storage, rendering, publication, testing, and initial vertical slices.
- `docs/BACKLOG.md` lists the prioritized work items with relative sizes.
- `docs/SPIKE_FINDINGS.md` records what the DOCX round-trip and TOC spikes showed.

## Development

Requires Node 22 or later.

```text
npm install
npm run check    build, typecheck tests, test, lint, format check
npm test         tests only
```

Packages live in `packages/`. Architecture decisions are recorded in `docs/adr/`.
