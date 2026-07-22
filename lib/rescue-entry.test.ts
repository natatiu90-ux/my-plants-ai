import assert from "node:assert/strict";
import { shouldShowRescueEntry } from "./rescue-entry";

assert.equal(
  shouldShowRescueEntry({
    analysis: { confidence: 0.92, detectedSpecies: "Monstera deliciosa" },
    commonName: "Monstera",
    scientificName: "Monstera deliciosa"
  }),
  false,
  "confident species identification should keep the normal Add Plant flow"
);

assert.equal(
  shouldShowRescueEntry({
    analysis: { confidence: 0.42, detectedSpecies: "Monstera deliciosa" },
    commonName: "Monstera",
    scientificName: "Monstera deliciosa"
  }),
  false,
  "low confidence alone should not activate Rescue Entry"
);

assert.equal(
  shouldShowRescueEntry({
    analysis: { confidence: 0.8, detectedSpecies: null },
    commonName: "Неизвестное растение",
    scientificName: ""
  }),
  false,
  "unknown species alone should be a learning state, not Rescue Entry"
);

assert.equal(
  shouldShowRescueEntry({
    analysis: {
      confidence: 0.8,
      detectedSpecies: null,
      condition: "needs_attention",
      rawResult: { visualEvidenceSnapshot: { concerns: ["dry branches"], severity: "moderate" } }
    },
    commonName: "Неизвестное растение",
    scientificName: ""
  }),
  true,
  "visible plant problems should activate Rescue Entry even when species is unknown"
);

assert.equal(shouldShowRescueEntry({ analysis: null, commonName: "", scientificName: "" }), false);
