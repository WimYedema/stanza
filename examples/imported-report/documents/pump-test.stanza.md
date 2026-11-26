---
stanza-format: 1
title: "Pump test at the north site"
authors:
  - "A. Example"
  - "B. Sample"
date: "2026-11-26"
document-number: "TR-2026-031"
page-template: "report"
---

<!-- stanza: #2fw74pp0dy -->
# Summary

The cover of this report and the header and footer of its pages were not written by hand: `stanza import cover` read them from a Word template, `template/report-template.docx`, and wrote them into the stylesheet as the page template `report`. Open the template in Word beside the built document to compare them.

On the cover, the logo and the address sit in columns as they did in a table without borders in the template, the rule under them comes from a paragraph border, the class line stands where its frame put it, and the placeholders in square brackets became the title, the authors and two fields. On the pages after it, the header has the logo, the title and the date where the positional tabs of the template put them, and the footer counts the pages with the page fields of the template.

<!-- stanza: #szb3w6t9zb -->
# Results

<!-- stanza: #5gamjsqgz3 -->
| Run | Flow (l/s) | Head (m) |
| --- | --- | --- |
| 1 | 12.0 | 31.5 |
| 2 | 14.5 | 28.0 |
| 3 | 16.0 | 24.5 |

<!-- stanza: #jwcjya8x4n -->
# Where it differs from the template

The import reports what it approximated and what it left out, and a few things look different:

- The revision in the header of the template counts the saves of the Word file. It became the version token, which has no value until a build gives one, so the header shows only "rev.".
- The class line on the cover stands at the left in the template, because its frame is as wide as its text. The import keeps only the height of a frame, so the line follows the centring of its style.
- The table on the cover has two columns of the same width, as every cover table has; in the template the labels have a narrow column.
- The pages after the cover count from 1, and the footer counts them without the cover.
- The template asks for the font Example Sans, which does not exist, so Word shows another font, in the template as well.
