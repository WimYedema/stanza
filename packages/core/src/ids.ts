declare const nodeIdBrand: unique symbol;

/** Immutable node ID: ten lowercase Crockford base32 characters (ADR 0001). */
export type NodeId = string & { readonly [nodeIdBrand]: true };

const NODE_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{10}$/;
const NODE_ID_LENGTH = 10;
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export function isNodeId(value: string): value is NodeId {
  return NODE_ID_PATTERN.test(value);
}

/**
 * Builds an ID from random bytes supplied by the host, since `core` has no random source. Each of
 * the first ten bytes contributes its low five bits, which are uniform because 32 divides 256.
 */
export function nodeIdFromRandomBytes(bytes: Uint8Array): NodeId {
  if (bytes.length < NODE_ID_LENGTH) {
    throw new RangeError(
      `Need ${String(NODE_ID_LENGTH)} random bytes, got ${String(bytes.length)}.`,
    );
  }
  let id = '';
  for (let i = 0; i < NODE_ID_LENGTH; i += 1) id += ALPHABET.charAt((bytes[i] ?? 0) & 31);
  if (!isNodeId(id)) throw new Error('Generated an invalid ID.');
  return id;
}
