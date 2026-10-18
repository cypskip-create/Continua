import type {Request,Response,RequestHandler} from 'express';
export declare function edgeClientIdentity(secret?:string):RequestHandler;
export declare function rateLimitClientIP(req:Request,res:Response):string;
