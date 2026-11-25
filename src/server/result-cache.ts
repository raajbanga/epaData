import { createHash } from "node:crypto";
import { eq, max } from "drizzle-orm";
import SuperJSON from "superjson";
import { db } from "~/server/db";
import { datasets, resultCache, traciFactors } from "~/server/db/schema";

/**
 * Results of slow analyses, read instead of recomputed. A result is looked up in memory, then in
 * the `result_cache` table, and only then computed. Every entry carries the version of the data,
 * factors, and logic it was computed from (`dataVersion`), so an import makes old results
 * unreachable at once.
 *
 * Locally every computed result is stored; `npm run db:precompute` recomputes the entries from
 * older data versions and drops those whose input no longer parses, and the committed database
 * ships them. The hosted database is read-only, so there a miss is computed and kept in memory
 * only.
 */

/**
 * Bump when a change to the analysis code changes its results, so stored results computed by the
 * old code are not served (then run `npm run db:precompute`).
 */
const LOGIC_VERSION = 1;

/**
 * The version every stored result carries: when the data last changed (every retrieval, upload,
 * and sync records a dataset), the TRACI factors in use, and LOGIC_VERSION. A change to any of
 * them makes old results unreachable at once.
 */
export async function dataVersion() {
  const [[d], factors] = await Promise.all([
    db.select({ at: max(datasets.importedAt) }).from(datasets),
    db
      .select({
        v: traciFactors.traciVersion,
        p: traciFactors.pollutant,
        c: traciFactors.impactCategory,
        f: traciFactors.factor,
      })
      .from(traciFactors)
      .orderBy(traciFactors.id),
  ]);
  const at = d?.at;
  const imported = at ? String(at instanceof Date ? at.getTime() : at) : "none";
  const traci = createHash("sha256")
    .update(JSON.stringify(factors))
    .digest("hex")
    .slice(0, 12);
  return `${imported}|traci:${traci}|v${LOGIC_VERSION}`;
}

/** JSON with object keys sorted and undefined dropped, so equal inputs give equal keys. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

const MEMORY_LIMIT = 200;
const memory = new Map<string, Promise<unknown>>();
/** Set after a write fails (a read-only database), so later misses skip the write. */
let readOnly = false;
/** Set after a read fails (no table), so later lookups go straight to computing. */
let unavailable = false;

/** The stored or freshly computed result of `procedure` for `input`. */
export async function cachedResult<T>(
  procedure: string,
  input: unknown,
  compute: () => Promise<T> | T,
): Promise<T> {
  const version = await dataVersion();
  const inputJson = stableJson(input);
  const key = `${procedure}:${inputJson}`;
  const memoryKey = `${version}|${key}`;
  const hit = memory.get(memoryKey);
  if (hit) return hit as Promise<T>;

  const result = (async () => {
    // A database without the table (not yet migrated) just computes, as before.
    const [row] = unavailable
      ? []
      : await db
          .select({
            value: resultCache.value,
            dataVersion: resultCache.dataVersion,
          })
          .from(resultCache)
          .where(eq(resultCache.key, key))
          .catch((e: unknown) => {
            unavailable = true;
            console.warn("result_cache unavailable; computing instead.", e);
            return [];
          });
    if (row?.dataVersion === version) return SuperJSON.parse<T>(row.value);

    const value = await compute();
    if (!readOnly && !unavailable) {
      const stored = {
        procedure,
        input: inputJson,
        dataVersion: version,
        value: SuperJSON.stringify(value),
        computedAt: new Date(),
      };
      await db
        .insert(resultCache)
        .values({ key, ...stored })
        .onConflictDoUpdate({ target: resultCache.key, set: stored })
        .catch(() => {
          readOnly = true;
        });
    }
    return value;
  })();

  if (memory.size >= MEMORY_LIMIT) memory.delete(memory.keys().next().value!);
  memory.set(memoryKey, result);
  result.catch(() => memory.delete(memoryKey));
  return result;
}
