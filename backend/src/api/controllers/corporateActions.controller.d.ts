import type { Request, Response } from "express";
export declare const corporateActionsController: {
    getForSymbol(req: Request, res: Response): Promise<void>;
    getDividends(req: Request, res: Response): Promise<void>;
    /** GET /dividends/upcoming — market-wide, for the Markets page's
     *  dividend calendar. See getUpcomingDividends for why this is safe to
     *  present as forward-looking. */
    getUpcomingDividends(req: Request, res: Response): Promise<void>;
    /** GET /earnings/recent — market-wide, real reported earnings only,
     *  never predicted ones. See getRecentEarnings. */
    getRecentEarnings(req: Request, res: Response): Promise<void>;
    getEarningsForSymbol(req: Request, res: Response): Promise<void>;
    getOwnership(req: Request, res: Response): Promise<void>;
};
