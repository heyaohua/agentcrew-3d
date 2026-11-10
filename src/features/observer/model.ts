import type {OfficeAgent} from "@/features/retro-office/core/types";
export type ObserverSession = {
 source?:"codex-lifecycle";
 agentId?:string;agentType?:string;parentId?:string|null;activeChildren?:number;
 freshness?:"fresh"|"process"|"unknown"|"settled";processAlive?:boolean|null;silent?:boolean;
 id:string; tool:"codex"|"claude"|"kimi"|"dsh"; sessionId:string; project:string;
 state:"ready"|"working"|"waiting"|"ended"|"interrupted"|"error"|"closed";
 reason:string; toolName:string; lastEvent:string; updatedAt:number; stale:boolean; restored:boolean;
 events:Array<{event:string;toolName:string;at:number}>;
};
export type ObserverSnapshot = {sessions:ObserverSession[];generatedAt:number;staleAfterMs:number;publicReadOnly?:boolean};
export const TOOL_NAMES = {codex:"Codex",claude:"Claude Code",kimi:"Kimi Code",dsh:"DSH"};
const COLORS = {codex:"#62d6b6",claude:"#e7a27c",kimi:"#99a7ff",dsh:"#6aa9f8"};
const LABELS = {ready:"已就绪",working:"正在工作",waiting:"等待你确认",ended:"本轮已结束",interrupted:"已中断",error:"报告错误",closed:"会话已关闭"};
export function buildObserverView(sessions:ObserverSession[],options:{online:boolean;now:number;staleAfterMs:number;hideEnded:boolean;seatById?:Map<string,number>}){
 const seats=options.seatById ?? new Map<string,number>();
 const rows=sessions.filter(s=>!options.hideEnded || !["ended","interrupted","closed"].includes(s.state)).map(s=>{
  const uncertain=!options.online || (s.freshness?s.freshness==="unknown":s.stale || s.restored || options.now-s.updatedAt>options.staleAfterMs);
  const label=s.state==="waiting" && s.reason==="question"?"等待你回答":LABELS[s.state];
  return {...s,uncertain,label,displayLabel:uncertain?"状态未知":label,
   projectName:s.project.replace(/\\/g,"/").split("/").filter(Boolean).pop() || s.project,
   ageSeconds:Math.max(0,Math.floor((options.now-s.updatedAt)/1000))};
 });
 const present=new Set(rows.filter(s=>s.state!=="closed"&&!s.uncertain).map(s=>s.id));
 for(const id of seats.keys())if(!present.has(id))seats.delete(id);
 const occupied=new Set(seats.values());
 for(const session of rows) if(session.state!=="closed"&&!session.uncertain&&!seats.has(session.id)){
  let seat=0;while(occupied.has(seat))seat++;seats.set(session.id,seat);occupied.add(seat);
 }
 const agents:OfficeAgent[]=rows.filter(s=>s.state!=="closed"&&!s.uncertain).map(s=>({observation:{state:s.state,uncertain:s.uncertain,seat:seats.get(s.id)!},id:s.id,name:TOOL_NAMES[s.tool]+(s.agentId?" · "+(s.agentType||"子 Agent"):"")+(s.state==="waiting"?" · 等待":""),
  subtitle:s.projectName+" · "+(s.uncertain?"状态待更新":s.label),color:s.state==="waiting"?"#f3c16a":COLORS[s.tool],item:"laptop",
  status:s.uncertain?"idle":s.state==="working"?"working":s.state==="error"?"error":"idle"}));
 const current=rows.filter(s=>s.state!=="closed");
 const counts={main:current.filter(s=>!s.agentId).length,subagents:current.filter(s=>!!s.agentId).length,
  working:current.filter(s=>s.state==="working"&&!s.uncertain).length,unknown:current.filter(s=>s.uncertain).length,
  resting:current.filter(s=>!s.uncertain&&["ready","ended","interrupted"].includes(s.state)).length,
  history:sessions.filter(s=>["ended","interrupted","closed"].includes(s.state)).length};
 return {rows,counts,agents:agents.sort((a,b)=>a.id.localeCompare(b.id)),attention:rows.filter(s=>s.state==="waiting"&&!s.uncertain)};
}
