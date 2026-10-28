"""Backlog item 4 spike: four table-of-contents variants to open in Word. Throwaway tooling.

Usage: .venv/Scripts/python spikes/toc_variants.py <out-dir>   (after roundtrip.py has written the Markdown)
"""

import copy
import sys
import zipfile
from pathlib import Path

from lxml import etree

from roundtrip import HERE, NS, PANDOC, W, attr, pandoc, rewrite_zip, text, w

TEXT_WIDTH = 8895  # twips between the margins of the example document
LEVELS = {"Heading1": "TOC1", "Heading2": "TOC2"}


def load(path: Path) -> etree._Element:
    with zipfile.ZipFile(path) as z:
        return etree.fromstring(z.read("word/document.xml"))


def save(src: Path, dst: Path, doc: etree._Element) -> None:
    xml = etree.tostring(doc, xml_declaration=True, encoding="UTF-8", standalone=True)
    rewrite_zip(src, dst, {"word/document.xml": xml})


def style_of(p: etree._Element) -> str | None:
    style = p.find("w:pPr/w:pStyle", NS)
    return attr(style, "val") if style is not None else None


def headings(doc: etree._Element) -> list[etree._Element]:
    return [p for p in doc.iterfind(".//w:body/w:p", NS) if style_of(p) in LEVELS]


def add_bookmarks(paragraphs: list[etree._Element]) -> list[str]:
    names = []
    for i, p in enumerate(paragraphs):
        name = f"_Toc{100000 + i}"
        start = etree.Element(w("bookmarkStart"))
        start.set(w("id"), str(900 + i))
        start.set(w("name"), name)
        end = etree.Element(w("bookmarkEnd"))
        end.set(w("id"), str(900 + i))
        ppr = p.find("w:pPr", NS)
        p.insert(0 if ppr is None else 1, start)
        p.append(end)
        names.append(name)
    return names


def run(*children: etree._Element) -> etree._Element:
    r = etree.Element(w("r"))
    r.extend(children)
    return r


def fld(kind: str, dirty: bool = False) -> etree._Element:
    el = etree.Element(w("fldChar"))
    el.set(w("fldCharType"), kind)
    if dirty:
        el.set(w("dirty"), "true")
    return el


def instr(code: str) -> etree._Element:
    el = etree.Element(w("instrText"))
    el.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    el.text = code
    return el


def t(value: str) -> etree._Element:
    el = etree.Element(w("t"))
    el.text = value
    return el


def entry(style: str, anchor: str, label: str, page_field: bool) -> etree._Element:
    p = etree.Element(w("p"))
    ppr = etree.SubElement(p, w("pPr"))
    etree.SubElement(ppr, w("pStyle")).set(w("val"), style)
    if page_field:
        tabs = etree.SubElement(ppr, w("tabs"))
        tab = etree.SubElement(tabs, w("tab"))
        tab.set(w("val"), "right")
        tab.set(w("leader"), "dot")
        tab.set(w("pos"), str(TEXT_WIDTH))
    link = etree.SubElement(p, w("hyperlink"))
    link.set(w("anchor"), anchor)
    link.set(w("history"), "1")
    link.append(run(t(label)))
    if page_field:
        link.append(run(etree.Element(w("tab"))))
        link.append(run(fld("begin", dirty=True)))
        link.append(run(instr(f" PAGEREF {anchor} \\h ")))
        link.append(run(fld("separate")))
        link.append(run(t("–")))
        link.append(run(fld("end")))
    return p


def title() -> etree._Element:
    p = etree.Element(w("p"))
    etree.SubElement(etree.SubElement(p, w("pPr")), w("pStyle")).set(w("val"), "TOCHeading")
    p.append(run(t("Contents")))
    return p


def insert_before_first_heading(doc: etree._Element, blocks: list[etree._Element]) -> None:
    first = headings(doc)[0]
    for block in blocks:
        first.addprevious(block)


def static_toc(plain: Path, dst: Path, page_field: bool) -> None:
    doc = load(plain)
    hs = headings(doc)
    names = add_bookmarks(hs)
    blocks = [title()] + [
        entry(LEVELS[style_of(h)], name, text(h).strip(), page_field) for h, name in zip(hs, names)
    ]
    insert_before_first_heading(doc, blocks)
    save(plain, dst, doc)


def field_toc(plain: Path, source: Path, dst: Path, dirty: bool) -> None:
    """Pandoc's own TOC field, moved to the same position as in the other variants."""
    doc = load(plain)
    generated = load(source)
    sdt = generated.find(".//w:body/w:sdt", NS)
    for flag in sdt.iter(w("fldChar")):
        if not dirty and w("dirty") in flag.attrib:
            del flag.attrib[w("dirty")]
    headings(doc)[0].addprevious(copy.deepcopy(sdt))
    save(plain, dst, doc)


def main(out: Path) -> None:
    stem = "document"
    prepared = out / f"{stem}.prepared.docx"
    plain = out / f"{stem}.rebuilt.docx"
    with_toc = out / f"{stem}.pandoc-toc.docx"
    pandoc(
        str(out / f"{stem}.md"), "--from", "markdown-smart", "--to", "docx", "--toc", "--toc-depth=2",
        "--lua-filter", str(HERE / "render.lua"), "--reference-doc", str(prepared), "-o", str(with_toc),
    )
    target = out / "toc"
    target.mkdir(exist_ok=True)
    field_toc(plain, with_toc, target / "toc-a-field-dirty.docx", dirty=True)
    field_toc(plain, with_toc, target / "toc-b-field-not-updated.docx", dirty=False)
    static_toc(plain, target / "toc-c-static-links.docx", page_field=False)
    static_toc(plain, target / "toc-d-static-links-page-fields.docx", page_field=True)
    with_toc.unlink()
    print(f"written to {target}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
