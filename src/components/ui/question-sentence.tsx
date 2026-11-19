import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/**
 * A question whose blanks are the controls: "What if [every unit in Texas] [added SCR] in [2024]?".
 * Words and controls (a Select, a picker) flow as one sentence and wrap on narrow screens; the
 * controls keep their toolbar size, so the row reads like the app's other control rows. Pass
 * `BLANK` to a Select's className so it sizes to its text instead of filling the row.
 */
export function QuestionSentence({
  label,
  children,
  className,
}: {
  /** What the question sets, for screen readers: "What-if question". */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "text-fg flex flex-wrap items-center gap-x-2 gap-y-2 text-[15px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A Select (or a trigger styled like one) as a blank in a QuestionSentence: as wide as its text. */
export const BLANK = "w-auto max-w-full gap-2 font-medium";

/** A trigger that looks like a toolbar Select, for blanks that open a popover instead. */
export const BLANK_TRIGGER =
  "border-edge bg-surface text-fg hover:bg-surface-2 inline-flex h-9 max-w-full cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium";
