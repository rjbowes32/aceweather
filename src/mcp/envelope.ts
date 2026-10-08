import { z } from "zod";
import type { ResolvedLocation } from "./locations.ts";

export const CLASSIFICATIONS = ["observation", "reanalysis", "model_current", "model_recent", "forecast", "calculated", "reference", "mixed"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const num = z.number().nullable();

const sourceSchema = z.object({
  name: z.string(),
  classification: z.enum(CLASSIFICATIONS),
  model: z.string().optional(),
  url: z.string().optional(),
  issued_at: z.string().nullable().optional(),
  retrieved_at: z.string(),
  notes: z.string().optional(),
});

export const candidateSchema = z.object({
  name: z.string(), admin1: z.string().nullable(), country: z.string().nullable(), country_code: z.string().nullable(),
  latitude: z.number(), longitude: z.number(), timezone: z.string(), elevation_m: num,
  feature_code: z.string().nullable(), population: num, source: z.string(),
});

export const locationSchema = z.object({
  name: z.string(), latitude: z.number(), longitude: z.number(), timezone: z.string(), elevation_m: num,
  resolution: z.object({
    method: z.enum(["coordinates", "geocoded", "saved_location"]),
    query: z.string().optional(),
    ambiguous: z.boolean().optional(),
    candidates: z.array(candidateSchema).optional(),
    feature_code: z.string().nullable().optional(),
  }),
});

export const periodSchema = z.object({
  period: z.string(), label: z.string(), timezone: z.string(),
  start: z.string().optional(), end: z.string().optional(), days: z.number().optional(),
  hours: z.number().optional(), years_ago: z.number().optional(),
});

export const completenessSchema = z.object({
  expected: z.number(), available: z.number(), missing: z.number(), percent: z.number(),
  missing_dates: z.array(z.string()).optional(), note: z.string().optional(),
});

export type Source = z.infer<typeof sourceSchema>;
export type Completeness = z.infer<typeof completenessSchema>;

export type Envelope = {
  summary: string;
  classification: Classification;
  location?: z.infer<typeof locationSchema>;
  period?: z.infer<typeof periodSchema>;
  units?: Record<string, string>;
  sources: Source[];
  completeness?: Completeness;
  warnings: string[];
  data: Record<string, unknown>;
};

export function envelopeSchema(data: z.ZodType) {
  return z.object({
    tool: z.string(),
    summary: z.string(),
    generated_at: z.string(),
    classification: z.enum(CLASSIFICATIONS),
    location: locationSchema.optional(),
    period: periodSchema.optional(),
    units: z.record(z.string(), z.string()).optional(),
    sources: z.array(sourceSchema),
    completeness: completenessSchema.optional(),
    warnings: z.array(z.string()),
    data,
  });
}

export function locationOut(location: ResolvedLocation): z.infer<typeof locationSchema> {
  const { name, latitude, longitude, timezone, elevation_m, resolution } = location;
  return { name, latitude, longitude, timezone, elevation_m, resolution };
}
