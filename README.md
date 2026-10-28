# Phrase

## Files

- `docs/PRODUCT_VISION.md` explains the product problem, vision, principles, target users, scope, and non-goals.
- `docs/ARCHITECTURE.md` defines the proposed technical boundaries, domain model, storage, rendering, publication, testing, and initial vertical slices.
- `docs/BACKLOG.md` lists the prioritized work items with relative sizes.
- `docs/SPIKE_FINDINGS.md` records what the DOCX round-trip and TOC spikes showed.

## Recommended next documents

Create ADRs only as implementation decisions become real. The first useful records are likely:

1. Editor framework selection.
2. Canonical model independent of the editor framework.
3. No direct formatting.
4. Typed stylesheet and dual compilation.
5. DOCX as publication output.
6. Local-first operation without a mandatory backend.
7. Stable IDs and structural cross-references.
8. Git-friendly native storage.
