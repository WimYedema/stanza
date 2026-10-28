import { isNodeId, type NodeId } from '@phrase/core';

const ANNOTATION = /^<!--\s*phrase:\s*(.*?)\s*-->$/;

/** Reads the `#id` of a block annotation line such as `<!-- phrase: #k7m2q9x4zb .style -->`. */
export function readAnnotationId(line: string): NodeId | undefined {
  const body = ANNOTATION.exec(line.trim())?.[1];
  if (body === undefined) return undefined;
  const token = body.split(/\s+/).find((part) => part.startsWith('#'));
  const id = token?.slice(1);
  return id !== undefined && isNodeId(id) ? id : undefined;
}
