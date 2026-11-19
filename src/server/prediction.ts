import { and, between, desc, eq, sql, sum, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { FilterInput } from "~/lib/facility-filters";
import {
  modelInputs,
  predict,
  type ModelArtifact,
  type ScopeRow,
} from "~/lib/model";
import { getFuelTheme } from "~/lib/map-utils";
import { sample } from "~/server/analysis";
import { unitYearConditions } from "~/server/api/routers/facilities";
import { db } from "~/server/db";
import { annualRecords, facilities, models, units } from "~/server/db/schema";

/** Registered models, baseline unit-years, and test-year predictions. */

const prev = alias(annualRecords, "prev");

/** Unit-years in ml/train.py's raw shape, plus identity and the actual NOₓ. */
async function modelRows(where: SQL | undefined, limit?: number) {
  const query = db
    .select({
      year: annualRecords.year,
      primary_fuel: units.primaryFuel,
      unit_type: units.unitType,
      nameplate_capacity_mw: units.nameplateCapacityMW,
      commercial_op_date: units.commercialOpDate,
      operating_hours: annualRecords.operatingHours,
      gross_generation_mwh: annualRecords.grossGenerationMWh,
      heat_input_mmbtu: annualRecords.heatInputMMBtu,
      nox_controls: annualRecords.noxControls,
      prev_nox_mass_tons: prev.noxMassTons,
      prev_heat_input_mmbtu: prev.heatInputMMBtu,
      prev_operating_hours: prev.operatingHours,
      facilityId: annualRecords.facilityId,
      facilityName: facilities.name,
      stateCode: facilities.stateCode,
      unitId: units.unitId,
      noxMassTons: annualRecords.noxMassTons,
    })
    .from(annualRecords)
    .innerJoin(units, eq(annualRecords.unitInternalId, units.id))
    .innerJoin(facilities, eq(annualRecords.facilityId, facilities.id))
    .leftJoin(
      prev,
      and(
        eq(prev.unitInternalId, annualRecords.unitInternalId),
        eq(prev.year, sql`${annualRecords.year} - 1`),
      ),
    )
    .where(where)
    .orderBy(desc(annualRecords.noxMassTons))
    .$dynamic();
  return limit ? query.limit(limit) : query;
}

export async function listModels() {
  const rows = await db.select().from(models).orderBy(models.id);
  return rows.map((m) => ({
    ...m,
    artifact: m.artifact as unknown as ModelArtifact,
  }));
}

/** A facility's units with a NOₓ value in `year`, largest NOₓ first: the baseline choices. */
export async function baselineUnits(facilityId: number, year: number) {
  const rows = await modelRows(
    and(
      eq(annualRecords.facilityId, facilityId),
      eq(annualRecords.year, year),
      sql`${annualRecords.noxMassTons} IS NOT NULL`,
    ),
    40,
  );
  return rows.map((r) => ({
    facilityId: r.facilityId,
    facilityName: r.facilityName,
    stateCode: r.stateCode,
    unitId: r.unitId,
    fuel: r.primary_fuel,
    noxMassTons: r.noxMassTons,
  }));
}

/**
 * Actual vs predicted NOₓ per model for test-year unit-years: an even sample of `max` for the
 * evaluation charts, or every one (`max` = Infinity) for the predictions export.
 */
export async function testPredictions(from: number, to: number, max = 3000) {
  const [rows, registered] = await Promise.all([
    modelRows(
      and(
        between(annualRecords.year, from, to),
        sql`${annualRecords.noxMassTons} IS NOT NULL`,
      ),
    ),
    listModels(),
  ]);
  return (Number.isFinite(max) ? sample(rows, max) : rows).map((r) => {
    const inputs = modelInputs(r);
    return {
      facilityId: r.facilityId,
      unitId: r.unitId,
      year: r.year,
      label: `${r.facilityName} (${r.facilityId}) unit ${r.unitId}, ${r.year}`,
      fuel: getFuelTheme(r.primary_fuel).name,
      actual: r.noxMassTons!,
      predicted: Object.fromEntries(
        registered.map((m) => [m.kind, predict(m.artifact, inputs)]),
      ),
    };
  });
}

/** Total reported NOₓ (short tons) in `year`, nationally or in `stateCode`. */
async function noxTotal(year: number, stateCode?: string) {
  const [row] = await db
    .select({ tons: sum(annualRecords.noxMassTons).mapWith(Number) })
    .from(annualRecords)
    .innerJoin(facilities, eq(annualRecords.facilityId, facilities.id))
    .where(
      and(
        eq(annualRecords.year, year),
        stateCode ? eq(facilities.stateCode, stateCode) : undefined,
      ),
    );
  return row?.tons ?? 0;
}

/**
 * What-if scope: every unit-year matching the filters in `year` with a NOₓ value, as model inputs,
 * plus the reported NOₓ of the nation and (when the scope lies in one state) that state, so a
 * change reads as a share of either. The year is the page's own, whatever the filters say.
 */
export async function scopeUnitYears(filters: FilterInput, year: number) {
  const rows = await modelRows(
    and(
      ...unitYearConditions({
        ...filters,
        year: undefined,
        yearMin: undefined,
        yearMax: undefined,
      }),
      eq(annualRecords.year, year),
      sql`${annualRecords.noxMassTons} IS NOT NULL`,
    ),
  );
  const states = [...new Set(rows.map((r) => r.stateCode))];
  const state = states.length === 1 ? states[0]! : null;
  const [nation, inState] = await Promise.all([
    noxTotal(year),
    state ? noxTotal(year, state) : null,
  ]);
  return {
    rows: rows.map((r): ScopeRow => ({
      facilityId: r.facilityId,
      facilityName: r.facilityName,
      stateCode: r.stateCode,
      unitId: r.unitId,
      actual: r.noxMassTons!,
      inputs: modelInputs(r),
    })),
    totals: { nation, state, inState },
  };
}
