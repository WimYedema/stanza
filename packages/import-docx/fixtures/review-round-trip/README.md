# Review round trip fixtures

Real DOCX files from the review round trip spike (backlog item 203), for the tests of `stanza reviews pull` (item 140). The findings are in `docs/documents/spike-findings.stanza.md`, section "Review round trip in Word".

`0002-host-and-dependencies.stanza.md` is the source the files were built from (commit `b342ac2`, before the source changed again). The DOCX files were then commented by hand:

| File | Made in | Contents |
| --- | --- | --- |
| `desktop-protected.docx` | Word desktop, with the protection for comments | Comments on the title, across sections, on a list item and on a table cell |
| `web-unprotected.docx` | Word for the web on SharePoint, without the protection | The same kinds of comments, plus a mention |
| `desktop-replies-resolved-reaction.docx` | Word desktop, opened from the synced OneDrive folder on `web-unprotected.docx` | A reply, a resolved comment and a thumbs-up reaction |
| `web-replies-resolved-reaction.docx` | Word for the web, on the same file, read from the synced folder | One more reply, resolved comment and reaction (on a reply); in the same form as a save by Word desktop |
| `stamped-desktop-then-web.docx` | Built at commit `5f7f366` with a trial revision stamp (the properties and source part of ADR 0084, added by hand before item 138), without the protection; commented in Word desktop, then in Word for the web from OneDrive | A comment from each; the embedded source has the `\r\n` line endings Word desktop writes, and is the same text as `0002-host-and-dependencies.stanza.md` |

The files are as Word saved them, except that the reviewer's name, initials, email address and account ID were replaced by `Ada Reviewer`, `AR`, `ada.reviewer@example.com` and `0000000000000000`. Do not replace them with files that hold real personal data.
