import type { ReactNode } from "react";
import { renderRich } from "~/components/ui/glossed-text";
import { cn } from "~/lib/utils";

/**
 * The plain-language answer at the top of an analysis: a few sentences, read before any chart or
 * table, bulleted when there are several; `**words**` in a string are set in bold. Empty sentences (nothing worth saying) are skipped; with none left it renders nothing.
 */
export function Takeaways({
  items,
  className,
}: {
  items: (ReactNode | null | undefined | false)[];
  className?: string;
}) {
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  // Glossed in one pass with one set, so each term is underlined at its first mention in the
  // block only (computed here, not in children, so a re-render gives the same result).
  const seen = new Set<string>();
  const parts = shown.map((item) =>
    typeof item === "string" ? renderRich(item, seen) : item,
  );
  const box = cn(
    "border-primary/40 text-fg border-l-2 pl-4 text-base leading-relaxed text-pretty",
    className,
  );
  // One sentence reads as a sentence; several are separate points, so they're bulleted.
  if (parts.length === 1)
    return (
      <div className={box}>
        <p>{parts[0]}</p>
      </div>
    );
  return (
    <ul className={cn(box, "marker:text-fg-muted list-disc space-y-1.5 pl-9")}>
      {parts.map((part, i) => (
        <li key={i}>{part}</li>
      ))}
    </ul>
  );
}
