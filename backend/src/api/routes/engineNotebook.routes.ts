import { Router } from "express";
import { z } from "zod";
import { requirePremiumPlus } from "../middleware/requireSubscriber.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { query, withTransaction } from "../../storage/db.js";
import {
  ForecastCreateSchema,
  ForecastRevisionSchema,
  ForecastResolutionSchema,
  canReviseForecast,
  privateCalibration,
  type NotebookForecast,
} from "../../services/research/forecastNotebook.js";
export const engineNotebookRoutes = Router();
const parse = <S extends z.ZodTypeAny>(schema: S, v: unknown): z.output<S> => {
  const r = schema.safeParse(v);
  if (!r.success)
    throw new ApiError(
      400,
      "Invalid forecast input: " +
        r.error.issues.map((i) => i.message).join(", "),
    );
  return r.data;
};
engineNotebookRoutes.use("/engine/notebook", requirePremiumPlus);
engineNotebookRoutes.get(
  "/engine/notebook",
  asyncHandler(async (_req, res) => {
    const rows = (
      await query<NotebookForecast>(
        "SELECT * FROM market.engine_forecast_notebook WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
        [res.locals.engineUserId],
      )
    ).rows;
    res.json({
      data: { forecasts: rows, calibration: privateCalibration(rows) },
    });
  }),
);
engineNotebookRoutes.post(
  "/engine/notebook",
  asyncHandler(async (req, res) => {
    const b = parse(ForecastCreateSchema, req.body),
      owner = String(res.locals.engineUserId);
    const saved = await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "forecast-notebook:" + owner,
      ]);
      const count = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM market.engine_forecast_notebook WHERE user_id=$1",
        [owner],
      );
      if (count.rows[0]!.count >= 100)
        throw new ApiError(
          400,
          "Maximum 100 private research questions per account.",
        );
      const security = await client.query(
        "SELECT id FROM market.securities WHERE id=$1 AND status='active'",
        ["NSE:" + b.symbol],
      );
      if (!security.rows.length)
        throw new ApiError(400, "Select an active NSE company.");
      const revision = {
        at: new Date().toISOString(),
        probability: b.probability,
        rationale: b.rationale,
      };
      return (
        await client.query(
          "INSERT INTO market.engine_forecast_notebook(user_id,security_id,symbol,question,rules,deadline,probability,revisions) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *",
          [
            owner,
            "NSE:" + b.symbol,
            b.symbol,
            b.question,
            b.rules,
            b.deadline,
            b.probability,
            JSON.stringify([revision]),
          ],
        )
      ).rows[0];
    });
    res.status(201).json({ data: saved });
  }),
);
engineNotebookRoutes.post(
  "/engine/notebook/:id/:action",
  asyncHandler(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id),
      action = parse(z.enum(["revise", "resolve"]), req.params.action);
    const body =
      action === "revise"
        ? parse(ForecastRevisionSchema, req.body)
        : parse(ForecastResolutionSchema, req.body);
    const saved = await withTransaction(async (client) => {
      const row = (
        await client.query<NotebookForecast>(
          "SELECT * FROM market.engine_forecast_notebook WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, res.locals.engineUserId],
        )
      ).rows[0];
      if (!row) throw new ApiError(404, "Research question not found.");
      if (action === "revise" && "probability" in body) {
        if (!canReviseForecast(row))
          throw new ApiError(
            409,
            "Probability revisions close at the deadline; resolved questions cannot change.",
          );
        if (row.revisions.length >= 100)
          throw new ApiError(400, "Maximum 100 revisions per question.");
        const revisions = [
          ...row.revisions,
          { at: new Date().toISOString(), ...body },
        ];
        return (
          await client.query(
            "UPDATE market.engine_forecast_notebook SET probability=$1,revisions=$2::jsonb WHERE id=$3 RETURNING *",
            [body.probability, JSON.stringify(revisions), id],
          )
        ).rows[0];
      }
      if (!("outcome" in body))
        throw new ApiError(400, "Resolution outcome required.");
      if (row.status !== "open" || Date.parse(row.deadline) > Date.now())
        throw new ApiError(
          409,
          "Resolve only after the deadline. Resolution cannot be edited.",
        );
      return (
        await client.query(
          "UPDATE market.engine_forecast_notebook SET status=$1,outcome=$2,resolution_source=$3,resolution_note=$4,resolved_at=now() WHERE id=$5 RETURNING *",
          [
            body.outcome === "void" ? "void" : "resolved",
            body.outcome === "void" ? null : body.outcome === "yes",
            body.sourceUrl,
            body.note,
            id,
          ],
        )
      ).rows[0];
    });
    res.json({ data: saved });
  }),
);
