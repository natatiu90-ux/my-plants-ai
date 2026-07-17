export type PwaWorkerVersionState = {
  clientBuildId: string;
  controllerBuildId: string | null;
  waitingBuildId: string | null;
  waitingDetectedThisSession: boolean;
  dismissedWaitingBuildId?: string | null;
};

export function buildIdFromServiceWorkerUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url, "https://my-plants-ai.local").searchParams.get("v");
  } catch {
    return null;
  }
}

export function shouldShowPwaUpdateBanner(state: PwaWorkerVersionState) {
  if (!state.controllerBuildId || !state.waitingBuildId || !state.waitingDetectedThisSession) {
    return false;
  }

  if (state.waitingBuildId === state.clientBuildId || state.waitingBuildId === state.controllerBuildId) {
    return false;
  }

  if (state.dismissedWaitingBuildId && state.dismissedWaitingBuildId === state.waitingBuildId) {
    return false;
  }

  return true;
}
