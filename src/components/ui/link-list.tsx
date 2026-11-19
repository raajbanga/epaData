import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

/** A list of links, each a bold label over one plain line saying what it opens. */
export function LinkList({
  items,
  large = false,
  className,
}: {
  items: { href: string; label: string; body: string }[];
  /** Bigger type and a rule above each item, for the main choices on a page. */
  large?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        !large && "divide-edge/70 border-edge divide-y border-y",
        className,
      )}
    >
      {items.map(({ href, label, body }) => (
        <li key={href} className={cn(large && "border-edge border-t")}>
          <Link
            href={href}
            className={cn(
              "group hover:bg-surface -mx-2 flex gap-3 rounded-sm px-2",
              large ? "h-full items-start py-4" : "items-center py-2.5",
            )}
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "text-fg group-hover:text-primary block font-medium",
                  large ? "text-lg" : "text-[15px]",
                )}
              >
                {label}
              </span>
              <span
                className={cn(
                  "text-fg-muted block",
                  large ? "text-[15px]" : "text-sm",
                )}
              >
                {body}
              </span>
            </span>
            <ChevronRight
              className={cn(
                "text-fg-muted h-4 w-4 shrink-0",
                large && "mt-1.5",
              )}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
