"""Backlog item 2 spike: measure styles and direct formatting in a DOCX. Throwaway tooling."""

import sys
import zipfile
from collections import Counter
from xml.etree import ElementTree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NOISE = {"lang", "noProof", "webHidden", "rStyle", "pStyle", "rPr", "sectPr", "numPr", "pPrChange", "rPrChange"}


def q(tag: str) -> str:
    return f"{{{W}}}{tag}"


def local(el: ET.Element) -> str:
    return el.tag.rsplit("}", 1)[-1]


def val(el: ET.Element | None) -> str | None:
    return None if el is None else el.get(q("val"))


def load_style_names(zf: zipfile.ZipFile) -> dict[str, tuple[str, str, bool]]:
    root = ET.fromstring(zf.read("word/styles.xml"))
    out = {}
    for s in root.iter(q("style")):
        name = val(s.find(q("name"))) or ""
        out[s.get(q("styleId"))] = (name, s.get(q("type")) or "", s.get(q("customStyle")) == "1")
    return out


def direct_props(props: ET.Element | None, ignore: set[str]) -> list[str]:
    if props is None:
        return []
    out = []
    for child in props:
        name = local(child)
        if name in ignore:
            continue
        attrs = ",".join(f"{local_attr(k)}={v}" for k, v in sorted(child.attrib.items()) if "rsid" not in k)
        out.append(f"{name}({attrs})" if attrs else name)
    return out


def local_attr(key: str) -> str:
    return key.rsplit("}", 1)[-1]


def main(path: str) -> None:
    zf = zipfile.ZipFile(path)
    styles = load_style_names(zf)
    root = ET.fromstring(zf.read("word/document.xml"))
    body = root.find(q("body"))

    para_styles: Counter[str] = Counter()
    run_styles: Counter[str] = Counter()
    table_styles: Counter[str] = Counter()
    para_direct: Counter[str] = Counter()
    run_direct: Counter[str] = Counter()
    paras = runs = paras_with_direct = runs_with_direct = 0
    paras_numbered = 0
    fields: Counter[str] = Counter()
    chars_in_direct_runs = chars_total = 0

    for p in root.iter(q("p")):
        paras += 1
        ppr = p.find(q("pPr"))
        style_id = val(ppr.find(q("pStyle"))) if ppr is not None and ppr.find(q("pStyle")) is not None else "(default)"
        para_styles[style_id] += 1
        if ppr is not None and ppr.find(q("numPr")) is not None:
            paras_numbered += 1
        d = direct_props(ppr, NOISE)
        if d:
            paras_with_direct += 1
            para_direct.update(d)

    for r in root.iter(q("r")):
        runs += 1
        rpr = r.find(q("rPr"))
        if rpr is not None and rpr.find(q("rStyle")) is not None:
            run_styles[val(rpr.find(q("rStyle")))] += 1
        text = "".join(t.text or "" for t in r.iter(q("t")))
        chars_total += len(text)
        d = direct_props(rpr, NOISE)
        if d:
            runs_with_direct += 1
            chars_in_direct_runs += len(text)
            run_direct.update(d)

    for t in root.iter(q("tbl")):
        pr = t.find(q("tblPr"))
        table_styles[val(pr.find(q("tblStyle"))) if pr is not None and pr.find(q("tblStyle")) is not None else "(none)"] += 1

    for it in root.iter(q("instrText")):
        fields[(it.text or "").strip().split(" ")[0]] += 1
    for _ in root.iter(q("fldSimple")):
        fields["(fldSimple)"] += 1

    def count(tag: str) -> int:
        return sum(1 for _ in root.iter(q(tag)))

    def name_of(style_id: str) -> str:
        info = styles.get(style_id)
        return f"{info[0]}{' [custom]' if info and info[2] else ''}" if info else "(not defined)"

    print(f"File: {path}")
    print(f"Paragraphs: {paras}, runs: {runs}, characters: {chars_total}")
    print("\n== Paragraph styles used ==")
    for sid, n in para_styles.most_common():
        print(f"{n:5d}  {sid}  ->  {name_of(sid) if sid != '(default)' else 'Normal (implicit)'}")
    print("\n== Character styles used ==")
    for sid, n in run_styles.most_common():
        print(f"{n:5d}  {sid}  ->  {name_of(sid)}")
    print("\n== Table styles used ==")
    for sid, n in table_styles.most_common():
        print(f"{n:5d}  {sid}  ->  {name_of(sid) if sid != '(none)' else '-'}")

    print("\n== Direct formatting ==")
    print(f"Paragraphs with direct pPr: {paras_with_direct}/{paras}")
    for k, n in para_direct.most_common(25):
        print(f"{n:5d}  {k}")
    print(f"Runs with direct rPr: {runs_with_direct}/{runs} ({chars_in_direct_runs}/{chars_total} characters)")
    for k, n in run_direct.most_common(30):
        print(f"{n:5d}  {k}")

    print("\n== Structures ==")
    print(f"Paragraphs with numbering (numPr): {paras_numbered}")
    for label, tag in [
        ("tables", "tbl"), ("merged cells (gridSpan)", "gridSpan"), ("vertical merges (vMerge)", "vMerge"),
        ("images (drawing)", "drawing"), ("legacy pictures (pict)", "pict"), ("text boxes", "txbxContent"),
        ("hyperlinks", "hyperlink"), ("bookmarks", "bookmarkStart"), ("comment ranges", "commentRangeStart"),
        ("tracked insertions", "ins"), ("tracked deletions", "del"), ("content controls (sdt)", "sdt"),
        ("section breaks (sectPr)", "sectPr"), ("page breaks (br)", "br"), ("footnote refs", "footnoteReference"),
        ("tabs", "tab"),
    ]:
        print(f"{count(tag):5d}  {label}")
    print("Fields:", dict(fields) or "none")

    print("\n== Styles defined vs used ==")
    used = set(para_styles) | set(run_styles) | set(table_styles)
    custom = [(sid, i[0]) for sid, i in styles.items() if i[2]]
    print(f"Defined: {len(styles)}, custom: {len(custom)}, used in body: {len(used & set(styles))}")
    print("Custom styles:", ", ".join(f"{n} ({sid}{'*' if sid in used else ''})" for sid, n in custom) or "none")
    print("(* = used in body)")


if __name__ == "__main__":
    main(sys.argv[1])
