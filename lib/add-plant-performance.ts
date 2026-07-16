"use client";

type AddPlantPerformanceEntry = {
  stage: string;
  label?: string;
  startedAt: number;
  endedAt: number;
  elapsedMs: number;
  data?: Record<string, unknown>;
};

type AddPlantPerformanceState = {
  startedAt: number;
  photos: number;
  entries: AddPlantPerformanceEntry[];
};

type StageToken = {
  active: boolean;
  stage: string;
  label?: string;
  startedAt: number;
  data?: Record<string, unknown>;
};

const globalKey = "__myPlantsAddPlantPerformance";

function isEnabled() {
  return typeof window !== "undefined" && process.env.NODE_ENV !== "production";
}

function state(): AddPlantPerformanceState | null {
  if (!isEnabled()) return null;
  const target = window as typeof window & { [globalKey]?: AddPlantPerformanceState };
  if (!target[globalKey]) {
    target[globalKey] = {
      startedAt: performance.now(),
      photos: 0,
      entries: []
    };
  }
  return target[globalKey] ?? null;
}

export function resetAddPlantPerformance(photos: number) {
  if (!isEnabled()) return;
  const target = window as typeof window & { [globalKey]?: AddPlantPerformanceState };
  target[globalKey] = {
    startedAt: performance.now(),
    photos,
    entries: []
  };
  console.info("Add Plant Performance stage start", {
    stage: "pipeline",
    photos
  });
}

export function startAddPlantPerformanceStage(stage: string, data?: Record<string, unknown>, label?: string): StageToken {
  if (!isEnabled()) {
    return { active: false, stage, label, startedAt: 0, data };
  }

  const token = {
    active: true,
    stage,
    label,
    startedAt: performance.now(),
    data
  };
  console.info("Add Plant Performance stage start", {
    stage,
    label,
    ...data
  });
  return token;
}

export function endAddPlantPerformanceStage(token: StageToken, data?: Record<string, unknown>) {
  if (!token.active || !isEnabled()) return 0;
  const endedAt = performance.now();
  const elapsedMs = Math.round(endedAt - token.startedAt);
  const entry = {
    stage: token.stage,
    label: token.label,
    startedAt: token.startedAt,
    endedAt,
    elapsedMs,
    data: {
      ...token.data,
      ...data
    }
  };
  state()?.entries.push(entry);
  console.info("Add Plant Performance stage end", {
    stage: token.stage,
    label: token.label,
    elapsedMs,
    ...entry.data
  });
  return elapsedMs;
}

export function recordAddPlantPerformanceStage(stage: string, elapsedMs: number, data?: Record<string, unknown>, label?: string) {
  if (!isEnabled()) return;
  const now = performance.now();
  const entry = {
    stage,
    label,
    startedAt: now - elapsedMs,
    endedAt: now,
    elapsedMs: Math.round(elapsedMs),
    data
  };
  state()?.entries.push(entry);
  console.info("Add Plant Performance stage end", {
    stage,
    label,
    elapsedMs: entry.elapsedMs,
    ...data
  });
}

export function logAddPlantPerformanceSummary(data: Record<string, unknown> = {}) {
  const current = state();
  if (!current) return;

  const totalMs = Math.round(performance.now() - current.startedAt);
  const totals = current.entries.reduce<Record<string, number>>((result, entry) => {
    result[entry.stage] = (result[entry.stage] ?? 0) + entry.elapsedMs;
    return result;
  }, {});
  const bottleneck = Object.entries(totals).sort((a, b) => b[1] - a[1])[0] ?? ["none", 0];
  const bottleneckPercent = totalMs > 0 ? Math.round((bottleneck[1] / totalMs) * 100) : 0;

  console.info("Add Plant Performance", {
    Photos: current.photos,
    Decode: totals.image_loading ?? 0,
    EXIF: totals.exif_reading ?? 0,
    Rotation: totals.rotation_correction ?? 0,
    Normalize: totals.image_normalization ?? 0,
    CanvasResize: totals.canvas_resize ?? 0,
    Compress: totals.jpeg_encoding ?? 0,
    IndexedDB: totals.indexeddb_write ?? 0,
    Payload: totals.request_payload_creation ?? 0,
    Upload: totals.network_upload ?? 0,
    AI: totals.ai_response_latency ?? 0,
    Parse: totals.response_parsing ?? 0,
    Render: totals.ui_render_after_response ?? 0,
    TOTAL: totalMs,
    Bottleneck: bottleneck[0],
    BottleneckMs: bottleneck[1],
    BottleneckPercent: `${bottleneckPercent}%`,
    ...data,
    entries: current.entries
  });
}
