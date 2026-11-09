"use strict";
const {execFileSync}=require('node:child_process');
const cache=new Map();
/** Exact PID + start-time match prevents PID reuse from extending a dead turn.
 * Process existence alone never changes a session's last hook-reported state. */
function probeProcess(info){
 if(!info)return null;
 const key=info.pid+':'+info.start,previous=cache.get(key),now=Date.now();
 if(previous&&now-previous.at<5000)return previous.alive;
 let alive=null;
 try{
  const actual=execFileSync('/bin/ps',['-p',String(info.pid),'-o','lstart='],{encoding:'utf8',timeout:300,stdio:['ignore','pipe','ignore']}).trim().replace(/\s+/g,' ');
  alive=actual===info.start;
 }catch(error){if(error.status===1)alive=false;}
 cache.set(key,{at:now,alive});if(cache.size>400)cache.delete(cache.keys().next().value);
 return alive;
}
module.exports={probeProcess};
