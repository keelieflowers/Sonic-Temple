import { readFile } from "node:fs/promises";

type RawShow = {
  object?: { title?: string };
};

type RawShowsResponse = Record<string, RawShow>;

function normalizeBandName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export class ScheduleSource {
  constructor(
    private readonly scheduleUrl: string,
    private readonly localSchedulePath: string
  ) {}

  async getBandNames(): Promise<string[]> {
    const fromLive = await this.getBandNamesFromLiveFeed();
    if (fromLive.length > 0) {
      return fromLive;
    }
    return this.getBandNamesFromLocalFile();
  }

  private async getBandNamesFromLiveFeed(): Promise<string[]> {
    try {
      const response = await fetch(this.scheduleUrl);
      if (!response.ok) {
        return [];
      }
      const payload = (await response.json()) as RawShowsResponse;
      return this.extractUniqueBandNamesFromRaw(payload);
    } catch {
      return [];
    }
  }

  private async getBandNamesFromLocalFile(): Promise<string[]> {
    const raw = await readFile(this.localSchedulePath, "utf8");
    const parsed = JSON.parse(raw) as Array<{ artist?: string }>;
    const names = parsed.map((entry) => entry.artist ?? "");
    return this.toUniqueBandNames(names);
  }

  private extractUniqueBandNamesFromRaw(raw: RawShowsResponse): string[] {
    const names = Object.values(raw).map((show) => show.object?.title ?? "");
    return this.toUniqueBandNames(names);
  }

  private toUniqueBandNames(input: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    input.forEach((name) => {
      const normalized = normalizeBandName(name);
      if (!normalized) {
        return;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push(normalized);
    });
    return result;
  }
}
