/**
 * The revision stamp of a generated DOCX (ADR 0084, backlog item 138): which document of the
 * project it was built from, at which revision, and the source itself. A pull of review comments
 * reads it back to find the reviewed version. Shared by the exporter, which writes it, and the
 * reader of reviewed files.
 */

/** The names of the custom file properties of the stamp, in the order they are written. */
export const SOURCE_STAMP_PROPERTIES = {
  /** The path of the document, relative to the project root. */
  document: 'stanza-document',
  /** The Git commit the document was built from, when it is known. */
  commit: 'stanza-commit',
  /** `true` when the document had changes that were not committed, `false` when it had none. */
  dirty: 'stanza-dirty',
  /** The content hash of the source, as given by `contentHash`. */
  contentHash: 'stanza-content-hash',
} as const;

/** The namespace of the custom XML part that holds the source text in a DOCX. */
export const SOURCE_PART_NAMESPACE = 'urn:stanza:source:1';

/** Where a source file stands in version control, as a host finds it. */
export interface SourceRevision {
  /** The commit that the working tree is on. */
  readonly commit: string;
  /** True when the file differs from that commit, or is not in it. */
  readonly dirty: boolean;
}

/** What the exporter stamps into the DOCX of one document. */
export interface SourceStamp {
  /** The path of the document, relative to the project root, with `/` separators. */
  readonly path: string;
  /** The text of the document as it was read. */
  readonly text: string;
  /** Undefined when the host knows of no version control for the file. */
  readonly revision?: SourceRevision;
}

/**
 * The text with every line ending written as `\n`. Word writes the line breaks of a custom XML
 * part as `\r\n` (`spike-findings`), and a source file may have either, so the stamp is made of,
 * and compared with, the normalised text.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** The content hash of a source text: `sha256:` and the hex digest of its normalised UTF-8. */
export function contentHash(text: string): string {
  return `sha256:${sha256Hex(utf8(normalizeLineEndings(text)))}`;
}

/** The UTF-8 bytes of a string. `TextEncoder` is not available everywhere the core runs. */
function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return Uint8Array.from(bytes);
}

const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** The SHA-256 digest of some bytes, in lowercase hex (FIPS 180-4). */
export function sha256Hex(bytes: Uint8Array): string {
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  const h = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] ?? 0;
      const b = w[i - 2] ?? 0;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]].map(
      (value) => value ?? 0,
    ) as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + choice + (K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = ((h[i] ?? 0) + (next[i] ?? 0)) >>> 0;
  }
  return [...h].map((word) => word.toString(16).padStart(8, '0')).join('');
}
