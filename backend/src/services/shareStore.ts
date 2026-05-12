import { randomBytes } from "node:crypto";

interface ShareEntry {
  bands: string[];
  createdAt: number;
}

// In-memory store — shares live until the process restarts, which is fine
// for a festival app. No persistence needed.
const shares = new Map<string, ShareEntry>();

function generateId(): string {
  // 5 random bytes → 8 base64url chars, take 7 → low collision probability
  return randomBytes(5).toString("base64url").slice(0, 7);
}

export function createShare(bands: string[]): string {
  let id: string;
  do {
    id = generateId();
  } while (shares.has(id));
  shares.set(id, { bands, createdAt: Date.now() });
  return id;
}

export function getShare(id: string): string[] | null {
  return shares.get(id)?.bands ?? null;
}
