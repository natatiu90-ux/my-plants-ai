export type RecommendationRefreshStatus = "idle" | "loading" | "success" | "unchanged" | "error";

export type RecommendationRefreshState = {
  status: RecommendationRefreshStatus;
  error?: string;
};

export type RecommendationRefreshEvent =
  | { type: "start" }
  | { type: "success" }
  | { type: "unchanged" }
  | { type: "error"; error?: string }
  | { type: "reset" };

export function recommendationRefreshReducer(
  state: RecommendationRefreshState,
  event: RecommendationRefreshEvent
): RecommendationRefreshState {
  if (event.type === "start") {
    if (state.status === "loading") {
      return state;
    }
    return { status: "loading" };
  }

  if (event.type === "success") {
    return { status: "success" };
  }

  if (event.type === "unchanged") {
    return { status: "unchanged" };
  }

  if (event.type === "error") {
    return { status: "error", error: event.error };
  }

  return { status: "idle" };
}
