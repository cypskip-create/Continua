/**
 * HTTP equivalent of the financials:review / financials:draft /
 * financials:confirm / financials:reject CLI scripts, for review without
 * shell access (see requireAdminKey.ts for the auth model). Same rules,
 * same repository calls, same normalization — this is a different way to
 * drive the exact same workflow, not a looser one. Nothing here guesses a
 * number that ends up written to the database; guessStatementType/
 * mapRowsToFields only produce a pre-filled suggestion for a human to
 * approve or correct in the request body, exactly like the CLI's draft
 * step produces a file for a human to hand-edit.
 */
import type { Request, Response } from "express";
export declare const adminFinancialsController: {
    confirmHistory(req: Request, res: Response): Promise<void>;
    /** GET /admin/financials/candidates?limit=50 — same rows as `npm run financials:review`. */
    listPending(req: Request, res: Response): Promise<void>;
    /** GET /admin/financials/candidates/:id — the candidate PLUS a pre-filled
     *  guess (same logic as `financials:draft`), so the review page can show
     *  a form already populated instead of a human typing every field. */
    getOne(req: Request, res: Response): Promise<void>;
    /** GET /admin/securities?exchange=NSE — for the picker shown when a
     *  candidate has no resolved securityId. */
    listSecurities(req: Request, res: Response): Promise<void>;
    /** POST /admin/financials/candidates/:id/confirm — same write path as
     *  `npm run financials:confirm`, driven by a request body instead of a
     *  JSON file. */
    confirm(req: Request, res: Response): Promise<void>;
    /** POST /admin/financials/candidates/:id/reject — same as `financials:reject`. */
    reject(req: Request, res: Response): Promise<void>;
};
