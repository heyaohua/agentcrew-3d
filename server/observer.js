"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {createHash, randomBytes, timingSafeEqual} = require("node:crypto");
const {createLifecycleReader}=require("./observer-codex-lifecycle");
const {probeProcess}=require("./observer-process");
const SETTLED=new Set(["ended","interrupted","error","closed"]);
const STALE_MS = 120000;
const EVENTS = new Set(["SessionStart","UserPromptSubmit","PreToolUse","PostToolUse","PostToolUseFailure","PermissionRequest","PermissionResolved","Stop","StopFailure","Interrupt","SessionEnd","Elicitation","ElicitationResult","SubagentStart","SubagentStop"]);
const TOOLS = new Set(["codex","claude","kimi","dsh"]);
function field(value, max, required=false) {
  if(value === undefined || value === null) { if(required) throw new Error("Missing field"); return ""; }
  if(typeof value !== "string" || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Invalid field");
  const result=value.trim(); if(required && !result) throw new Error("Empty field"); return result;
}
function normalizeEvent(input) {
  if(!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid event");
  const tool=field(input.tool,16,true), event=field(input.event,40,true);
  if(!TOOLS.has(tool) || !EVENTS.has(event)) throw new Error("Unsupported event");
  const occurredAt = input.occurredAt;
  if(occurredAt !== undefined && (!Number.isSafeInteger(occurredAt) || occurredAt < 0)) throw new Error("Invalid timestamp");
  const agentId=field(input.agentId,200),agentType=field(input.agentType,100);
  if(event.startsWith("Subagent")&&!agentId)throw new Error("Subagent identity required");
  let processInfo;
  if(input.processInfo!==undefined){
    const p=input.processInfo;
    if(!p || !Number.isSafeInteger(p.pid)||p.pid<2)throw new Error("Invalid process identity");
    processInfo={pid:p.pid,start:field(p.start,100,true)};
  }
  return {agentId,agentType,...(processInfo?{processInfo}:{}),tool,event,sessionId:field(input.sessionId,200,true),project:field(input.project,4096,true),
    toolName:field(input.toolName,100),toolUseId:field(input.toolUseId,200),eventId:field(input.eventId,100),...(occurredAt === undefined ? {} : {occurredAt})};
}
function atomicJson(file,value) {
  const temp=file+".tmp"; fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600});fs.renameSync(temp,file);
}
function isLoopback(value) {return ["127.0.0.1","::1","::ffff:127.0.0.1"].includes(value);}
function createObserver({stateDir=process.env.OBSERVER_STATE_DIR || path.join(os.homedir(),".hermes3d-observer"),token,now=Date.now,publicReadOnly=false,processProbe=probeProcess,lifecycleReader=createLifecycleReader()}={}) {
  fs.mkdirSync(stateDir,{recursive:true,mode:0o700});
  const tokenPath=path.join(stateDir,"receiver-token");
  if(!token) {
    try {token=fs.readFileSync(tokenPath,"utf8").trim();} catch(e) {if(e.code !== "ENOENT") throw e;}
    if(!token) {token=randomBytes(32).toString("hex");fs.writeFileSync(tokenPath,token,{mode:0o600});}
  }
  const snapshotPath=path.join(stateDir,"sessions.json");
  const sessions = new Map();const seen=new Set();
  try {
    const saved=JSON.parse(fs.readFileSync(snapshotPath,"utf8"));
    for(const s of (Array.isArray(saved)?saved:[]).slice(-200)) {
      const e=normalizeEvent({tool:s.tool,sessionId:s.sessionId,project:s.project,event:s.lastEvent,toolName:s.toolName,agentId:s.agentId,agentType:s.agentType,processInfo:s.processInfo});
      if(!["ready","working","waiting","ended","interrupted","error","closed"].includes(s.state) || !Number.isFinite(s.updatedAt)) continue;
      const id=identity(e);
      sessions.set(id,{id,...e,state:s.state,reason:typeof s.reason==="string"?field(s.reason,140):"",updatedAt:s.updatedAt,occurredAt:s.occurredAt || s.updatedAt,lastEvent:e.event,pending:Array.isArray(s.pending)?s.pending.slice(0,100).map(p=>({key:field(p.key,240,true),toolName:field(p.toolName,100),reason:p.reason==="question"?"question":"permission"})):[],events:[],lifecycle:validLifecycle(s.lifecycle),restored:true});
    }
  } catch(e) {if(e.code !== "ENOENT") console.warn("[observer] Previous metadata snapshot unavailable; waiting for new events.");}
  function identity(e){return createHash("sha256").update(JSON.stringify(e.agentId?[e.tool,e.sessionId,e.agentId]:[e.tool,e.sessionId])).digest("hex").slice(0,24);}
  function validLifecycle(value){
    return value&&["task_started","task_complete","turn_aborted"].includes(value.event)&&Number.isSafeInteger(value.at)&&value.at>=0&&value.at<=now()+30000
      ? {event:value.event,at:value.at,turnId:typeof value.turnId==="string"?value.turnId.slice(0,200):""}:null;
  }
  function withLifecycle(saved){
    if(!saved)return saved;
    const read=saved.tool==="codex"?validLifecycle(lifecycleReader(saved.agentId||saved.sessionId)):null;
    if(read&&(!saved.lifecycle||read.at>saved.lifecycle.at))saved.lifecycle=read;
    const lifecycle=saved.lifecycle;
    if(lifecycle&&lifecycle.at>saved.occurredAt){
      const state={task_started:"working",task_complete:"ended",turn_aborted:"interrupted"}[lifecycle.event];
      if(state)return {...saved,state,reason:"",pending:[],updatedAt:lifecycle.at,occurredAt:lifecycle.at,lastEvent:lifecycle.event,events:[...(saved.events||[]),{event:lifecycle.event,toolName:"",at:lifecycle.at}].slice(-12),restored:false,source:"codex-lifecycle"};
    }
    return saved;
  }
  function snapshot() {
    const time=now();let lifecycleChanged=false;
    const list=[...sessions.values()].map(saved=>{
      const before=saved.lifecycle;
      const s=withLifecycle(saved);
      if(saved.lifecycle!==before)lifecycleChanged=true;
      const alive=processProbe(s.processInfo),silent=time-s.updatedAt>STALE_MS;
      const freshness=SETTLED.has(s.state)?"settled":s.restored||alive===false?"unknown":!silent?"fresh":alive===true?"process":"unknown";
      const {processInfo,lifecycle:storedLifecycle,...publicSession}=s;
      return {...publicSession,parentId:s.agentId?identity({tool:s.tool,sessionId:s.sessionId}):null,
        freshness,processAlive:alive,silent,stale:freshness==="unknown"};
    });
    if(lifecycleChanged)atomicJson(snapshotPath,[...sessions.values()]);
    for(const s of list)if(s.agentId){
      const parent=list.find(p=>p.tool===s.tool&&p.agentId===s.sessionId);
      if(parent)s.parentId=parent.id;
    }
    for(const s of list)s.activeChildren=list.filter(c=>c.parentId===s.id&&c.state==="working"&&!c.stale).length;
    return {generatedAt:time,staleAfterMs:STALE_MS,publicReadOnly,sessions:list.sort((a,b)=>b.updatedAt-a.updatedAt)};
  }
  function ingest(input) {
    const e=normalizeEvent(input);
    // Some Codex tool hooks identify the child thread directly. Reuse the
    // lifecycle identity instead of creating a second main-session actor.
    if(e.tool==="codex"&&!e.agentId){
      const child=[...sessions.values()].find(s=>s.tool===e.tool&&s.agentId===e.sessionId);
      if(child){e.agentId=child.agentId;e.sessionId=child.sessionId;e.agentType=child.agentType;}
    }
    const id=identity(e),time=now();
    if(e.occurredAt !== undefined && e.occurredAt > time+30000) throw new Error("Future event");
    let previous=sessions.get(id);
    const legacyId=e.agentId?identity({tool:e.tool,sessionId:e.agentId}):null;
    const legacy=legacyId&&legacyId!==id?sessions.get(legacyId):null;
    if(legacy){
      if(!previous||legacy.occurredAt>previous.occurredAt)previous={...legacy,id,sessionId:e.sessionId,agentId:e.agentId,agentType:e.agentType};
      sessions.delete(legacyId);sessions.set(id,previous);
      atomicJson(snapshotPath,[...sessions.values()]);
    }
    previous=withLifecycle(previous);
    const eventTime=e.occurredAt ?? time;
    const dedupKey=e.eventId ? id+":"+e.eventId : "";
    if((dedupKey && seen.has(dedupKey)) || (previous && eventTime<previous.occurredAt)) return {accepted:false};
    if(dedupKey) {seen.add(dedupKey);if(seen.size>4000)seen.delete(seen.values().next().value);}
    let state=previous?.state || "ready",reason=previous?.reason || "";
    let pending=[...(previous?.pending || [])];
    const key=e.toolUseId ? "id:"+e.toolUseId : "tool:"+e.toolName;
    const addWait=(kind)=>{
      pending=pending.filter(p=>p.key!==key);
      pending.push({key,toolName:e.toolName,reason:kind});
      pending=pending.slice(-100);
    };
    const resolveTool=()=>{pending=pending.filter(p=>p.key!==key && !(e.toolUseId&&p.key==="tool:"+e.toolName));};
    switch(e.event) {
      case "SessionStart": state="ready";reason="";pending=[];break;
      case "SubagentStart":
      case "UserPromptSubmit":state="working";reason="";pending=[];break;
      case "PermissionResolved":
      case "PostToolUse":resolveTool();state="working";reason="";break;
      case "ElicitationResult":pending=pending.filter(p=>p.reason!=="question");state="working";reason="";break;
      case "PreToolUse":
        if(["AskUserQuestion","AskUser","ask_user","request_user_input","functions.request_user_input"].includes(e.toolName)) addWait("question");
        else if(state !== "waiting"){state="working";reason="";}
        break;
      case "PermissionRequest":addWait("permission");break;
      case "Elicitation":addWait("question");break;
      case "PostToolUseFailure":resolveTool();state="error";reason="failure";break;
      case "StopFailure":state="error";reason="failure";pending=[];break;
      case "SubagentStop":
      case "Stop":state="ended";reason="";pending=[];break;
      case "Interrupt":state="interrupted";reason="";pending=[];break;
      case "SessionEnd":state="closed";reason="";pending=[];break;
    }
    if(pending.length){state="waiting";reason=pending[0].reason;}
    const s={id,tool:e.tool,sessionId:e.sessionId,agentId:e.agentId,agentType:e.agentType||previous?.agentType||"",processInfo:e.processInfo||previous?.processInfo,lifecycle:previous?.lifecycle,project:e.project,toolName:pending[0]?.toolName || e.toolName,pending,state,reason,lastEvent:e.event,updatedAt:time,occurredAt:eventTime,restored:false,
      events:[...(previous?.events || []),{event:e.event,toolName:e.toolName,at:time}].slice(-12)};
    sessions.delete(id);sessions.set(id,s);
    while(sessions.size>200)sessions.delete(sessions.keys().next().value);
    atomicJson(snapshotPath,[...sessions.values()]);
    return {accepted:true,id};
  }
  function json(res,status,data){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data));}
  function handleHttp(req,res) {
    const pathname=(req.url || "").split("?")[0];
    if(!["/api/observer/events","/api/observer/state"].includes(pathname))return false;
    // The enclosing Studio access gate protects display reads; ingestion also requires a local peer and dedicated token.
    if(pathname.endsWith("/state")) {if(req.method !== "GET")json(res,405,{error:"Read only"});else json(res,200,snapshot());return true;}
    if(req.method !== "POST") {json(res,405,{error:"POST required"});return true;}
    if(!isLoopback(req.socket.remoteAddress) || req.headers.origin || req.headers["x-forwarded-for"]) {json(res,403,{error:"Local hook requests only"});return true;}
    const actual=Buffer.from(req.headers.authorization || ""),expected=Buffer.from("Bearer "+token);
    if(actual.length !== expected.length || !timingSafeEqual(actual,expected)) {json(res,401,{error:"Invalid observer token"});return true;}
    if(!String(req.headers["content-type"] || "").startsWith("application/json")) {json(res,415,{error:"JSON required"});return true;}
    let size=0,chunks=[],done=false;
    if(Number(req.headers["content-length"])>16384) {json(res,413,{error:"Event too large"});req.resume();return true;}
    req.setTimeout(2000,()=>{if(!done){done=true;json(res,408,{error:"Event timeout"});}req.destroy();});
    req.on("data",chunk=>{if(done)return;size+=chunk.length;if(size>16384){done=true;json(res,413,{error:"Event too large"});return;}chunks.push(chunk);});
    req.on("end",()=>{req.setTimeout(0);if(done)return;done=true;try{json(res,202,ingest(JSON.parse(Buffer.concat(chunks).toString("utf8"))));}catch{json(res,400,{error:"Invalid observer event"});}});
    req.on("error",()=>{done=true;});
    return true;
  }
  function configureConnection(url) {const u=new URL(url);if(!["127.0.0.1","localhost","[::1]"].includes(u.hostname))throw new Error("Loopback required");atomicJson(path.join(stateDir,"connection.json"),{url:u.toString(),token});}
  return {ingest,snapshot,handleHttp,configureConnection};
}
module.exports={createObserver,normalizeEvent};
