import {ApiError} from '../../api/middleware/errorHandler.js';
export class CalculationQueue{
 constructor({concurrency=2,maximumWaiting=8,waitMs=15000}={}){this.concurrency=concurrency;this.maximumWaiting=maximumWaiting;this.waitMs=waitMs;this.active=0;this.waiting=[];}
 run(task,{priority=false}={}){
  if(this.active>=this.concurrency&&this.waiting.length>=(priority?this.maximumWaiting:Math.max(1,this.maximumWaiting-2)))return Promise.reject(new ApiError(503,'Analysis is busy. Please retry shortly.'));
  return new Promise((resolve,reject)=>{
   const job={task,resolve,reject,priority,timer:null};
   if(this.active<this.concurrency){this.start(job);return;}
   job.timer=setTimeout(()=>{const index=this.waiting.indexOf(job);if(index>=0){this.waiting.splice(index,1);reject(new ApiError(503,'Analysis is busy. Please retry shortly.'));}},this.waitMs);
   const firstNormal=this.waiting.findIndex(item=>!item.priority);
   if(priority&&firstNormal>=0)this.waiting.splice(firstNormal,0,job);else this.waiting.push(job);
  });
 }
 start(job){
  clearTimeout(job.timer);this.active++;
  Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{
   this.active--;const next=this.waiting.shift();if(next)this.start(next);
  });
 }
}
