import { describe, expect, test } from "bun:test";
import {
  firstKey,
  keyAfter,
  keyBefore,
  keyBetween,
  nKeysBetween,
} from "./sort-key";

describe("sort-key", () => {
  test("firstKey is stable and non-empty", () => {
    expect(firstKey()).toBe("a0");
  });

  test("keyAfter / keyBefore produce strictly ordered values", () => {
    const a = firstKey();
    const b = keyAfter(a);
    const z = keyBefore(a);
    expect(z < a).toBe(true);
    expect(a < b).toBe(true);
  });

  test("keyBetween bisects without collision under repeated insertion", () => {
    let lo = firstKey();
    let hi = keyAfter(lo);
    const inserted = new Set<string>([lo, hi]);
    for (let i = 0; i < 100; i++) {
      const mid = keyBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      expect(inserted.has(mid)).toBe(false);
      inserted.add(mid);
      hi = mid;
    }
  });

  test("nKeysBetween returns N strictly increasing keys", () => {
    const keys = nKeysBetween(null, null, 5);
    expect(keys).toHaveLength(5);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
  });

  test("nKeysBetween between two existing keys preserves order", () => {
    const a = firstKey();
    const z = keyAfter(keyAfter(keyAfter(a)));
    const inner = nKeysBetween(a, z, 3);
    expect(inner).toHaveLength(3);
    expect(a < inner[0]!).toBe(true);
    expect(inner[0]! < inner[1]!).toBe(true);
    expect(inner[1]! < inner[2]!).toBe(true);
    expect(inner[2]! < z).toBe(true);
  });

  test("keyBetween rejects inverted bounds", () => {
    const a = firstKey();
    const b = keyAfter(a);
    expect(() => keyBetween(b, a)).toThrow();
  });
});
