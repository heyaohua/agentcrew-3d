import {expect,it} from 'vitest';
import {LOUNGE_SEATS,LOUNGE_SOFAS,LOUNGE_TABLES,buildLoungeNavGrid} from '@/features/observer/loungeLayout';
import {createWorkRestSimulation,workRestSlot} from '@/features/observer/workRest';
import {astar2D} from '@/lib/office/pathfinding';
import type {OfficeAgent} from '@/features/retro-office/core/types';
const agent=(seat:number,state='ready',uncertain=false):OfficeAgent=>({id:`a${seat}`,name:'A',color:'#fff',item:'laptop',status:state==='working'?'working':'idle',observation:{seat,state:state as 'ready',uncertain}});
it('uses authored communal furniture and distinct seats with multiple orientations',()=>{
 expect(LOUNGE_SEATS.length).toBeGreaterThanOrEqual(24);
 expect(new Set(LOUNGE_SEATS.map(s=>`${s.x},${s.y}`)).size).toBe(LOUNGE_SEATS.length);
 expect(new Set(LOUNGE_SEATS.map(s=>s.facing)).size).toBeGreaterThanOrEqual(3);
 expect(LOUNGE_SOFAS.length).toBeLessThan(LOUNGE_SEATS.length/2);
 expect(LOUNGE_TABLES.length).toBeLessThan(LOUNGE_SEATS.length/4);
});
it('all authored seats are reachable from the shared corridor and every work seat',()=>{
 const grid=buildLoungeNavGrid(24);
 for(const seat of LOUNGE_SEATS){
  const path=astar2D(900,300,seat.x,seat.y,grid);expect(path.length,seat.id).toBeGreaterThan(0);
  for(const p of path) expect(grid.cells[Math.floor(p.y/grid.cellSize)*grid.cols+Math.floor(p.x/grid.cellSize)],seat.id).toBe(0);
 }
 for(let i=0;i<24;i++){const p=workRestSlot(i).work;expect(astar2D(900,300,p.x,p.y,grid).length).toBeGreaterThan(0);}
});
it('leases communal seats independently from work IDs, retains frozen occupants, releases departures',()=>{
 const sim=createWorkRestSimulation();let people=Array.from({length:24},(_,i)=>agent(i));
 for(let i=0;i<350;i++)sim.update(people,.1);
 expect(new Set([...sim.actors.values()].map(a=>`${a.x},${a.y}`)).size).toBe(24);
 for(const a of sim.actors.values())expect(LOUNGE_SEATS.some(s=>s.x===a.x&&s.y===a.y)).toBe(true);
 const held=sim.restSeats.get('a1');people=people.map(a=>a.id==='a1'?agent(1,'ready',true):a.id==='a0'?agent(0,'working'):a);
 for(let i=0;i<350;i++)sim.update(people,.1);
 expect(sim.restSeats.has('a0')).toBe(false);expect(sim.restSeats.get('a1')).toBe(held);
 people.push(agent(25));for(let i=0;i<350;i++)sim.update(people,.1);
 expect(new Set(sim.restSeats.values()).size).toBe(sim.restSeats.size);
 expect(sim.restSeats.size).toBe(24);
});
it('aligns seated pelvis with cushion height and preserves seated pose when stale',()=>{
 const sim=createWorkRestSimulation();const a=agent(0);
 sim.update([a],0);const before=sim.actors.get(a.id)!;
 const restId=sim.restSeats.get(a.id)!;
 const cushion=restId.startsWith('pantry')?.345:.42;
 expect((before.observationSeatLift??0)+.175).toBeCloseTo(cushion);
 sim.update([agent(0,'ready',true)],.1);
 expect(sim.actors.get(a.id)!.state).toBe('sitting');
 expect(sim.actors.get(a.id)!.observationSeatLift).toBe(before.observationSeatLift);
});
