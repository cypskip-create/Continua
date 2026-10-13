import type { Request, Response } from "express";
export declare const financialsController: {
    getLatest(req: Request, res: Response): Promise<void>;
    getHistory(req: Request, res: Response): Promise<void>;
};
