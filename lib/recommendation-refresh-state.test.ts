import assert from "node:assert/strict";
import { recommendationRefreshReducer } from "./recommendation-refresh-state";

assert.deepEqual(recommendationRefreshReducer({ status: "idle" }, { type: "start" }), { status: "loading" });
assert.deepEqual(recommendationRefreshReducer({ status: "loading" }, { type: "start" }), { status: "loading" });
assert.deepEqual(recommendationRefreshReducer({ status: "loading" }, { type: "success" }), { status: "success" });
assert.deepEqual(recommendationRefreshReducer({ status: "loading" }, { type: "unchanged" }), { status: "unchanged" });
assert.deepEqual(recommendationRefreshReducer({ status: "loading" }, { type: "error", error: "timeout" }), { status: "error", error: "timeout" });
assert.deepEqual(recommendationRefreshReducer({ status: "error", error: "timeout" }, { type: "start" }), { status: "loading" });
assert.deepEqual(recommendationRefreshReducer({ status: "success" }, { type: "reset" }), { status: "idle" });

console.log("recommendation-refresh-state tests passed");
