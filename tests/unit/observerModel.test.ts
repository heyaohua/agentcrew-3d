import {describe,it,expect} from "vitest";
import {buildObserverView, type ObserverSession} from "@/features/observer/model";
const base:ObserverSession={id:"id1",tool:"codex",sessionId:"session-one",project:"/tmp/project",state:"working",reason:"",toolName:"Bash",lastEvent:"PostToolUse",updatedAt:1000,stale:false,restored:false,events:[]};
describe("observer view",()=>{
 it("does not animate stale, restored or disconnected work as active",()=>{
  for(const [s,online,now] of [[{...base,stale:true},true,1001],[{...base,restored:true},true,1001],[base,false,1001],[base,true,122000]] as const){
   const v=buildObserverView([s],{online,now,staleAfterMs:120000,hideEnded:false});expect(v.rows[0].uncertain).toBe(true);expect(v.agents).toHaveLength(0);
  }
 });
 it("keeps explicit waiting visible and selects attention without approving it",()=>{
  const v=buildObserverView([{...base,state:"waiting",reason:"permission"}],{online:true,now:1100,staleAfterMs:120000,hideEnded:true});
  expect(v.attention).toHaveLength(1);expect(v.rows[0].label).toBe("等待你确认");expect(v.agents[0].name).toContain("等待");expect(v.agents[0].status).not.toBe("working");
 });
 it("separates same-tool sessions and hides only ended sessions on request",()=>{
  const v=buildObserverView([base,{...base,id:"id2",sessionId:"two"},{...base,id:"id3",state:"ended"}],{online:true,now:1100,staleAfterMs:120000,hideEnded:true});
  expect(v.agents.map(a=>a.id)).toEqual(["id1","id2"]);expect(v.rows[0].projectName).toBe("project");
 });
});

it("keeps closed history but removes its actor; preserves observation metadata and seats through filtering", () => {
 const seats = new Map<string, number>();
 const options = { online:true, now:1100, staleAfterMs:120000, hideEnded:false, seatById:seats };
 const sessions = [base, {...base,id:"id2",state:"ended" as const}, {...base,id:"closed",state:"closed" as const}];
 const view = buildObserverView(sessions, options);
 expect(view.rows).toHaveLength(3);
 expect(view.agents).toHaveLength(2);
 expect(view.agents[0].observation).toEqual({ state:"working", uncertain:false, seat:0 });
 const filtered = buildObserverView([{...base,id:"aaa"}, ...sessions], {...options,hideEnded:true});
 expect(filtered.agents.find(a=>a.id===base.id)?.observation?.seat).toBe(0);
 const stale = buildObserverView([base], {...options,online:false});
 expect(stale.rows[0].uncertain).toBe(true);expect(stale.agents).toHaveLength(0);
});

it('trusts process-backed work beyond the silence interval and exposes child relationships',()=>{
 const child={...base,id:'child',agentId:'a',agentType:'reviewer',parentId:base.id,freshness:'process' as const,processAlive:true};
 const v=buildObserverView([child],{online:true,now:900000,staleAfterMs:120000,hideEnded:false});
 expect(v.rows[0].uncertain).toBe(false);expect(v.agents[0].status).toBe('working');expect(v.rows[0].parentId).toBe(base.id);
 expect(v.counts.subagents).toBe(1);expect(v.counts.working).toBe(1);
});
it('unknown state has its own count and no fictional resting actor or current approval alert',()=>{
 const v=buildObserverView([{...base,stale:true,state:'waiting'}],{online:true,now:900000,staleAfterMs:120000,hideEnded:false});
 expect(v.counts.unknown).toBe(1);expect(v.counts.resting).toBe(0);expect(v.agents).toHaveLength(0);expect(v.attention).toHaveLength(0);
 expect(v.rows[0].displayLabel).toBe('状态未知');
});
it('does not allocate empty workstations for unknown or hidden historical rows',()=>{
 const old=Array.from({length:20},(_,i)=>({...base,id:'old'+i,state:'ended' as const,freshness:'settled' as const}));
 const v=buildObserverView([...old,{...base,id:'unknown',stale:true},base],{online:true,now:1100,staleAfterMs:120000,hideEnded:true});
 expect(v.agents).toHaveLength(1);expect(v.agents[0].observation?.seat).toBe(0);expect(v.counts.history).toBe(20);
});

it('shows DSH with its own name and preserves working, waiting and child roles',()=>{
 const dsh={...base,tool:'dsh' as const};
 const v=buildObserverView([dsh,{...dsh,id:'dsh-child',agentId:'child',agentType:'DSH 子 Agent',parentId:dsh.id,state:'waiting' as const,reason:'question'}],{online:true,now:1100,staleAfterMs:120000,hideEnded:false});
 expect(v.agents.find(a=>a.id===dsh.id)?.name).toBe('DSH');
 expect(v.agents.find(a=>a.id===dsh.id)?.status).toBe('working');
 expect(v.attention[0].label).toBe('等待你回答');
 expect(v.counts.subagents).toBe(1);expect(v.counts.working).toBe(1);
});
