import type { Request, Response } from "express";
export declare const healthController: {
    live(_req:Request,res:Response):Promise<void>;
    check(_req: Request, res: Response): Promise<void>;
};
