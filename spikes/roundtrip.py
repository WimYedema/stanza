"""Backlog item 3 spike: DOCX -> Markdown + stylesheet + metadata, and Markdown -> DOCX. Throwaway tooling.

Usage: .venv/Scripts/python spikes/roundtrip.py <input.docx> <out-dir>
"""

import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pypandoc
from lxml import etree

HERE = Path(__file__).parent
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
MARKER_COLOR = "3F98BD"
PANDOC = pypandoc.get_pandoc_path()


def w(tag: str) -> str:
    return f"{{{W}}}{tag}"


def attr(el: etree._Element, name: str) -> str | None:
    return el.get(w(name))


def rewrite_zip(src: Path, dst: Path, replacements: dict[str, bytes]) -> None:
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            zout.writestr(item, replacements.get(item.filename, zin.read(item.filename)))


TAG_TEXT = re.compile(r"^\s*\[(proposed|confirm)[^\]]*\]\s*$")


def prepare(src: Path, dst: Path) -> int:
    """Promote every hand-made variant of the status tag look to one named character style."""
    with zipfile.ZipFile(src) as z:
        doc = etree.fromstring(z.read("word/document.xml"))
        styles = etree.fromstring(z.read("word/styles.xml"))
    promoted = 0
    for run in doc.iterfind(".//w:r", NS):
        rpr = run.find("w:rPr", NS)
        if rpr is None or not TAG_TEXT.match(text(run)):
            continue
        for child in list(rpr):
            rpr.remove(child)
        rstyle = etree.Element(w("rStyle"))
        rstyle.set(w("val"), "Marker")
        rpr.append(rstyle)
        promoted += 1
    styles.append(
        etree.fromstring(
            f'<w:style xmlns:w="{W}" w:type="character" w:customStyle="1" w:styleId="Marker">'
            '<w:name w:val="marker"/><w:basedOn w:val="DefaultParagraphFont"/>'
            f'<w:rPr><w:b/><w:color w:val="{MARKER_COLOR}"/><w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/></w:rPr>'
            "</w:style>"
        )
    )
    rewrite_zip(
        src,
        dst,
        {
            "word/document.xml": etree.tostring(doc, xml_declaration=True, encoding="UTF-8", standalone=True),
            "word/styles.xml": etree.tostring(styles, xml_declaration=True, encoding="UTF-8", standalone=True),
        },
    )
    return promoted


def pandoc(*args: str, env: dict[str, str] | None = None) -> None:
    subprocess.run([PANDOC, *args], check=True, env={**os.environ, **(env or {})})


def write_table_widths(src: Path, dst: Path) -> None:
    """Column proportions of content tables, in document order, for the Markdown conversion."""
    with zipfile.ZipFile(src) as z:
        doc = etree.fromstring(z.read("word/document.xml"))
    rows = []
    for tbl in doc.iterfind(".//w:tbl", NS):
        if tbl.xpath("ancestor::w:txbxContent", namespaces=NS) or not text(tbl).strip():
            continue
        rows.append(" ".join(attr(c, "w") for c in tbl.find("w:tblGrid", NS)))
    dst.write_text("\n".join(rows) + "\n", encoding="utf-8")


def text(el: etree._Element) -> str:
    return "".join(t.text or "" for t in el.iter(w("t")))


META_KEYS = {"author_s": "author", "publish_date": "date", "sign_off_by": "sign_off"}


def extract_metadata(src: Path) -> dict[str, object]:
    with zipfile.ZipFile(src) as z:
        doc = etree.fromstring(z.read("word/document.xml"))
    meta: dict[str, object] = {}
    for sdt in doc.iterfind(".//w:sdt", NS):
        alias = sdt.find("w:sdtPr/w:alias", NS)
        value = text(sdt.find("w:sdtContent", NS)).strip()
        if alias is not None and value:
            key = attr(alias, "val").lower().replace(" ", "_")
            meta.setdefault(META_KEYS.get(key, key), value)
    box = next(iter(doc.iterfind(".//w:txbxContent", NS)), None)
    if box is not None:
        lines = [text(p).strip() for p in box.iterfind(".//w:p", NS)]
        label = None
        for line in lines:
            if line.endswith(":"):
                raw = re.sub(r"\W+", "_", line.rstrip(":").lower()).strip("_")
                label = META_KEYS.get(raw, raw)
            elif line and label == "distribution_list":
                meta.setdefault(label, []).append(line)
            elif line and label:
                meta.setdefault(label, line)
    return meta


