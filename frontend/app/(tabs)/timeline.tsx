import { useLineup } from "@/src/providers/lineup/LineupProvider";
import { TimelineScreen } from "@/src/features/timeline/TimelineScreen";

export default function TimelineTab() {
  const { selectedBands } = useLineup();
  return <TimelineScreen selectedBands={[...selectedBands]} />;
}
