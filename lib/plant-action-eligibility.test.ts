import { deriveCareActionState, isDueCareActionState } from "@/lib/plant-action-eligibility";
import type { Plant, PlantHypothesisResolution } from "@/types/plant";

const today = new Date("2026-07-15T12:00:00.000Z");

function plant(overrides: Partial<Plant>): Plant {
  return {
    id: "plant-1",
    speciesName: "Monstera deliciosa",
    status: "healthy",
    messageKey: "plants.afterWatering.message",
    statusLabelKey: "status.doingGreat",
    careScheduleStatus: "active",
    notificationEnabled: true,
    ...overrides
  };
}

function soilResolution(overrides: Partial<PlantHypothesisResolution> = {}): PlantHypothesisResolution {
  return {
    id: "soil-1",
    plantId: "plant-1",
    hypothesis: "soil_condition",
    status: "confirmed",
    userResult: "slightly_damp",
    resolvedAt: "2026-07-15T08:00:00.000Z",
    createdAt: "2026-07-15T08:00:00.000Z",
    ...overrides,
    evidenceSource: overrides.evidenceSource ?? "user"
  };
}

type CareActionFixture = {
  name: string;
  plant: Plant;
  resolutions: PlantHypothesisResolution[];
  expected: {
    actionType: ReturnType<typeof deriveCareActionState>["actionType"];
    status: ReturnType<typeof deriveCareActionState>["status"];
    cardVisualState: ReturnType<typeof deriveCareActionState>["cardVisualState"];
    isActionable: boolean;
    cardBadgeKey: ReturnType<typeof deriveCareActionState>["cardBadgeKey"];
    includedInAttentionCount: boolean;
  };
};

export const careActionFixtures: CareActionFixture[] = [
  {
    name: "soil check due now",
    plant: plant({ status: "check_soon", nextAction: "check_soil", nextCheckAt: "2026-07-15" }),
    resolutions: [],
    expected: {
      actionType: "check_soil",
      status: "due",
      cardVisualState: "action_required",
      isActionable: true,
      cardBadgeKey: "status.checkSoilToday",
      includedInAttentionCount: true
    }
  },
  {
    name: "soil check upcoming",
    plant: plant({ nextAction: "check_soil", nextCheckAt: "2026-07-18" }),
    resolutions: [soilResolution()],
    expected: {
      actionType: "check_soil",
      status: "upcoming",
      cardVisualState: "observe",
      isActionable: false,
      cardBadgeKey: "status.observing",
      includedInAttentionCount: false
    }
  },
  {
    name: "fresh soil answer resolves current action",
    plant: plant({ nextAction: "check_soil", nextCheckAt: "2026-07-19", lastSoilCheckedAt: "2026-07-15", lastSoilResult: "slightly_damp" }),
    resolutions: [soilResolution()],
    expected: {
      actionType: "check_soil",
      status: "upcoming",
      cardVisualState: "observe",
      isActionable: false,
      cardBadgeKey: "status.observing",
      includedInAttentionCount: false
    }
  },
  {
    name: "healthy plant can still have due soil check",
    plant: plant({ status: "healthy", nextAction: "check_soil", nextCheckAt: "2026-07-15" }),
    resolutions: [],
    expected: {
      actionType: "check_soil",
      status: "due",
      cardVisualState: "action_required",
      isActionable: true,
      cardBadgeKey: "status.checkSoilToday",
      includedInAttentionCount: true
    }
  },
  {
    name: "stale stored action is ineligible after saved answer",
    plant: plant({ nextAction: "check_soil" }),
    resolutions: [soilResolution()],
    expected: {
      actionType: "check_soil",
      status: "completed",
      cardVisualState: "observe",
      isActionable: false,
      cardBadgeKey: "status.observing",
      includedInAttentionCount: false
    }
  },
  {
    name: "soil check waits for care context before showing due state",
    plant: plant({ status: "check_soon", nextAction: "check_soil", nextCheckAt: "2026-07-15" }),
    resolutions: [],
    expected: {
      actionType: "check_soil",
      status: "blocked",
      cardVisualState: "observe",
      isActionable: false,
      cardBadgeKey: "status.observing",
      includedInAttentionCount: false
    }
  }
];

careActionFixtures.forEach((fixture) => {
  const actual = deriveCareActionState(fixture.plant, fixture.resolutions, today, {
    isCareDataReady: fixture.name.includes("waits for care context") ? false : true
  });
  if (
    actual.actionType !== fixture.expected.actionType ||
    actual.status !== fixture.expected.status ||
    actual.cardVisualState !== fixture.expected.cardVisualState ||
    actual.isActionable !== fixture.expected.isActionable ||
    actual.cardBadgeKey !== fixture.expected.cardBadgeKey ||
    isDueCareActionState(actual) !== fixture.expected.includedInAttentionCount
  ) {
    throw new Error(`Care action fixture failed: ${fixture.name}`);
  }
});

const homeAttentionCount = careActionFixtures.filter((fixture) => {
  const actual = deriveCareActionState(fixture.plant, fixture.resolutions, today, {
    isCareDataReady: fixture.name.includes("waits for care context") ? false : true
  });
  return isDueCareActionState(actual);
}).length;

if (homeAttentionCount !== 2) {
  throw new Error(`Expected 2 due attention fixtures, got ${homeAttentionCount}`);
}
