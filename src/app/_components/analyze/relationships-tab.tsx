"use client";

import { CorrelationChart, ScatterChart } from "./charts";
import type { TabProps } from "./shared";

/** Scatter and correlation heat map: which variables move together. */
export function RelationshipsTab(props: TabProps) {
  return (
    <div className="space-y-6">
      <ScatterChart {...props} />
      <CorrelationChart {...props} />
    </div>
  );
}
