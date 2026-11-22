import { describe, expect, it } from 'vitest';
import { contentHash, normalizeLineEndings, sha256Hex } from './source-stamp.js';

const ascii = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0));

describe('sha256Hex', () => {
  it('gives the digests of the FIPS 180-4 examples', () => {
    expect(sha256Hex(ascii(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex(ascii('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex(ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('pads at the edges of a block', () => {
    // 55 bytes leave room for the length in the block, 56 need a second block, 64 fill one.
    expect(sha256Hex(ascii('a'.repeat(55)))).toBe(
      '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318',
    );
    expect(sha256Hex(ascii('a'.repeat(56)))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    );
    expect(sha256Hex(ascii('a'.repeat(64)))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    );
  });
});

describe('contentHash', () => {
  it('hashes the UTF-8 of the text, also outside the basic plane', () => {
    expect(contentHash('é')).toBe(
      'sha256:4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c',
    );
    expect(contentHash('😀')).toBe(
      'sha256:f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9',
    );
  });

  it('does not depend on the line endings of the file', () => {
    expect(normalizeLineEndings('a\r\nb\rc\n')).toBe('a\nb\nc\n');
    expect(contentHash('a\r\nb\rc\n')).toBe(
      'sha256:880553fca8fcea94e325ee2cfb48e5a985cc797f39a14cc6d3cedecfeb2ae4d2',
    );
  });
});
