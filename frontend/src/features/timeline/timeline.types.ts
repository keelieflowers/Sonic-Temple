import { ScheduleEntry } from "@/src/data/schedule";

export type DayOption = "Thursday" | "Friday" | "Saturday" | "Sunday";
export type SectionType = "playing" | "upcoming" | "finished";
export type SingleItem = { type: "single"; entry: ScheduleEntry };
export type ConflictItem = { type: "conflict"; entries: ScheduleEntry[] };
export type TimelineItem = SingleItem | ConflictItem;
export type TimelineSection = { title: string; sectionType: SectionType; data: TimelineItem[] };
