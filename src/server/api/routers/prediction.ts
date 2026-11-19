import { z } from "zod";

import { facilityFilterSchema } from "~/lib/facility-filters";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  baselineUnits,
  listModels,
  scopeUnitYears,
  testPredictions,
} from "~/server/prediction";

/** Phase 2 Predict page: models, baseline unit-years, and test-year predictions. */
export const predictionRouter = createTRPCRouter({
  models: publicProcedure.query(() => listModels()),

  baselineUnits: publicProcedure
    .input(z.object({ facilityId: z.number().int(), year: z.number().int() }))
    .query(({ input }) => baselineUnits(input.facilityId, input.year)),

  /** What-if: every unit-year in a scope (a unit, a facility, a state, or the nation, narrowed by filters). */
  scope: publicProcedure
    .input(z.object({ filters: facilityFilterSchema, year: z.number().int() }))
    .query(({ input }) => scopeUnitYears(input.filters, input.year)),

  testPredictions: publicProcedure
    .input(
      z.object({
        from: z.number().int(),
        to: z.number().int(),
        /** Every test unit-year (the predictions export) instead of the charts' sample. */
        all: z.boolean().optional(),
      }),
    )
    .query(({ input }) =>
      testPredictions(input.from, input.to, input.all ? Infinity : undefined),
    ),
});
