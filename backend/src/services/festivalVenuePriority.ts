import { readFile } from "node:fs/promises";

type FestivalVenueConfig = Array<{
  festival?: string;
  stages?: Array<{ id?: string }>;
}>;

export async function loadFestivalVenuePriorityIds(path: string): Promise<string[]> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as FestivalVenueConfig;
  return parsed.flatMap((festival) =>
    (festival.stages ?? []).map((stage) => stage.id?.trim()).filter((value): value is string => Boolean(value))
  );
}
