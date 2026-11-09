import {expect,it} from 'vitest';
import type {OfficeAgent} from '@/features/retro-office/core/types';
import {LOUNGE_SEATS} from '@/features/observer/loungeLayout';
import {createWorkRestSimulation, workRestSlot, workRestLayout, screenIsOn} from '@/features/observer/workRest';
const actor=(state='working',seat=0,uncertain=false):OfficeAgent=>({id:`agent-${seat}`,name:'Codex',color:'#62d6b6',item:'laptop',status:state==='working'?'working':'idle',observation:{state:state as 'working',seat,uncertain}});
it('working walks to its own computer then lights it; waiting turns it off and goes to rest',()=>{
 const sim=createWorkRestSimulation(); const a=actor();sim.update([a],0);
 expect(screenIsOn(sim.actors.get(a.id)!)).toBe(false);
 for(let i=0;i<240;i++)sim.update([a],.1);
 const p=sim.actors.get(a.id)!;expect(p.observationActivity).toBe('work');expect(screenIsOn(p)).toBe(true);
 expect(p.x).toBe(workRestSlot(0).work.x);
 sim.update([actor('waiting')],.1);expect(screenIsOn(sim.actors.get(a.id)!)).toBe(false);
 for(let i=0;i<240;i++)sim.update([actor('waiting')],.1);
 expect(['tea','game']).toContain(sim.actors.get(a.id)!.observationActivity);
 expect(LOUNGE_SEATS.some(s=>s.x===sim.actors.get(a.id)!.x&&s.y===sim.actors.get(a.id)!.y)).toBe(true);
});
it('stale freezes location and activity until a fresh event arrives',()=>{
 const sim=createWorkRestSimulation();sim.update([actor()],.1);sim.update([actor()],.1);
 const before={...sim.actors.get('agent-0')!};
 sim.update([actor('working',0,true)],1);
 expect(sim.actors.get('agent-0')!.x).toBe(before.x);expect(sim.actors.get('agent-0')!.y).toBe(before.y);
 expect(sim.actors.get('agent-0')!.observationActivity).toBe('unknown');expect(screenIsOn(sim.actors.get('agent-0')!)).toBe(false);
 sim.update([actor()],.1);expect(sim.actors.get('agent-0')!.observationActivity).toBe('travel');
});
it('supports more than eight actors with distinct seats and does not restart travel on polling',()=>{
 const sim=createWorkRestSimulation();const people=Array.from({length:20},(_,i)=>actor('working',i));
 for(let i=0;i<240;i++)sim.update(people.map(a=>({...a})),.1);
 expect(new Set([...sim.actors.values()].map(a=>`${a.x},${a.y}`)).size).toBe(20);
 expect([...sim.actors.values()].every(screenIsOn)).toBe(true);
 expect(workRestLayout(20).height).toBeGreaterThan(workRestSlot(19).work.y);
 sim.update(people.slice(1),.1);expect(sim.actors.has('agent-0')).toBe(false);
});
it('rest stays at its shared seat until fresh work interrupts and closed leaves',()=>{
 const sim=createWorkRestSimulation();sim.update([actor('ended')],0);
 const first=sim.actors.get('agent-0')!.observationActivity;
 for(let i=0;i<181;i++)sim.update([actor('ended')],.1);
 expect(sim.actors.get('agent-0')!.observationActivity).toBe(first);
 sim.update([actor('working')],.1);expect(sim.actors.get('agent-0')!.observationActivity).toBe('travel');
 sim.update([actor('closed')],.1);expect(sim.actors.size).toBe(0);
});
