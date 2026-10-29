// Throwaway: how docx places paragraphs around tables.
import { strFromU8, unzipSync } from 'fflate';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType } from 'docx';

const table = () =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('x')] })] })],
  });
const shape = async (children) => {
  const doc = new Document({ sections: [{ children }] });
  const files = unzipSync(new Uint8Array(await Packer.toArrayBuffer(doc)));
  const xml = strFromU8(files['word/document.xml']);
  const body = xml.slice(xml.indexOf('<w:body>'));
  const top = body.replace(/<w:tbl>.*?<\/w:tbl>/gs, '<TBL/>');
  return [...top.matchAll(/<(w:p|TBL|w:sectPr)[ >/]/g)].map((m) => m[1]).join(' ');
};
console.log('single      :', await shape([table()]));
console.log('p tbl       :', await shape([new Paragraph('a'), table()]));
console.log('tbl p       :', await shape([table(), new Paragraph('a')]));
console.log('tbl tbl     :', await shape([table(), table()]));
console.log('p tbl tbl p :', await shape([new Paragraph('a'), table(), table(), new Paragraph('b')]));
