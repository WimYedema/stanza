---
stanza-format: 1
title: "ADR 0087: Sensitivity labels"
---

<!-- stanza: #h6bkyq61x7 -->
# ADR 0087: Sensitivity labels

Status: Proposed. Backlog items 215 and 216. Builds on ADR 0007 (the project file and `classification`), ADR 0017 (header and footer tokens), ADR 0079 (edits of project files) and ADR 0084 (the stamp and the review commands). To be confirmed against a file labelled by Word in the work tenant before it is accepted.

<!-- stanza: #eyk5qp15at -->
## Context

A work tenant with Microsoft Purview can require a sensitivity label on every Office file, and can keep unlabelled files from being shared. A DOCX that Stanza exports has no label. When a reviewer saves it, Word asks for one and writes it into the file; when the file goes to SharePoint, a policy may stop it. So in such a tenant the review loop (items 138 to 141) needs the label in the exported file.

A label is metadata in the file, written by Office (MS-OFFCRYPTO 2.6, MS-OI29500 3.4.1.5, and the metadata page of the MIP SDK):

- **Custom file properties** `MSIP_Label_<label ID>_<name>`: `Enabled` (`true`), `SiteId` (the tenant ID), `ActionId` (a GUID that changes each time the label is set), and optionally `Method` (`Standard` or `Privileged`), `SetDate` (ISO 8601), `Name` (the name of the label in the tenant) and `ContentBits` (what the label applied: 1 header, 2 footer, 4 watermark, 8 encryption).
- **The part `docMetadata/LabelInfo.xml`**, linked from the package relationships with the type `http://schemas.microsoft.com/office/2020/02/relationships/classificationlabels`: a `labelList` in the namespace `http://schemas.microsoft.com/office/2020/mipLabelMetadata` with a `label` element per tenant (`id`, `enabled`, `method`, `siteId`, optional `contentBits`, `removed`). It has no name and no date. Office writes it when the tenant has co-authoring for labelled files on, and then reads it before the properties: a tenant with a `label` element in the part takes it from there, and only a tenant without one from the properties (MS-OFFCRYPTO 2.6.3).
- **A label with encryption** turns the file into an encrypted compound file (an `EncryptedPackage` in an OLE container, not a ZIP), with the label outside the encrypted package. Applying it needs the tenant's keys, through Office or the MIP SDK.

The label ID and the tenant ID are GUIDs that the author does not know and usually cannot look up: they are in the Purview portal, which authors seldom can open. Every file labelled by Word in the tenant has them.

The document model already has `classification` (ADR 0004), with a project default (ADR 0007), shown by the `classification` token in headers, footers and on the cover (ADR 0017, ADR 0019). It is the author's statement of how sensitive the document is, which is what the label records for Office.

<!-- stanza: #pm16vhm1gr -->
## Decision

<!-- stanza: #t3xdqsmqw0 -->
### Where the label comes from

- **A label is learned from a file, not typed.** `stanza label record <file.docx> [project]`, and the VS Code command **Stanza: Record Sensitivity Label**, read the label of a DOCX that Word labelled in the tenant and record it in the project file. A reviewed file is such a file, and so is any document of the tenant.

- **For a classification.** The label is recorded for the effective `classification` of the document named by the stamp of the file (ADR 0084), or for `--classification <value>`. A file without a stamp, or a document without a classification, needs the flag; without it nothing is written and the command says why.

- **In the project file,** as an edit that keeps the rest of its text, and from VS Code as an undoable edit of its buffer (ADR 0079):

  ```yaml
  sensitivity-labels:
    tenant: 9a2c1f0e-4b7d-4c3a-8e21-5f6b7c8d9e0a
    labels:
      Confidential:
        id: 1b3d5f7a-2c4e-4a6b-8d0f-1a2b3c4d5e6f
        name: Confidential
      Internal:
        id: 7e9f0a1b-3c5d-4e7f-9a1b-2c3d4e5f6a7b
        name: General
  ```

  Keyed by the value of `classification`, which is what the author writes, so a document needs nothing new. `name` is the name in the tenant, kept for reading the project file and for the `Name` property; it is optional, since a file with only the part has none.

- **One tenant per project.** A file of another tenant than the recorded one is refused, as is a label different from the one recorded for that classification, unless `--replace` is given. Recording the same label again changes nothing.

- **Checks:** a tenant or label ID that is not a GUID is an error (`invalid-sensitivity-label`); once any label is recorded, a document whose effective classification has no label is a warning (`unlabelled-classification`), since its file will go out unlabelled.

