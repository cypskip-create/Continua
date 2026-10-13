import type { Request, Response } from "express";
export declare const newsController: {
    /** GET /api/v1/news — the Media/TradersHub feed: everything recent, optionally filtered by category. */
    listRecent(req: Request, res: Response): Promise<void>;
    /** GET /api/v1/news/item/:id — full in-app reader payload. */
    getById(req: Request, res: Response): Promise<void>;
    /** GET /api/v1/news/:symbol — news mentioning one specific security, for the stock research page. */
    getForSymbol(req: Request, res: Response): Promise<void>;
};
