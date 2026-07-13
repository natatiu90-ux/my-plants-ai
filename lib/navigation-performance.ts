"use client";

const navigationMarks = new Map<string, number>();

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function key(flow: string, plantId: string) {
  return `${flow}:${plantId}`;
}

export function startNavigationLog(flow: string, plantId: string, eventName: string) {
  navigationMarks.set(key(flow, plantId), now());
  console.info(eventName, { plantId, elapsedMs: 0 });
}

export function logNavigationEvent(flow: string, plantId: string, eventName: string) {
  const startedAt = navigationMarks.get(key(flow, plantId)) ?? now();
  console.info(eventName, { plantId, elapsedMs: Math.round(now() - startedAt) });
}
