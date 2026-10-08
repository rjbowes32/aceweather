import { fetchMultiModel, type ModelId, type MultiModelPayload } from "../../lib/multi-model.ts";
import { cached } from "../cache.ts";
import type { ResolvedLocation } from "../locations.ts";
import { callUpstream, fetchJson } from "../upstream.ts";

export const MODEL_INFO: Record<ModelId, { name: string; meta: string }> = {
  ecmwf_ifs025: { name: "ECMWF IFS 0.25°", meta: "ecmwf_ifs025" },
  gfs_seamless: { name: "NOAA GFS (seamless)", meta: "ncep_gfs025" },
  icon_seamless: { name: "DWD ICON (seamless)", meta: "dwd_icon" },
  ukmo_seamless: { name: "Met Office UM (seamless)", meta: "ukmo_global_deterministic_10km" },
};

export type ModelRun = { initialised_at: string | null; available_at: string | null };

const iso = (seconds: unknown) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null);

/** Latest run times of a model's global component; null when Open-Meteo does not publish them. */
export function getModelRun(id: ModelId): Promise<ModelRun> {
  return cached(`model-run:${id}`, 30 * 60_000, () =>
    fetchJson("Open-Meteo model metadata", `https://api.open-meteo.com/data/${MODEL_INFO[id].meta}/static/meta.json`)
      .then((meta) => ({ initialised_at: iso(meta?.last_run_initialisation_time), available_at: iso(meta?.last_run_availability_time) }))
      .catch(() => ({ initialised_at: null, available_at: null })));
}

export function getMultiModel(location: ResolvedLocation): Promise<MultiModelPayload> {
  const key = `multi-model:${location.latitude.toFixed(4)},${location.longitude.toFixed(4)},${location.timezone}`;
  return cached(key, 30 * 60_000, () => callUpstream("Open-Meteo multi-model forecast", (signal) =>
    fetchMultiModel(location.latitude, location.longitude, location.timezone, signal)));
}
