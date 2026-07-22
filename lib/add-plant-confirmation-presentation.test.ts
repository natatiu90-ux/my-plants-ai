import assert from "node:assert/strict";
import { deriveAddPlantConfirmationPresentation } from "./add-plant-confirmation-presentation";
import type { SpeciesLearningState } from "./species-learning";

const learningState: SpeciesLearningState = {
  status: "learning",
  currentLabel: "woody deciduous indoor shrub or vine (unknown)",
  confidence: 0.42,
  candidates: [{ label: "woody deciduous indoor shrub or vine (unknown)", confidence: 0.42, source: "ai_visual" }],
  userConfirmation: null,
  evidence: [{ type: "visual", label: "damaged leaves" }],
  source: "analysis"
};

const recoveryUnknown = deriveAddPlantConfirmationPresentation({
  displayCommonName: "Unknown plant",
  hasAnalysis: true,
  isTechnicalFailure: false,
  isRecoveryEligible: true,
  speciesLearningState: learningState
});

assert.equal(recoveryUnknown.titleKey, "addPlant.speciesLearningShortTitle");
assert.equal(recoveryUnknown.titleText, undefined);
assert.equal(recoveryUnknown.speciesDescriptionKey, "addPlant.speciesLearningShortText");
assert.equal(recoveryUnknown.showRecoveryInfo, true, "recovery-eligible confirmation should show one recovery info block");
assert.equal(recoveryUnknown.showConditionSummary, false, "recovery info should replace the generic condition summary");
assert.equal(recoveryUnknown.primaryActionKey, "addPlant.save", "Add Plant confirmation should keep one primary Add CTA");

const healthyKnown = deriveAddPlantConfirmationPresentation({
  displayCommonName: "Monstera",
  hasAnalysis: true,
  isTechnicalFailure: false,
  isRecoveryEligible: false,
  speciesLearningState: {
    ...learningState,
    status: "confident",
    currentLabel: "Monstera deliciosa",
    confidence: 0.95,
    candidates: [{ label: "Monstera deliciosa", confidence: 0.95, source: "ai_visual" }]
  }
});

assert.equal(healthyKnown.titleText, "Monstera");
assert.equal(healthyKnown.speciesDescriptionKey, undefined);
assert.equal(healthyKnown.showRecoveryInfo, false);
assert.equal(healthyKnown.showConditionSummary, true, "healthy known plants keep the normal condition summary");

const technicalFailure = deriveAddPlantConfirmationPresentation({
  displayCommonName: "Unknown plant",
  hasAnalysis: false,
  isTechnicalFailure: true,
  isRecoveryEligible: true,
  speciesLearningState: learningState
});

assert.equal(technicalFailure.showRecoveryInfo, false, "technical failures should not show recovery as if analysis succeeded");
assert.equal(technicalFailure.primaryActionKey, "addPlant.retryAnalysis");
