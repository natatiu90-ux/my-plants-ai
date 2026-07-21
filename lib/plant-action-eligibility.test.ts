import { deriveCareActionState, isDueCareActionState } from "./plant-action-eligibility";
import type { Plant, PlantHypothesisResolution } from "@/types/plant";

const today = new Date("2026-07-16T12:00:00.000Z");

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
    name: "scheduled soil check future without explicit next action",
    plant: plant({ nextAction: null, nextCheckAt: "2026-07-18", lastSoilCheckedAt: "2026-07-13", lastSoilResult: "slightly_damp" }),
    resolutions: [soilResolution({ resolvedAt: "2026-07-13T08:00:00.000Z", createdAt: "2026-07-13T08:00:00.000Z" })],
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
    name: "scheduled soil check due today without explicit next action",
    plant: plant({ nextAction: null, nextCheckAt: "2026-07-16", lastSoilCheckedAt: "2026-07-14", lastSoilResult: "slightly_damp" }),
    resolutions: [soilResolution({ resolvedAt: "2026-07-14T08:00:00.000Z", createdAt: "2026-07-14T08:00:00.000Z" })],
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
    name: "scheduled soil check past without explicit next action",
    plant: plant({ nextAction: null, nextCheckAt: "2026-07-15", lastSoilCheckedAt: "2026-07-13", lastSoilResult: "slightly_damp" }),
    resolutions: [soilResolution({ resolvedAt: "2026-07-13T08:00:00.000Z", createdAt: "2026-07-13T08:00:00.000Z" })],
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
    name: "dry soil answer can switch to watering action",
    plant: plant({ nextAction: "water", nextCheckAt: undefined, lastSoilCheckedAt: "2026-07-15", lastSoilResult: "dry" }),
    resolutions: [soilResolution({ status: "confirmed", userResult: "dry" })],
    expected: {
      actionType: "water",
      status: "due",
      cardVisualState: "action_required",
      isActionable: true,
      cardBadgeKey: "status.looksThirsty",
      includedInAttentionCount: true
    }
  },
  {
    name: "slightly damp soil answer schedules future check",
    plant: plant({ nextAction: "check_soil", nextCheckAt: "2026-07-18", lastSoilCheckedAt: "2026-07-15", lastSoilResult: "slightly_damp" }),
    resolutions: [soilResolution({ status: "ruled_out", userResult: "slightly_damp" })],
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
    name: "very wet soil answer schedules future check",
    plant: plant({ status: "check_soon", nextAction: "check_soil", nextCheckAt: "2026-07-18", lastSoilCheckedAt: "2026-07-15", lastSoilResult: "very_wet" }),
    resolutions: [soilResolution({ status: "confirmed", userResult: "very_wet" })],
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
    name: "not sure soil answer keeps check guidance actionable",
    plant: plant({ status: "check_soon", nextAction: "check_soil", lastSoilCheckedAt: "2026-07-15", lastSoilResult: "not_sure" }),
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

if (homeAttentionCount !== 6) {
  throw new Error(`Expected 6 due attention fixtures, got ${homeAttentionCount}`);
}

const afterAiSoilAnswerBeforeRefresh = deriveCareActionState(
  plant({
    status: "healthy",
    nextAction: "check_soil",
    nextCheckAt: "2026-07-20",
    lastSoilCheckedAt: "2026-07-16",
    lastSoilResult: "slightly_damp"
  }),
  [soilResolution({ resolvedAt: "2026-07-16T08:00:00.000Z", createdAt: "2026-07-16T08:00:00.000Z" })],
  today,
  { isCareDataReady: true }
);

if (afterAiSoilAnswerBeforeRefresh.isActionable || afterAiSoilAnswerBeforeRefresh.status !== "upcoming") {
  throw new Error("AI soil answer should complete the due soil CTA before recommendation refresh finishes.");
}

const failedCarePersistenceStillDue = deriveCareActionState(
  plant({ status: "check_soon", nextAction: "check_soil", nextCheckAt: "2026-07-16" }),
  [],
  today,
  { isCareDataReady: true }
);

if (!failedCarePersistenceStillDue.isActionable || failedCarePersistenceStillDue.status !== "due") {
  throw new Error("Failed soil persistence must leave the due soil CTA retryable.");
}
