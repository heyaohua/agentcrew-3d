/** Native Cordis observer. No tool interception, model calls, or approval decisions. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {randomUUID} from 'node:crypto';

const clean=(s,n)=>typeof s==='string'&&s.length>0&&s.length<=n&&!/[\x00-\x1f\x7f]/.test(s)?s:undefined;
export const inject=['sessions','agents'];
export function runtimeParent(agents,session){
 const parentId=clean(session?.header?.parentSession,200);
 if(session?.header?.origin!=='subagent'||!parentId)return undefined;
 const parent=agents?.get?.(parentId);
 return parent&&agents?.isOwnedBy?.(session.id,parent)?parentId:undefined;
}
export function createMapper(){
 const records=new WeakMap();
 const map=(session,e,{parentId}={})=>{
  const id=clean(session?.id,200),project=clean(session?.header?.cwd,4096);
  if(!id||!Number.isSafeInteger(e?.seq)||!Number.isSafeInteger(e?.time))return null;
  let record=records.get(session);if(!record){record={calls:new Map(),approvals:new Map(),cwd:project};records.set(session,record);}
  const d=e.data??{};let event,toolName='',toolUseId='';
  if(e.type==='working-directory/change'){const cwd=clean(d.cwd,4096);if(cwd)record.cwd=cwd;return null;}
  if(!record.cwd)return null;
  switch(e.type){
   case 'turn/start':event='UserPromptSubmit';record.calls.clear();record.approvals.clear();break;
   case 'step/start':event='PreToolUse';break;
   case 'turn/end':
    if(d.reason?.kind==='completed')event='Stop';
    else if(d.reason?.kind==='aborted')event='Interrupt';
    else if(['error','blocked','max-tokens'].includes(d.reason?.kind))event='StopFailure';
    else return null;
    record.calls.clear();record.approvals.clear();break;
   case 'tool/call':
    toolName=clean(d.name,100);toolUseId=clean(d.callId,200);if(!toolName||!toolUseId)return null;
    if(record.calls.size>=500)return null;
    record.calls.set(toolUseId,toolName);event=toolName==='ask_user_question'?'Elicitation':'PreToolUse';break;
   case 'tool/result':
    toolUseId=clean(d.message?.toolCallId,200);toolName=record.calls.get(toolUseId);if(!toolName)return null;
    event=d.message.isError?'PostToolUseFailure':'PostToolUse';record.calls.delete(toolUseId);break;
   case 'approval/asked':
    toolUseId=clean(d.id,150);toolName=clean(d.toolName,100);if(!toolUseId||!toolName)return null;
    if(record.approvals.size>=500)return null;
    record.approvals.set(toolUseId,toolName);toolUseId='approval:'+toolUseId;event='PermissionRequest';break;
   case 'approval/decided':
    toolUseId=clean(d.id,150);toolName=record.approvals.get(toolUseId);if(!toolName)return null;
    if(!['allowed-once','rejected','cancelled','unavailable'].includes(d.outcome))return null;
    record.approvals.delete(toolUseId);toolUseId='approval:'+toolUseId;event='PermissionResolved';break;
   default:return null;
  }
  const parent=clean(parentId,200);
  const result={tool:'dsh',sessionId:parent??id,agentId:parent?id:'',agentType:parent?'DSH 子 Agent':'',project:record.cwd,event,toolName,toolUseId,occurredAt:e.time,eventId:randomUUID()};
  record.last=result;return result;
 };
 map.close=session=>{
  const record=records.get(session);records.delete(session);
  return record?.last?{...record.last,event:'SessionEnd',toolName:'',toolUseId:'',occurredAt:Date.now(),eventId:randomUUID()}:null;
 };
 return map;
}
export async function deliver(event,stateDir,signal){
 const config=JSON.parse(await readFile(join(stateDir,'connection.json'),'utf8'));
 const url=new URL(config.url);
 if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/api/observer/events'||url.username||url.password||url.search||url.hash)throw Error('Not a loopback receiver');
 if(typeof config.token!=='string'||!config.token)throw Error('No receiver token');
 const body=JSON.stringify(event);
 await new Promise((resolve,reject)=>{
  const req=(url.protocol==='https:'?https:http).request(url,{method:'POST',agent:false,signal,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),Authorization:'Bearer '+config.token}},res=>{res.on('error',reject);res.resume();res.on('end',()=>res.statusCode===202?resolve():reject(Error('Receiver unavailable')));});
  const timer=setTimeout(()=>req.destroy(Error('Receiver timeout')),600);
  req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end(body);
 });
}
export function apply(ctx,config={}){
 const stateDir=config.stateDir||join(homedir(),'.hermes3d-observer');const map=createMapper();
 const queue=[];let draining=false,stopped=false;const controller=new AbortController();
 const status={version:'0.1.0',startedAt:Date.now(),received:0,delivered:0,failed:0,dropped:0};
 let statusWriting=false,statusDirty=false;
 const save=()=>{
  statusDirty=true;if(statusWriting)return;statusWriting=true;
  void (async()=>{try{
   await mkdir(stateDir,{recursive:true,mode:0o700});
   while(statusDirty){statusDirty=false;await writeFile(join(stateDir,'dsh-plugin-status.json'),JSON.stringify(status),{mode:0o600});}
  }catch{/* Diagnostics must never interrupt an agent. */}finally{statusWriting=false;}})();
 };
 async function drain(){
  if(draining)return;draining=true;
  while(queue.length&&!stopped){const event=queue.shift();try{await deliver(event,stateDir,controller.signal);status.delivered++;status.lastDeliveredAt=Date.now();}catch{status.failed++;}save();}
  draining=false;
 }
 const enqueue=normalized=>{
  if(!normalized||stopped)return;
  status.received++;if(queue.length>=256){status.dropped++;save();return;}
  queue.push(normalized);void drain();
 };
 ctx.on('session/event',(session,event)=>{
  if(stopped)return;
  try{
   enqueue(map(session,event,{parentId:runtimeParent(ctx.get?.('agents'),session)}));
  }catch{status.failed++;save();}
 },{global:true});
 ctx.on('session/disposed',session=>{try{enqueue(map.close(session));}catch{status.failed++;save();}},{global:true});
 ctx.on('dispose',()=>{stopped=true;queue.length=0;controller.abort();status.stoppedAt=Date.now();save();});
 save();
}
