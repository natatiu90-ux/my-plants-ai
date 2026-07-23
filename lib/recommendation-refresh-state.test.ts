import assert from "node:assert/strict";
import { recommendationRefreshReducer, recommendationRefreshStateForPlant } from "./recommendation-refresh-state";

const plantA = "plant-a";
const plantB = "plant-b";

let state = recommendationRefreshReducer({ status: "idle" }, { type: "start", plantId: plantA });
state = recommendationRefreshReducer(state, { type: "error", plantId: plantA, error: "Название сохранено, но совет пока не обновился." });

assert.equal(state.status, "error", "Plant A should keep its failed manual-name refresh state");
assert.equal(state.plantId, plantA, "Refresh error should be scoped to Plant A");

const visibleForPlantB = recommendationRefreshStateForPlant(state, plantB);
assert.equal(visibleForPlantB.status, "idle", "Plant B must not inherit Plant A refresh error");
assert.equal(visibleForPlantB.error, undefined, "Plant B must not show Plant A manual-name error copy");

state = recommendationRefreshReducer(visibleForPlantB, { type: "error", plantId: plantA, error: "Название сохранено, но совет пока не обновился." });
assert.equal(state.status, "idle", "Late Plant A refresh result must not re-open an error on Plant B");
assert.equal(state.plantId, plantB, "The visible refresh state should remain scoped to Plant B");

state = recommendationRefreshReducer(state, { type: "start", plantId: plantB });
state = recommendationRefreshReducer(state, { type: "success", plantId: plantB });
assert.equal(state.status, "success", "Plant B should still be able to refresh independently");
assert.equal(state.plantId, plantB, "Plant B success should remain scoped to Plant B");

console.log("recommendation refresh state scoping tests passed");
