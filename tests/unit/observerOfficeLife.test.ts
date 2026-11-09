import {expect,it} from 'vitest';
import {employeeStyle,sampleLifePose,describeObserverEvent} from '@/features/observer/officeLife';
import {createWorkRestSimulation,screenIsOn} from '@/features/observer/workRest';
import {createLifeRoster} from '@/features/observer/lifeRoster';
import {buildObserverView,type ObserverSession} from '@/features/observer/model';
import type {OfficeAgent,ObservationState} from '@/features/retro-office/core/types';
const person=(state:ObservationState['state']):OfficeAgent=>({id:'employee-one',name:'Codex',color:'#fff',item:'laptop',status:state==='working'?'working':'idle',observation:{state,uncertain:false,seat:0}});
function settled(){const sim=createWorkRestSimulation();for(let i=0;i<250;i++)sim.update([person('working')],.1);return sim;}
it('keeps cosmetic identity stable and varies the staff styles',()=>{
 expect(employeeStyle('same')).toEqual(employeeStyle('same'));
 expect(new Set(Array.from({length:30},(_,i)=>employeeStyle('id'+i).phase)).size).toBeGreaterThan(20);
});
it('has different work poses without changing true state or screen power',()=>{
 const sim=settled();const a=sim.actors.get('employee-one')!;const seen=new Set();
 for(let i=0;i<300;i++){sim.update([person('working')],.1);seen.add(sampleLifePose(a).kind);expect(screenIsOn(a)).toBe(true);expect('observation' in a&&a.observation?.state).toBe('working');}
 expect([...seen].sort()).toEqual(['focus','think','type']);
});
it('stretches once at a real visible work-to-ended transition, then takes a shared rest seat',()=>{
 const sim=settled();const a=sim.actors.get('employee-one')!;const x=a.x,y=a.y;
 sim.update([person('ended')],.1);expect(sampleLifePose(a).kind).toBe('stretch');expect(screenIsOn(a)).toBe(false);
 for(let i=0;i<10;i++)sim.update([person('ended')],.1);
 expect([a.x,a.y]).toEqual([x,y]);
 for(let i=0;i<250;i++)sim.update([person('ended')],.1);
 expect(['tea','game']).toContain(a.observationActivity);expect(sampleLifePose(a).kind).not.toBe('stretch');
});
it('interrupts stretching immediately for fresh work or a real attention state',()=>{
 for(const state of ['working','waiting','error'] as const){const sim=settled();sim.update([person('ended')],.1);sim.update([person(state)],.1);const a=sim.actors.get('employee-one')!;expect(a.observationGesture).toBeUndefined();expect(sampleLifePose(a).kind).not.toBe('stretch');}
});
it('does not greet or celebrate an old historical record, waiting, errors or unknown',()=>{
 for(const state of ['ended','waiting','error','interrupted'] as const){const sim=createWorkRestSimulation();sim.update([person(state)],.1);const a=sim.actors.get('employee-one')!;expect(a.observationGesture).toBeUndefined();if(state!=='ended')expect(['attention','concern']).toContain(sampleLifePose(a).kind);}
 const sim=settled();sim.update([{...person('working'),observation:{state:'working',seat:0,uncertain:true}}],.1);expect(sampleLifePose(sim.actors.get('employee-one')!).kind).toBe('none');
});
it('quiet mode keeps the status but does not cycle cosmetic work poses',()=>{
 const sim=settled(),a=sim.actors.get('employee-one')!;const before=sampleLifePose(a,false);sim.update([person('working')],.2);expect(sampleLifePose(a,false)).toEqual(before);expect(screenIsOn(a)).toBe(true);
});
it('does not invent test success or task acceptance from tool names and round completion',()=>{
 expect(describeObserverEvent('PreToolUse','Bash')).toBe('执行命令');
 expect(describeObserverEvent('PostToolUse','Bash')).toBe('工具已返回 · Bash');
 expect(describeObserverEvent('Stop')).toBe('本轮告一段落');
 expect(describeObserverEvent('PostToolUseFailure','Bash')).toBe('工具报告错误');
 expect(describeObserverEvent('SubagentStart')).toBe('子 Agent 加入协作');
 expect(describeObserverEvent('PreToolUse','custom_tool')).toBe('调用工具 · custom_tool');
 expect(describeObserverEvent('PreToolUse','constructor')).toBe('调用工具 · constructor');
 expect(describeObserverEvent('toString')).toBe('toString');
});
it('default hidden history still permits a three-second farewell without retaining the ended session',()=>{
 const session:ObserverSession={id:'employee-one',tool:'codex',sessionId:'one',project:'/tmp/fixture',state:'working',reason:'',toolName:'',lastEvent:'UserPromptSubmit',updatedAt:1000,stale:false,restored:false,events:[]};
 const options={online:true,now:1000,staleAfterMs:120000,hideEnded:true};
 const roster=createLifeRoster(),sim=createWorkRestSimulation();
 const working=buildObserverView([session],options);
 const people=roster.update(working.agents,new Set(),1000,true);
 for(let i=0;i<250;i++)sim.update(people,.1);
 const ended=buildObserverView([{...session,state:'ended',freshness:'settled'}],options);
 expect(ended.counts.working).toBe(0);expect(ended.agents).toHaveLength(0);expect(ended.rows).toHaveLength(0);
 sim.update(roster.update(ended.agents,new Set([session.id]),2000,true),.1);
 expect(sampleLifePose(sim.actors.get(session.id)!).kind).toBe('stretch');
 expect(roster.update([],new Set([session.id]),4999,true)).toHaveLength(1);
 sim.update(roster.update([],new Set([session.id]),5000,true),.1);expect(sim.actors.size).toBe(0);
 expect(roster.update([],new Set([session.id]),6000,true)).toHaveLength(0);
});
it('does not retain departures after disconnect, unknown, resume or a reused work seat',()=>{
 for(const situation of ['offline','unknown','resume','reuse']){
  const roster=createLifeRoster();roster.update([person('working')],new Set(),0,true);
  expect(roster.update([],new Set(['employee-one']),100,true)).toHaveLength(1);
  const inputs=situation==='resume'?[person('working')]:situation==='reuse'?[{...person('working'),id:'new-person'}]:[];
  const output=roster.update(inputs,situation==='unknown'?new Set():new Set(['employee-one']),200,situation!=='offline');
  expect(output.some(a=>a.observation?.departing)).toBe(false);
 }
 expect(createLifeRoster().update([],new Set(['old-ended']),0,true)).toHaveLength(0);
 const remount=createWorkRestSimulation();remount.update([{...person('ended'),observation:{state:'ended',seat:0,uncertain:false,departing:true}}],.1);expect(remount.actors.size).toBe(0);
});
