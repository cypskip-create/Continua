import cron from 'node-cron';
import {getIdentityRuntime} from '../auth/runtime.js';
import {runOwnedAlertSweep,expireOwnedMemberships} from '../data/alertSweep.js';
import {indicatorsService} from '../services/technical/indicatorsService.js';
import {logger} from '../monitoring/logger.js';

export async function runOwnedApplicationJobs({sweep=true}={}){
 const runtime=getIdentityRuntime();if(!runtime)return {enabled:false};
 await expireOwnedMemberships(runtime.database);
 const alerts=sweep?await runOwnedAlertSweep({database:runtime.database,computeIndicator:request=>indicatorsService.compute(request)}):null;
 return {enabled:true,alerts};
}
export function startOwnedApplicationWorker(){
 if(!getIdentityRuntime())return {stop(){}};
 const task=cron.schedule('* * * * *',async()=>{
  try{const result=await runOwnedApplicationJobs({sweep:new Date().getUTCMinutes()%5===0});logger.info({component:'owned-application-jobs',...result},'Application maintenance completed');}
  catch{logger.error({component:'owned-application-jobs'},'Application maintenance failed; retry on next scheduled tick');}
 },{timezone:'UTC',noOverlap:true});
 return task;
}
