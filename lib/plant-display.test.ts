import assert from "node:assert/strict";
import { cleanPlantName } from "./plant-display";

assert.equal(cleanPlantName("Sago palm (probably)"), "Sago palm");
assert.equal(cleanPlantName("Сага-пальма (вероятно)"), "Сага-пальма");
assert.equal(cleanPlantName("Monstera likely"), "Monstera");
assert.equal(cleanPlantName("Монстера вероятно"), "Монстера");
