import { cn } from "@/lib/utils";

const SPRITE_COUNT = 13;

const SPRITES = Array.from({ length: SPRITE_COUNT }, (_, i) => {
  const id = String(i + 1).padStart(2, "0");

  return { id, file: `char_${id}_idle.png`, src: `/office/characters/char_${id}_idle.png` };
});

interface Props {
  selected?: string | null;
  onSelect: (charSprite: string) => void;
}

export function SpritePicker({ selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-5 gap-1 p-1">
      {SPRITES.map((s) => (
        <button
          key={s.id}
          className={cn(
            "rounded-lg p-1 transition-colors hover:bg-accent",
            selected === s.file && "bg-accent ring-1 ring-primary"
          )}
          onClick={() => onSelect(s.file)}
        >
          <div className="w-8 h-8 overflow-hidden mx-auto">
            <img
              src={s.src}
              alt={`Character ${s.id}`}
              className="w-full"
              style={{ marginTop: "-5px", imageRendering: "pixelated" }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

export { SPRITES };
