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
  true,
  "low confidence should activate Rescue Entry"
);

assert.equal(
  shouldShowRescueEntry({
    analysis: { confidence: 0.8, detectedSpecies: null },
    commonName: "Неизвестное растение",
    scientificName: ""
  }),
  true,
  "unknown species should activate Rescue Entry even when the request succeeded"
);

assert.equal(shouldShowRescueEntry({ analysis: null, commonName: "", scientificName: "" }), false);
