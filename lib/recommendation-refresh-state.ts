export type RecommendationRefreshStatus = "idle" | "loading" | "success" | "unchanged" | "error";

export type RecommendationRefreshState = {
  status: RecommendationRefreshStatus;
  plantId?: string;
  error?: string;
};

export type RecommendationRefreshEvent =
  | { type: "start"; plantId?: string }
  | { type: "success"; plantId?: string }
  | { type: "unchanged"; plantId?: string }
  | { type: "error"; plantId?: string; error?: string }
  | { type: "reset"; plantId?: string };

export function recommendationRefreshReducer(
  state: RecommendationRefreshState,
  event: RecommendationRefreshEvent
): RecommendationRefreshState {
  if (state.plantId && event.plantId && state.plantId !== event.plantId && event.type !== "reset") {
    return state;
  }

  if (event.type === "start") {
    if (state.status === "loading") {
      return state;
    }
    return { status: "loading", plantId: event.plantId };
  }

  if (event.type === "success") {
    return { status: "success", plantId: event.plantId ?? state.plantId };
  }

  if (event.type === "unchanged") {
    return { status: "unchanged", plantId: event.plantId ?? state.plantId };
  }

  if (event.type === "error") {
    return { status: "error", plantId: event.plantId ?? state.plantId, error: event.error };
  }

  return { status: "idle", plantId: event.plantId };
}

export function recommendationRefreshStateForPlant(state: RecommendationRefreshState, plantId: string): RecommendationRefreshState {
  if (state.status === "idle" || !state.plantId || state.plantId === plantId) {
    return state;
  }

  return { status: "idle", plantId };
}
