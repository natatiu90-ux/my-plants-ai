import assert from "node:assert/strict";
import { buildIdFromServiceWorkerUrl, shouldShowPwaUpdateBanner } from "./pwa-update-state";

assert.equal(buildIdFromServiceWorkerUrl("https://example.com/sw.js?v=abc123"), "abc123");
assert.equal(buildIdFromServiceWorkerUrl("/sw.js?v=local"), "local");
assert.equal(buildIdFromServiceWorkerUrl(null), null);

assert.equal(
  shouldShowPwaUpdateBanner({
    clientBuildId: "v1",
    controllerBuildId: null,
    waitingBuildId: "v2",
    waitingDetectedThisSession: true
  }),
  false
);

assert.equal(
  shouldShowPwaUpdateBanner({
    clientBuildId: "v2",
    controllerBuildId: "v2",
    waitingBuildId: "v2",
    waitingDetectedThisSession: false
  }),
  false
);

assert.equal(
  shouldShowPwaUpdateBanner({
    clientBuildId: "v1",
    controllerBuildId: "v1",
    waitingBuildId: "v2",
    waitingDetectedThisSession: false
  }),
  false
);

assert.equal(
  shouldShowPwaUpdateBanner({
    clientBuildId: "v1",
    controllerBuildId: "v1",
    waitingBuildId: "v2",
    waitingDetectedThisSession: true
  }),
  true
);

assert.equal(
  shouldShowPwaUpdateBanner({
    clientBuildId: "v1",
    controllerBuildId: "v1",
    waitingBuildId: "v2",
    waitingDetectedThisSession: true,
    dismissedWaitingBuildId: "v2"
  }),
  false
);

assert.equal(
  shouldShowPwaUpdateBanner({
    clientBuildId: "v1",
    controllerBuildId: "v1",
    waitingBuildId: "v3",
    waitingDetectedThisSession: true,
    dismissedWaitingBuildId: "v2"
  }),
  true
);

console.log("pwa-update-state tests passed");
