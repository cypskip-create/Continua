import {query} from '../../storage/db.js';
import {ApiError} from '../middleware/errorHandler.js';
import { Router } from "express";
import { adminFinancialsController } from "../controllers/adminFinancials.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
export const adminFinancialsRoutes = Router();
adminFinancialsRoutes.get("/financials/candidates", asyncHandler(adminFinancialsController.listPending));
adminFinancialsRoutes.get("/financials/candidates/:id", asyncHandler(adminFinancialsController.getOne));
adminFinancialsRoutes.post("/financials/candidates/:id/confirm", asyncHandler(adminFinancialsController.confirm));
adminFinancialsRoutes.post("/financials/candidates/:id/confirm-history", asyncHandler(adminFinancialsController.confirmHistory));
adminFinancialsRoutes.post("/financials/candidates/:id/reject", asyncHandler(adminFinancialsController.reject));
adminFinancialsRoutes.get("/securities", asyncHandler(adminFinancialsController.listSecurities));

// Mounted exclusively behind adminRateLimit and requireAdminKey in server.js.
adminFinancialsRoutes.get('/models',asyncHandler(async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({data:(await query('SELECT payload FROM market.quantitative_dashboard() payload')).rows.map(row=>row.payload)});}));
adminFinancialsRoutes.post('/models/:id/status',asyncHandler(async(req,res)=>{
 const {version,status}=req.body??{};
 if(typeof version!=='string'||version.length>100||!['research','review-required','disabled'].includes(status))throw new ApiError(400,'Explicit model version and status required.');
 const result=await query('UPDATE market.quantitative_models SET status=$1 WHERE id=$2 AND version=$3 RETURNING id,version,status',[status,req.params.id,version]);
 if(!result.rows.length)throw new ApiError(404,'Model version not found.');res.json({data:result.rows[0]});
}));
adminFinancialsRoutes.get('/relationships/pending',asyncHandler(async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({data:(await query("SELECT e.*,a.document_url AS source_url FROM market.exposure_relationships e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id WHERE verification='pending' ORDER BY ingested_at LIMIT 100")).rows});}));
adminFinancialsRoutes.post('/relationships/:id/review',asyncHandler(async(req,res)=>{
 const {verification,note}=req.body??{};
 if(!['verified','rejected'].includes(verification)||typeof note!=='string'||note.trim().length<10||note.length>1000)throw new ApiError(400,'Explicit verification and review note required.');
 const rows=await query("UPDATE market.exposure_relationships e SET verification=$1,reviewed_at=now(),review_note=$2 FROM scraping.raw_artifacts a JOIN scraping.sources s ON s.id=a.source_id WHERE e.id=$3 AND e.artifact_id=a.id AND ( $1='rejected' OR s.enabled AND s.redistribution_allowed=true AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200) RETURNING e.id,e.verification",[verification,note.trim(),req.params.id]);
 if(!rows.rows.length)throw new ApiError(422,'Relationship missing or source publication rights unavailable.');res.json({data:rows.rows[0]});
}));
