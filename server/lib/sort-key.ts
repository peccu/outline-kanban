import {
  generateKeyBetween as fiGenerateKeyBetween,
  generateNKeysBetween as fiGenerateNKeysBetween,
} from "fractional-indexing";

export function keyBetween(
  before: string | null,
  after: string | null,
): string {
  return fiGenerateKeyBetween(before, after);
}

export function nKeysBetween(
  before: string | null,
  after: string | null,
  n: number,
): string[] {
  if (n <= 0) return [];
  return fiGenerateNKeysBetween(before, after, n);
}

export function firstKey(): string {
  return keyBetween(null, null);
}

export function keyAfter(last: string | null): string {
  return keyBetween(last, null);
}

export function keyBefore(first: string | null): string {
  return keyBetween(null, first);
}