def yaml_scalar(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def front_matter(meta: dict[str, object]) -> str:
    lines = ["---"]
    for key in sorted(meta):
        value = meta[key]
        if isinstance(value, list):
            lines.append(f"{key}:")
            lines.extend(f"  - {yaml_scalar(v)}" for v in value)
        else:
            lines.append(f"{key}: {yaml_scalar(value)}")
    lines.append("---\n")
    return "\n".join(lines)


def props(el: etree._Element | None) -> dict[str, object]:
    """Map the Word properties of a style to readable ones; leftovers are reported as unmapped."""
    out: dict[str, object] = {}
    unmapped: list[str] = []
    if el is None:
        return out
    for child in el:
        name = etree.QName(child).localname
        val = attr(child, "val")
        if name == "rFonts":
            out["font"] = attr(child, "ascii") or attr(child, "asciiTheme")
        elif name == "sz":
            out["size_pt"] = int(val) / 2
        elif name in ("b", "i", "caps", "smallCaps", "keepNext", "keepLines", "pageBreakBefore"):
            out[name] = val not in ("0", "false")
        elif name == "color":
            out["color"] = val if val != "auto" else attr(child, "themeColor") or "auto"
        elif name == "spacing" and attr(child, "before") is not None or name == "spacing" and attr(child, "after") is not None:
            for key in ("before", "after"):
                if attr(child, key) is not None:
                    out[f"space_{key}_pt"] = int(attr(child, key)) / 20
            if attr(child, "line") is not None:
                out["line"] = f"{attr(child, 'line')}/{attr(child, 'lineRule')}"
        elif name == "ind":
            for key in ("left", "right", "firstLine", "hanging"):
                if attr(child, key) is not None:
                    out[f"indent_{key}_pt"] = int(attr(child, key)) / 20
        elif name == "jc":
            out["align"] = val
        elif name == "numPr":
            out["numbering"] = {etree.QName(c).localname: attr(c, "val") for c in child}
        elif name == "shd":
            out["shading"] = attr(child, "fill")
        elif name == "pBdr":
            out["paragraph_border"] = [etree.QName(c).localname for c in child]
        elif name in ("outlineLvl", "tabs", "contextualSpacing", "widowControl", "kern", "ligatures"):
            unmapped.append(name)
        elif name not in ("lang", "noProof", "rPr", "pPr"):
            unmapped.append(name)
        if name == "rPr":
            out.update(props(child))
        if name == "pPr":
            out.update(props(child))
    if unmapped:
        out["unmapped"] = sorted(set(unmapped))
    return out


def extract_stylesheet(src: Path) -> dict[str, object]:
    with zipfile.ZipFile(src) as z:
        doc = etree.fromstring(z.read("word/document.xml"))
        styles = etree.fromstring(z.read("word/styles.xml"))
    by_id = {attr(s, "styleId"): s for s in styles.iterfind("w:style", NS)}
    used = {"Normal"}
    for tag in ("pStyle", "rStyle", "tblStyle"):
        used |= {attr(e, "val") for e in doc.iter(w(tag))}
    for sid in list(used):
        cur = by_id.get(sid)
        while cur is not None and cur.find("w:basedOn", NS) is not None:
            parent = attr(cur.find("w:basedOn", NS), "val")
            used.add(parent)
            cur = by_id.get(parent)
    out: dict[str, object] = {}
    for sid in sorted(used):
        s = by_id.get(sid)
        if s is None:
            continue
        based = s.find("w:basedOn", NS)
        entry: dict[str, object] = {
            "name": attr(s.find("w:name", NS), "val"),
            "type": attr(s, "type"),
            "based_on": attr(based, "val") if based is not None else None,
            "next": attr(s.find("w:next", NS), "val") if s.find("w:next", NS) is not None else None,
        }
        entry.update(props(s.find("w:pPr", NS)))
        entry.update(props(s.find("w:rPr", NS)))
        out[sid] = entry
    defaults = styles.find("w:docDefaults/w:rPrDefault/w:rPr", NS)
    return {"document_defaults": props(defaults), "styles": out}


def main(src: Path, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    stem = "document"
    prepared = out / f"{stem}.prepared.docx"
    promoted = prepare(src, prepared)
    print(f"marker runs promoted to a character style: {promoted}")

    md_path = out / f"{stem}.md"
    body = out / f"{stem}.body.md"
    media = out / "media"
    if media.exists():
        shutil.rmtree(media)
    widths = out / f"{stem}.tablewidths.txt"
    write_table_widths(src, widths)
    pandoc(
        str(prepared), "--from", "docx+styles", "--track-changes=accept",
        "--lua-filter", str(HERE / "clean.lua"),
        "--to", "markdown-smart-simple_tables-multiline_tables", "--wrap=none", "--columns=200",
        "--extract-media", str(media), "-o", str(body),
        env={"PHRASE_TABLE_WIDTHS": str(widths)},
    )
    meta = extract_metadata(src)
    md_path.write_text(front_matter(meta) + body.read_text(encoding="utf-8"), encoding="utf-8")
    body.unlink()
    (out / f"{stem}.styles.json").write_text(
        json.dumps(extract_stylesheet(prepared), indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"metadata: {sorted(meta)}")

    pandoc(
        str(md_path), "--from", "markdown-smart", "--to", "docx",
        "--lua-filter", str(HERE / "render.lua"),
        "--reference-doc", str(prepared), "-o", str(out / f"{stem}.rebuilt.docx"),
    )
    print(f"written to {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
