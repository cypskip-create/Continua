import type { Request, Response } from "express";
export declare const indicesController: {
    list(req: Request, res: Response): Promise<void>;
};
export declare const indicesRoutes: import("express-serve-static-core").Router;
