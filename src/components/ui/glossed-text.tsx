import { Fragment, type ReactNode } from "react";
import { glossSegments } from "~/lib/glossary";

/** The dotted underline that says "hover for a definition", shared with table headers. */
export const GLOSS_CLASS =
  "decoration-fg-muted/60 cursor-help underline decoration-dotted underline-offset-4";

/** Renders `glossSegments` output: terms underlined with their definition as the tooltip. */
export function renderGloss(parts: ReturnType<typeof glossSegments>) {
  return parts.map((part, i) =>
    part.definition ? (
      <span key={i} title={part.definition} className={GLOSS_CLASS}>
        {part.text}
      </span>
    ) : (
      part.text
    ),
  );
}

/**
 * Text with "**…**" set in bold and its jargon glossed. `seen` shares first-mention tracking
 * across several strings (a block of sentences underlines each term once).
 */
export function renderRich(text: string, seen?: Set<string>): ReactNode {
  return text.split(/\*\*(.+?)\*\*/).map((seg, i) =>
    i % 2 ? (
      <strong key={i} className="text-fg font-semibold">
        {renderGloss(glossSegments(seg, seen))}
      </strong>
    ) : (
      <Fragment key={i}>{renderGloss(glossSegments(seg, seen))}</Fragment>
    ),
  );
}

/** "**bold**" markers removed, for plain-text uses (exports, titles, aria labels). */
export const plainText = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1");

/**
 * Running text with its jargon explained on hover and "**…**" in bold: each glossary term's first mention gets a
 * dotted underline and the definition as its tooltip. Anything but a string passes through.
 */
export function GlossedText({ children }: { children: ReactNode }) {
  return typeof children === "string" ? renderRich(children) : children;
}
