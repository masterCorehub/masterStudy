export const MIN_WATER_TARGET_ML = 500;
export const MAX_WATER_TARGET_ML = 15000;

export function parseWaterTarget(value) {
  const match = String(value ?? "").trim().match(/^(\d+(?:[.,]\d+)?|[.,]\d+)\s*(ml|l)?$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  const unit = match[2]?.toLowerCase();
  // Preserve the existing shorthand: 4 means liters, 4000 means milliliters.
  const ml = amount * (unit === "l" || (!unit && amount <= 15) ? 1000 : 1);
  if (!Number.isFinite(ml) || ml < MIN_WATER_TARGET_ML || ml > MAX_WATER_TARGET_ML) return null;
  return Math.round(ml);
}

export function waterTrackerForDate(tracker = {}, date) {
  return {
    ...tracker,
    targetMl: tracker.targetMl || 2000,
    cupSizeMl: tracker.cupSizeMl || 250,
    bottleSizeMl: tracker.bottleSizeMl || 500,
    // Freeze legacy timestamps before intake changes updatedAt.
    settingsUpdatedAt: tracker.settingsUpdatedAt ?? tracker.updatedAt ?? 0,
    consumptionUpdatedAt: tracker.consumptionUpdatedAt ?? tracker.updatedAt ?? 0,
    date,
    consumedMl: tracker.date === date ? Number(tracker.consumedMl || 0) : 0,
    lastIntakeAmount: tracker.date === date ? tracker.lastIntakeAmount : undefined,
    lastIntakeAt: tracker.date === date ? tracker.lastIntakeAt : undefined,
  };
}

export function mergeWaterTrackers(local, incoming) {
  if (!incoming) return local;
  if (!local) return incoming;
  const settingsTime = tracker => Number(tracker.settingsUpdatedAt ?? tracker.updatedAt ?? 0);
  const consumptionTime = tracker => Number(tracker.consumptionUpdatedAt ?? tracker.updatedAt ?? 0);
  const settings = settingsTime(incoming) > settingsTime(local) || settingsTime(local) === 0
    ? incoming : local;
  // Daily consumption and permanent settings have independent clocks.
  const consumption = String(incoming.date || "") > String(local.date || "") ||
    (incoming.date === local.date && consumptionTime(incoming) > consumptionTime(local))
    ? incoming : local;
  return {
    ...local,
    ...consumption,
    targetMl: settings.targetMl || 2000,
    cupSizeMl: settings.cupSizeMl || 250,
    bottleSizeMl: settings.bottleSizeMl || 500,
    settingsUpdatedAt: settingsTime(settings),
    consumptionUpdatedAt: consumptionTime(consumption),
    updatedAt: Math.max(Number(local.updatedAt || 0), Number(incoming.updatedAt || 0)),
  };
}