<!-- stanza: #qw5d2r5az2 -->
### Reading a label

- `readSensitivityLabel` in `import-docx` is a pure function of the bytes of a DOCX. It reads the part first and the properties for a tenant that the part has no `label` element for, as Office does. A `label` with `removed="1"` means no label for that tenant.
- **An encrypted file** is recognised by the signature of a compound file. It is reported as protected by its label, which Stanza cannot write; nothing else is read from it.
- `review inspect` and `review pull` say which label the file has and how it compares with the project: the label recorded for the document's classification, a different label (Word or a reviewer changed it), no label recorded yet (with the command that records it), or no label in the file. This goes to the output of the command and not into the review document, which is about the comments.

<!-- stanza: #ytr0qrc4eb -->
### Writing a label

- **Every export** of a document whose effective classification has a recorded label carries it: `stanza build`, export on save and Open in Word, as for the protection of ADR 0085.
- **In both places,** so that the file reads the same whether the tenant has co-authoring for labelled files on or not:
  - the properties `MSIP_Label_<id>_Enabled` = `true`, `_SetDate`, `_Method` = `Standard`, `_Name` when it is known, `_SiteId`, `_ActionId` and `_ContentBits` = `0`, beside the properties of the stamp;
  - the part `docMetadata/LabelInfo.xml` with one `label`: `enabled="1"`, `method="Standard"`, `removed="0"`, `contentBits="0"`, its relationship in `_rels/.rels` and its content type.
- **Deterministic,** like the rest of the output: `SetDate` is the build date (`--date`, by default 1980-01-01), and `ActionId` is a GUID made from the label ID and the content hash of the stamp, so it changes when the content does and not otherwise.
- **`ContentBits` is 0.** The label did not apply a header, footer or watermark; the visible marking is Stanza's own, from the `classification` token in the stylesheet's headers and footers. A project whose tenant prescribes a marking puts that token where the marking belongs.
- **Labels with encryption are not written.** They need the tenant's keys, which belong in Office and the MIP SDK, not in a build. A project needing one applies it in Word after the build.

<!-- stanza: #q9r9rh8bah -->
### To confirm in the work tenant

Before this ADR is accepted, a file labelled by Word in the work tenant settles the details that the specifications leave open: the form of `id` in the part (with or without braces, case), the content type of the part, and whether Word writes the part, the properties or both. After the build, the same tenant shows whether Word desktop, Word for the web and SharePoint take the label as set without asking for one, whether Word adds the label's markings itself when `ContentBits` is 0, and that `review pull` still reads the file after Word saved it. These checks are the part of item 203 that is still open for a work tenant.

<!-- stanza: #mfks9y7xd2 -->
## Consequences

- In a tenant that requires labels, an exported document arrives labelled, reviewers are not asked to choose a label, and SharePoint can take it.
- The author records a label once per classification, from a file of the tenant, and never sees a GUID otherwise. The project file holds the tenant ID and label IDs, which name the organisation but are not secret.
- `classification` gains a second use besides the token: it chooses the label. A project that changes the value of a classification has to record the label for the new value.
- The label is the author's claim, written as Office would write it for a label set by hand (`Standard`). Purview may still relabel a file by its own rules; Stanza does not try to prevent that.
- Labels with encryption stay manual.
- Tests: reading the part, the properties and both, with the precedence and `removed`; an encrypted file; recording against a stamped and an unstamped file, with and without a classification, another tenant and another label; the warning and the error; the written properties and part, the same for the same input; the review commands reporting each case. Fixtures use made-up GUIDs; the files of the work tenant stay out of the repository.

<!-- stanza: #a11e7dzvhp -->
## Alternatives considered

- **Typing the label ID into the project file.** It is what the backlog item first said, but the author cannot find the ID, and a typing error gives a file that Office treats as labelled with an unknown label.
- **Copying the label from the reviewed file at every build.** It ties a build to a file that may be old, from another document, or relabelled by a reviewer; the project file is where a build gets its settings.
- **Only the custom properties.** Older Office reads them, but a tenant with co-authoring for labelled files reads the part first, and a part written later by Word wins over them.
- **A label per document instead of per classification.** The classification is already the statement of sensitivity, with a project default; a second, separate field could disagree with it.
- **Applying labels with the MIP SDK.** It supports encryption, but needs an app registration in the tenant, sign-in and the network, which a local, offline build (product vision, principle 8) does not have.
