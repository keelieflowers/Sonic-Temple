import scheduleData from "./sonic-temple-2026-schedule.json";

export type ScheduleEntry = {
  artist: string;
  slug: string;
  date: string;
  day: "Thursday" | "Friday" | "Saturday" | "Sunday";
  stage: string;
  startTime: string;
  endTime: string;
};

export const SCHEDULE = scheduleData as ScheduleEntry[];
