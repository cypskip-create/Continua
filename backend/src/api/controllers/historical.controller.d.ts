import type { Request, Response } from "express";
export declare const historicalController: {
    /** Batch recent-closes for list-view sparklines — one request for every
     *  row on a page instead of one request per row. Symbols with no candle
     *  history are simply absent from the response; the frontend renders
     *  that as an empty state, never a fabricated line. */
    getSparklines(req: Request, res: Response): Promise<void>;
    getCandles(req: Request, res: Response): Promise<void>;
    getPerformance(req: Request, res: Response): Promise<void>;
};
