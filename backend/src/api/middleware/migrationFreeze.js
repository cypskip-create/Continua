export function migrationFreeze(enabled){
 return (req,res,next)=>{
  if(!enabled||req.path==='/api/v1/health/live')return next();
  res.set('Cache-Control','no-store');res.set('Retry-After','60');
  return res.status(503).json({error:'Continua is completing a database migration. Please retry shortly.',code:'MIGRATION_MAINTENANCE'});
 };
}
