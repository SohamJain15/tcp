import { useMemo } from "react";

interface ContestWatermarkProps {
  /** Shown large per tile — the student's UID, or email as a fallback. */
  primary: string;
  /** Shown small under the primary line. */
  secondary?: string;
}

/**
 * Tiles the student's identity faintly across the whole viewport during an active attempt. It does
 * not stop a screenshot — nothing in a browser can — but it makes any leaked capture (including a
 * phone photo of the screen) self-identifying, which is the strongest deterrent available here.
 *
 * Non-interactive and above content but below the screen guard / lock overlays.
 */
export function ContestWatermark({ primary, secondary }: ContestWatermarkProps) {
  // A fixed grid of rotated labels covers the viewport regardless of scroll position.
  const tiles = useMemo(() => Array.from({ length: 60 }), []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[90] select-none overflow-hidden"
      aria-hidden="true"
    >
      <div className="flex h-full w-full flex-wrap content-start gap-x-16 gap-y-20 p-8 opacity-[0.06]">
        {tiles.map((_, index) => (
          <div
            key={index}
            className="-rotate-[24deg] whitespace-nowrap text-foreground"
          >
            <div className="font-mono-code text-sm font-semibold uppercase tracking-widest">{primary}</div>
            {secondary && (
              <div className="font-mono-code text-[10px] tracking-wider">{secondary}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
