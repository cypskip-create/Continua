import { z } from "zod";
export const EnginePreferencesSchema = z.object({
  goal:z.enum(["Balanced","Income","Growth","Capital preservation","Short-term trading"]).default("Balanced"),
  horizon:z.enum(["under_1_year","1_to_5_years","over_5_years"]).default("1_to_5_years"),
  experience:z.enum(["beginner","intermediate","experienced"]).default("beginner"),
  riskComfort:z.enum(["unspecified","lower","moderate","higher"]).default("unspecified"),
  incomeNeeds:z.enum(["none","occasional","regular"]).default("none"),
  sectors:z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  notifications:z.boolean().default(true),
  learnInterests:z.boolean().default(false),
  interests:z.array(z.object({symbol:z.string().regex(/^[A-Z0-9.\-]{1,20}$/),exchange:z.string().max(10),visits:z.number().int().min(0).max(10000)})).max(30).default([]),
}).strict();
export type EnginePreferences = z.infer<typeof EnginePreferencesSchema>;
export const defaultPreferences = () => EnginePreferencesSchema.parse({});
