---
stanza-format: 1
title: "Caching the Build Index"
date: "2026-11-25"
document-number: "TN-042"
reviewers:
  - "Storage Team"
  - "Build Team"
status: "Draft"
subtitle: "Design and measurements"
---

<!-- stanza: #tm4cg3402b -->
# Summary

This example shows a cover grid: the logo sits beside the document number and date at the top, the title runs across both columns low on the page, and the table of authors sits beside the status and classification at the bottom. The areas in the stylesheet are a small picture of the page.

```stanza-toc
depth: 2
```

<!-- stanza: #3wqkf1w6pv -->
# Design

The index is rebuilt only for the documents that changed since the last build.

<!-- stanza: #r8e2ppv104 -->
## Measurements

<!-- stanza: #a468bze14f -->
| Project | Before | After |
| --- | --- | --- |
| Small | 1.2 s | 0.3 s |
| Large | 14 s | 2.1 s |
