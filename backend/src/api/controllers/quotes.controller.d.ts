import type { Request, Response } from "express";
export declare const quotesController: {
    getOne(req: Request, res: Response): Promise<void>;
    getBatch(req: Request, res: Response): Promise<void>;
};
