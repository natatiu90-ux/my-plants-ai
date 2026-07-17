import assert from "node:assert/strict";
import { soilCheckActionKey } from "./care-action-idempotency";

assert.equal(
  soilCheckActionKey({ plantId: "plant-1", result: "slightly_damp", actionSessionId: "session-1" }),
  soilCheckActionKey({ plantId: "plant-1", result: "slightly_damp", actionSessionId: "session-1" })
);

assert.notEqual(
  soilCheckActionKey({ plantId: "plant-1", result: "slightly_damp", actionSessionId: "session-1" }),
  soilCheckActionKey({ plantId: "plant-1", result: "very_wet", actionSessionId: "session-1" })
);

assert.notEqual(
  soilCheckActionKey({ plantId: "plant-1", result: "slightly_damp", actionSessionId: "session-1" }),
  soilCheckActionKey({ plantId: "plant-1", result: "slightly_damp", actionSessionId: "session-2" })
);

console.log("care-action-idempotency tests passed");
