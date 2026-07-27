import type { Plant, PlantAnalysisRecord, PlantFollowUp, PlantMilestone } from "@/types/plant";

type CheckinResult = "improved" | "stable" | "worse" | "unclear" | null | undefined;

function rawPlantStatus(analysis?: PlantAnalysisRecord | null) {
  const status = analysis?.rawResult?.plantStatus;
  return typeof status === "string" ? status : undefined;
}

function hasRecentRecoveryMilestone(milestones: PlantMilestone[], now = new Date()) {
  const cutoff = now.getTime() - 21 * 24 * 60 * 60 * 1000;
  return milestones.some((milestone) => {
    if (milestone.type !== "repotted" && milestone.type !== "pruned" && milestone.type !== "treatment_started") {
      return false;
    }
    const date = milestone.eventDate ? new Date(`${milestone.eventDate.slice(0, 10)}T12:00:00`).getTime() : new Date(milestone.createdAt).getTime();
    return Number.isFinite(date) && date >= cutoff;
  });
}

function hasActiveFollowUp(followUps: PlantFollowUp[]) {
  return followUps.some((followUp) => followUp.status === "scheduled" || followUp.status === "due");
}

function isRecoveryLikeStatus(status?: Plant["status"] | null) {
  return status === "needs_attention" || status === "check_soon";
}

function isPositiveCondition(condition?: Plant["status"] | null) {
  return condition === "healthy" || condition === "check_soon";
}

export function deriveRepeatedPhotoStatus(input: {
  previousPlant: Plant;
  previousAnalysis?: PlantAnalysisRecord | null;
  incomingCondition?: Plant["status"] | null;
  incomingRawResult?: unknown;
  followUps?: PlantFollowUp[];
  milestones?: PlantMilestone[];
}) {
  const previousStatus = input.previousPlant.status;
  const incomingCondition = input.incomingCondition ?? "unknown";
  const incoming = input.incomingRawResult && typeof input.incomingRawResult === "object" ? (input.incomingRawResult as Record<string, unknown>) : {};
  const incomingPlantStatus = typeof incoming.plantStatus === "string" ? incoming.plantStatus : undefined;
  const comparison = incoming.photoComparison && typeof incoming.photoComparison === "object" ? (incoming.photoComparison as { reliableComparison?: unknown }) : {};
  const reliableComparison = comparison.reliableComparison === true;
  const checkinResult = typeof incoming.checkinResult === "string" ? (incoming.checkinResult as CheckinResult) : undefined;
  const previousAiStatus = rawPlantStatus(input.previousAnalysis);
  const recoveryContext =
    isRecoveryLikeStatus(previousStatus) ||
    previousAiStatus === "needs_attention" ||
    previousAiStatus === "action_needed" ||
    previousAiStatus === "watch" ||
    previousAiStatus === "adapting" ||
    hasActiveFollowUp(input.followUps ?? []) ||
    hasRecentRecoveryMilestone(input.milestones ?? []);

  if (incomingCondition === "needs_attention" || incomingPlantStatus === "needs_attention" || incomingPlantStatus === "action_needed" || checkinResult === "worse") {
    return "needs_attention" satisfies Plant["status"];
  }

  if (!recoveryContext) {
    return incomingCondition;
  }

  if (checkinResult === "unclear" || reliableComparison === false) {
    return previousStatus === "healthy" ? "check_soon" : previousStatus;
  }

  if (checkinResult === "improved" || checkinResult === "stable" || isPositiveCondition(incomingCondition) || incomingPlantStatus === "healthy") {
    return "check_soon" satisfies Plant["status"];
  }

  return previousStatus;
}

export function shouldSuppressHealthyCheckinStatus(input: {
  plant: Plant;
  analysis?: PlantAnalysisRecord | null;
  milestones?: PlantMilestone[];
}) {
  const raw = input.analysis?.rawResult;
  const mode = raw && typeof raw === "object" ? (raw as Record<string, unknown>).analysisMode : undefined;
  const aiStatus = rawPlantStatus(input.analysis);
  return mode === "plant_checkin" && aiStatus === "healthy" && (isRecoveryLikeStatus(input.plant.status) || hasRecentRecoveryMilestone(input.milestones ?? []));
}
