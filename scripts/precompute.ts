/**
 * Refreshes stored analysis results (`result_cache`): recomputes each entry stored for an older
 * data version for the current one, and drops those whose inputs no longer parse, so the
 * committed database ships the views people open. Run after `db:rebuild`, an import,
 * `ml:train`, or `traci:import`. New views are stored when opened locally, or from a list of requests:
 *
 *   npm run db:precompute
 *   npm run db:precompute -- requests.json   # [{ "procedure": "analysis.summary", "input": {…} }]
 */
import { readFileSync } from "node:fs";
import { eq, ne } from "drizzle-orm";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { db } from "~/server/db";
import { resultCache } from "~/server/db/schema";
import { dataVersion } from "~/server/result-cache";

const caller = createCaller(() =>
  createTRPCContext({ headers: new Headers() }),
);
const version = await dataVersion();
const stale = await db
  .select({
    key: resultCache.key,
    procedure: resultCache.procedure,
    input: resultCache.input,
  })
  .from(resultCache)
  .where(ne(resultCache.dataVersion, version));
const current = await db.$count(resultCache);
console.log(`${current} stored results, ${stale.length} from older data.`);

const extra = process.argv[2]
  ? (
      JSON.parse(readFileSync(process.argv[2], "utf8")) as {
        procedure: string;
        input: unknown;
      }[]
    ).map((r) => ({ procedure: r.procedure, input: JSON.stringify(r.input) }))
  : [];

let done = 0;
for (const { procedure, input } of [...stale, ...extra]) {
  const [router, name] = procedure.split(".") as [string, string];
  const proc = (
    caller as unknown as Record<
      string,
      Record<string, (i: unknown) => Promise<unknown>>
    >
  )[router]?.[name];
  try {
    if (!proc) throw new Error("no such procedure");
    // The cached procedure finds the old version, recomputes, and stores the new one.
    await proc(JSON.parse(input));
    done++;
  } catch (e) {
    console.warn(
      `dropped ${procedure} ${input.slice(0, 80)}: ${(e as Error).message}`,
    );
    await db
      .delete(resultCache)
      .where(eq(resultCache.key, `${procedure}:${input}`));
  }
}
console.log(
  `Recomputed ${done}; ${await db.$count(resultCache)} results stored for data version ${version}.`,
);
