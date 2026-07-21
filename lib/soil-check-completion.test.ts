import assert from "node:assert/strict";
import { soilCheckResultFromClarificationAnswer } from "./soil-check-completion";

assert.equal(soilCheckResultFromClarificationAnswer("dry"), "dry");
assert.equal(soilCheckResultFromClarificationAnswer("slightly_damp"), "slightly_damp");
assert.equal(soilCheckResultFromClarificationAnswer("very_wet"), "very_wet");
assert.equal(soilCheckResultFromClarificationAnswer("not_sure"), "not_sure");
assert.equal(soilCheckResultFromClarificationAnswer("unsure"), "not_sure");

assert.throws(() => soilCheckResultFromClarificationAnswer("wet"));
