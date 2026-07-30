import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";

const originalResolveFilename = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename = function resolveWithProjectAlias(request: unknown, ...args: unknown[]) {
  if (typeof request === "string" && request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(process.cwd(), request.slice(2)), ...args);
  }
  return originalResolveFilename.call(this, request, ...args);
};

const { AnalysisRepository } = require("./supabase-repositories") as typeof import("./supabase-repositories");

let insertedPayload: { plant_id?: unknown } | null = null;

const persistedRow = {
  id: "persisted-analysis-id",
  plant_id: "plant-1",
  condition: "healthy",
  next_action: null,
  summary_en: "Looks stable",
  summary_ru: null,
  recommendations: [],
  raw_result: { analysisMode: "plant_checkin" },
  model: "test-model",
  created_at: "2026-07-30T10:00:00.000Z",
  resolved_at: null
};

const fakeSupabase = {
  from(table: string) {
    assert.equal(table, "plant_analyses");
    return {
      insert(payload: Record<string, unknown>) {
        insertedPayload = payload;
        return {
          select(columns: string) {
            assert.equal(columns, "*");
            return {
              async single() {
                return { data: persistedRow, error: null };
              }
            };
          }
        };
      }
    };
  }
};

const repository = new AnalysisRepository(fakeSupabase as never, { id: "user-1" } as never);

(async () => {
  const saved = await repository.addAnalysis({
    plantId: "plant-1",
    sourcePhotoIds: ["photo-1"],
    condition: "healthy",
    rawResult: { analysisMode: "plant_checkin" },
    model: "test-model"
  });

  assert.equal((insertedPayload as { plant_id?: unknown } | null)?.plant_id, "plant-1");
  assert.equal(saved.id, "persisted-analysis-id", "repository should return the real persisted analysis id");
  assert.equal(saved.plantId, "plant-1");
  assert.equal(saved.rawResult?.analysisMode, "plant_checkin");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
