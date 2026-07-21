import assert from "node:assert/strict";
import { nextPostCreationClarificationStep, shouldAskDirectSunClarification } from "./post-creation-clarifications";

assert.equal(
  nextPostCreationClarificationStep({
    hasWateringBaseline: false,
    hasRepottingBaseline: false,
    hasAssignedRoom: true,
    roomDirectSun: null
  }),
  "watering"
);

assert.equal(
  nextPostCreationClarificationStep({
    hasWateringBaseline: true,
    hasRepottingBaseline: false,
    hasAssignedRoom: true,
    roomDirectSun: null
  }),
  "repotting"
);

assert.equal(
  nextPostCreationClarificationStep({
    hasWateringBaseline: true,
    hasRepottingBaseline: true,
    hasAssignedRoom: true,
    roomDirectSun: null
  }),
  null
);

assert.equal(
  nextPostCreationClarificationStep({
    hasWateringBaseline: true,
    hasRepottingBaseline: true,
    hasAssignedRoom: true,
    roomDirectSun: null,
    analysis: { statusReasonCode: "possible_light_stress" }
  }),
  "sunlight"
);

assert.equal(
  nextPostCreationClarificationStep({
    hasWateringBaseline: true,
    hasRepottingBaseline: true,
    hasAssignedRoom: true,
    roomDirectSun: "unsure"
  }),
  null
);

assert.equal(
  shouldAskDirectSunClarification({
    hasAssignedRoom: true,
    roomDirectSun: null,
    analysis: { primaryActionId: "move_to_indirect_light" }
  }),
  true
);

assert.equal(
  shouldAskDirectSunClarification({
    hasAssignedRoom: true,
    roomDirectSun: null,
    analysis: { visibleObservations: [{ en: "A few dry edges may be old sun scorch.", ru: "Есть сухие края, похожие на старые следы солнца." }] }
  }),
  true
);

assert.equal(
  shouldAskDirectSunClarification({
    hasAssignedRoom: true,
    roomDirectSun: null,
    analysis: { visibleObservations: [{ en: "New growth looks firm.", ru: "Новый рост выглядит упругим." }] }
  }),
  false
);

assert.equal(
  nextPostCreationClarificationStep({
    hasWateringBaseline: true,
    hasRepottingBaseline: true,
    hasAssignedRoom: false,
    roomDirectSun: null
  }),
  null
);
