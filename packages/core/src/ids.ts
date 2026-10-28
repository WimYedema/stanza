declare const nodeIdBrand: unique symbol;

/** Immutable node ID: ten lowercase Crockford base32 characters (ADR 0001). */
export type NodeId = string & { readonly [nodeIdBrand]: true };

const NODE_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{10}$/;

export function isNodeId(value: string): value is NodeId {
  return NODE_ID_PATTERN.test(value);
}
