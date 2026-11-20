"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "~/lib/utils";

/** The dotted underline that says "this word has a definition", shared with table headers. */
export const TERM_CLASS =
  "decoration-fg-muted/60 underline decoration-dotted underline-offset-4 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/**
 * A word with its definition: shown on hover (after a short pause), on keyboard focus, and on
 * tap, so it works with a mouse, a keyboard, and a touch screen. The browser's own `title`
 * tooltip is slow, never shows on touch, and gives no cue beyond a "?" cursor.
 */
export function Term({
  definition,
  children,
  className,
  bare = false,
}: {
  definition: ReactNode;
  children: ReactNode;
  className?: string;
  /** No dotted underline, for a trigger that already looks like something (a badge). */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const later = (next: boolean, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const mouse = (e: { pointerType: string }) => e.pointerType === "mouse";
  // How the last press started: a tap toggles, a mouse click keeps the hover open, and focus
  // from a press shouldn't open it a second time.
  const pressedWith = useRef<string | null>(null);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <span
          role="button"
          tabIndex={0}
          className={cn(TERM_CLASS, bare && "no-underline", className)}
          onPointerEnter={(e) => mouse(e) && later(true, 150)}
          onPointerLeave={(e) => mouse(e) && later(false, 120)}
          onPointerDown={(e) => (pressedWith.current = e.pointerType)}
          onClick={(e) => {
            e.preventDefault(); // handled here, not by the popover's own toggle
            const how = pressedWith.current;
            pressedWith.current = null;
            clearTimeout(timer.current);
            setOpen((o) => (how === "mouse" ? true : !o));
          }}
          onFocus={() => pressedWith.current === null && setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          {children}
        </span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          // A definition, not a dialog: keep focus (and the reader's place) on the word.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={(e) => mouse(e) && clearTimeout(timer.current)}
          onPointerLeave={(e) => mouse(e) && later(false, 120)}
          className="border-edge bg-surface text-fg z-[10000] max-w-72 rounded-md border px-3 py-2 text-sm leading-snug font-normal whitespace-pre-line shadow-lg shadow-black/10"
        >
          {definition}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
