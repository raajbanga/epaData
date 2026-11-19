import { cn } from "~/lib/utils";

/**
 * The small colored mark that ties a label to a chart color: a dot for fuels and pollutants,
 * a square for chart series. Decorative, so screen readers skip it.
 */
export function Swatch({
  color,
  square = false,
  className,
}: {
  color: string;
  square?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "shrink-0",
        square ? "h-2.5 w-2.5 rounded-[2px]" : "h-2 w-2 rounded-full",
        className,
      )}
      style={{ backgroundColor: color }}
    />
  );
}
