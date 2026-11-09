"use strict";
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto');
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const EVENTS=new Set(['task_started','task_complete','turn_aborted']);
/** Compatibility for already-running Codex sessions which cached old hooks.
 * Only indexed UUID files for sessions already known to the observer are read.
 * No prompt, message, tool input, or tool output is retained or returned. */
function createLifecycleReader(root=path.join(os.homedir(),'.codex','sessions')){
 const files=new Map(),cache=new Map();let indexedAt=0;
 function index(){
  files.clear();
  function walk(dir,depth){
   if(depth>4)return;
   let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
   for(const entry of entries){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())walk(file,depth+1);
    else if(entry.isFile()){
     const match=entry.name.match(/-([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.jsonl$/i);
     if(match)files.set(match[1],file);
    }
   }
  }
  walk(root,0);indexedAt=Date.now();
 }
 return id=>{
  if(typeof id!=='string'||!UUID.test(id))return null;
  if(!indexedAt||Date.now()-indexedAt>10000)index();
  const file=files.get(id);if(!file)return null;
  let fd;
  try{
   const stat=fs.statSync(file),previous=cache.get(id);
   if(previous?.ino===stat.ino&&previous?.dev===stat.dev&&previous?.size===stat.size&&previous?.mtime===stat.mtimeMs)return previous.value;
   const length=Math.min(stat.size,512*1024),start=stat.size-length,buffer=Buffer.alloc(length);
   fd=fs.openSync(file,'r');fs.readSync(fd,buffer,0,length,start);
   let lines=buffer.toString('utf8').split('\n');if(start)lines=lines.slice(1);
   let value=null;
   if(previous&&previous.ino===stat.ino&&previous.dev===stat.dev&&stat.size>=previous.size){
    const anchor=Buffer.alloc(Math.min(64,previous.size));
    fs.readSync(fd,anchor,0,anchor.length,previous.size-anchor.length);
    if(digest(anchor)===previous.anchorHash)value=previous.value;
   }
   for(const line of lines){
    if(!/"type"\s*:\s*"event_msg"/.test(line)||!/"type"\s*:\s*"(?:task_started|task_complete|turn_aborted)"/.test(line))continue;
    try{
     const record=JSON.parse(line),payload=record.payload;
     if(record.type!=='event_msg'||!EVENTS.has(payload?.type))continue;
     const at=Date.parse(record.timestamp);
     if(!Number.isFinite(at)||at>Date.now()+30000)continue;
     if(!value||at>=value.at)value={event:payload.type,at,turnId:typeof payload.turn_id==='string'?payload.turn_id.slice(0,200):''};
    }catch{/* A writer may still be appending the final line. */}
   }
   cache.set(id,{ino:stat.ino,dev:stat.dev,size:stat.size,mtime:stat.mtimeMs,anchorHash:digest(buffer.subarray(-64)),value});if(cache.size>400)cache.delete(cache.keys().next().value);
   return value;
  }catch{return null;}finally{if(fd!==undefined)fs.closeSync(fd);}
 };
}
module.exports={createLifecycleReader};
