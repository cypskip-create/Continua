import type { Request, Response } from "express";
/** Lists the full tradable-instrument universe for an exchange. Exists so a
 *  frontend can build its symbol list (watchlist pickers, "all stocks"
 *  pages, screener sector filters) from the Data Layer instead of a
 *  hand-maintained local array that silently drifts out of sync with what
 *  the backend actually has data for. */
export declare const instrumentsController: {
    list(req: Request, res: Response): Promise<void>;
};
