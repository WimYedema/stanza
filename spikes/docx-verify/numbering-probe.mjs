import { strFromU8, unzipSync } from 'fflate';
import { Document, LevelFormat, Packer, Paragraph, TextRun } from 'docx';

const config = [
  {
    reference: 'ListBulleted',
    levels: [
      { level: 0, format: LevelFormat.BULLET, text: '\u2022', style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      { level: 1, format: LevelFormat.BULLET, text: '\u25E6', style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
    ],
  },
  {
    reference: 'ListNumbered',
    levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: '%1.', style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
    ],
  },
];

const build = async () => {
  const p = (text, reference, level, instance) =>
    new Paragraph({
      style: 'ListNumbered',
      numbering: { reference, level, instance, custom: true },
      children: [new TextRun(text)],
    });
  const doc = new Document({
    numbering: { config },
    sections: [
      {
        children: [
          p('a', 'ListNumbered', 0, 0),
          p('b', 'ListNumbered', 1, 0),
          p('c', 'ListNumbered', 0, 1),
          p('d', 'ListBulleted', 0, 2),
        ],
      },
    ],
  });
  return unzipSync(new Uint8Array(await Packer.toArrayBuffer(doc)));
};

const a = await build();
const b = await build();
const numbering = strFromU8(a['word/numbering.xml']);
console.log(numbering.replace(/xmlns:\w+="[^"]*"/g, '').slice(0, 3200));
const doc = strFromU8(a['word/document.xml']);
console.log([...doc.matchAll(/<w:pPr>.*?<\/w:pPr>/g)].map((m) => m[0]).join('\n'));
const numB = strFromU8(b['word/numbering.xml']);
console.log('same numbering.xml?', numbering === numB);
console.log(
  [...numB.matchAll(/<w:num w:numId="(\d+)"/g)].map((m) => m[1]),
  [...numB.matchAll(/<w:abstractNum w:abstractNumId="(\d+)"/g)].map((m) => m[1]),
  [...numbering.matchAll(/<w:num w:numId="(\d+)"/g)].map((m) => m[1]),
);
