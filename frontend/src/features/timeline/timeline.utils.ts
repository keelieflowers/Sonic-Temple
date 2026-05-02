import { ScheduleEntry } from "@/src/data/schedule";
import { toMinutes, formatTime } from "@/src/utils/time";
import { TimelineItem, TimelineSection, SectionType } from "./timeline.types";

export function buildConflictMap(entries: ScheduleEntry[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime)) {
        if (!map.has(a.artist)) map.set(a.artist, []);
        if (!map.has(b.artist)) map.set(b.artist, []);
        map.get(a.artist)!.push(b.artist);
        map.get(b.artist)!.push(a.artist);
      }
    }
  }
  return map;
}

export function buildTimelineItems(entries: ScheduleEntry[], conflictMap: Map<string, string[]>): TimelineItem[] {
  const artistMap = new Map(entries.map((e) => [e.artist, e]));
  const visited = new Set<string>();
  const items: TimelineItem[] = [];

  for (const entry of entries) {
    if (visited.has(entry.artist)) continue;

    const hasConflicts = (conflictMap.get(entry.artist)?.length ?? 0) > 0;
    if (!hasConflicts) {
      visited.add(entry.artist);
      items.push({ type: "single", entry });
      continue;
    }

    // BFS to find the full connected conflict cluster
    const cluster: ScheduleEntry[] = [];
    const queue = [entry.artist];
    while (queue.length > 0) {
      const artist = queue.shift()!;
      if (visited.has(artist)) continue;
      visited.add(artist);
      const e = artistMap.get(artist);
      if (e) cluster.push(e);
      for (const neighbor of conflictMap.get(artist) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    cluster.sort((a, b) => a.startTime.localeCompare(b.startTime));
    items.push({ type: "conflict", entries: cluster });
  }

  return items;
}

export function getItemStartTime(item: TimelineItem): string {
  return item.type === "single" ? item.entry.startTime : item.entries[0].startTime;
}

export function getItemLiveStatus(item: TimelineItem, now: number): "playing" | "finished" | "upcoming" {
  const starts = item.type === "single"
    ? [toMinutes(item.entry.startTime)]
    : item.entries.map((e) => toMinutes(e.startTime));
  const ends = item.type === "single"
    ? [toMinutes(item.entry.endTime)]
    : item.entries.map((e) => toMinutes(e.endTime));
  const earliest = Math.min(...starts);
  const latest = Math.max(...ends);
  if (now >= latest) return "finished";
  if (now >= earliest) return "playing";
  return "upcoming";
}

export function groupItemsByHour(items: TimelineItem[], sectionType: SectionType): TimelineSection[] {
  const hourMap = new Map<number, TimelineItem[]>();
  for (const item of items) {
    const hour = Math.floor(toMinutes(getItemStartTime(item)) / 60);
    if (!hourMap.has(hour)) hourMap.set(hour, []);
    hourMap.get(hour)!.push(item);
  }
  return [...hourMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, data]) => ({ title: formatTime(hour * 60), sectionType, data }));
}

export function itemKey(item: TimelineItem): string {
  return item.type === "single"
    ? item.entry.artist
    : item.entries.map((e) => e.artist).sort().join("|");
}
