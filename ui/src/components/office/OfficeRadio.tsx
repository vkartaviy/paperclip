import { useEffect, useState } from "react";
import { Music, Pause } from "lucide-react";
import { officeAudio } from "@/lib/office-audio";
import { Button } from "@/components/ui/button";

export function OfficeRadio() {
  const [state, setState] = useState(() => officeAudio.getState());

  useEffect(() => officeAudio.subscribe(() => setState(officeAudio.getState())), []);

  if (!state.playing && !state.station) {
    return null;
  }

  const stationName = state.station?.name ?? "lofi hip hop";

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        onClick={() => officeAudio.toggle()}
      >
        {state.playing ? <Pause className="h-3.5 w-3.5" /> : <Music className="h-3.5 w-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className="text-xs text-muted-foreground truncate max-w-[120px] px-3"
        onClick={() => officeAudio.nextStation()}
      >
        {stationName}
      </Button>
    </div>
  );
}
