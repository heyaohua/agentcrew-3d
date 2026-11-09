import type {OfficeAgent,RenderAgent} from '@/features/retro-office/core/types';
import {astar2D} from '@/lib/office/pathfinding';
import {LOUNGE_SEATS,buildLoungeNavGrid,loungeRoomSize} from './loungeLayout';
import {employeeStyle} from './officeLife';

export type Point={x:number;y:number};
export const workRestLayout=loungeRoomSize;
export function workRestSlot(seat:number){return {work:{x:120+(seat%4)*180,y:190+Math.floor(seat/4)*230}};}
export function screenIsOn(actor:RenderAgent){return actor.observationActivity==='work'&&'observation' in actor&&actor.observation?.state==='working'&&!actor.observation.uncertain;}
/** Work seats are personal. Lounge seats are a shared, stable reservation pool. */
export function createWorkRestSimulation(){
 const actors=new Map<string,RenderAgent>(),restSeats=new Map<string,string>();
 const goals=new Map<string,string>();
 let capacity=0,grid=buildLoungeNavGrid(8);
 const seatById=new Map(LOUNGE_SEATS.map(s=>[s.id,s]));
 return {actors,restSeats,update(inputs:OfficeAgent[],delta:number){
  const dt=Math.min(Math.max(delta,0),.25);
  const needed=Math.max(8,...inputs.map(a=>(a.observation?.seat??0)+1));
  if(needed!==capacity){capacity=needed;grid=buildLoungeNavGrid(capacity);}
  const alive=new Set(inputs.filter(a=>a.observation?.state!=='closed').map(a=>a.id));
  for(const id of actors.keys())if(!alive.has(id)){actors.delete(id);goals.delete(id);restSeats.delete(id);}
  // Release only after leaving the cushion, so a returning actor cannot sit through someone departing.
  for(const input of inputs){
   const reservation=seatById.get(restSeats.get(input.id)??'');
   const a=actors.get(input.id);
   if(input.observation?.state==='working'&&!input.observation.uncertain&&reservation&&a&&Math.hypot(a.x-reservation.x,a.y-reservation.y)>48)restSeats.delete(input.id);
  }
  for(const input of inputs){
   if(!alive.has(input.id))continue;
   const meta=input.observation,seat=meta?.seat??0,work=workRestSlot(seat).work;
   let a=actors.get(input.id);const first=!a;
   // A newly mounted renderer has not witnessed this person's work: no farewell replay.
   if(!a&&meta?.departing)continue;
   if(!a){const style=employeeStyle(input.id);a={...input,x:880,y:40+seat*38,targetX:880,targetY:40+seat*38,path:[],facing:Math.PI,frame:0,walkSpeed:180,phaseOffset:style.phase,observationPace:style.pace,state:'standing',observationGesture:meta?.state==='working'?{kind:'wave',startedFrame:0,untilFrame:100}:undefined};actors.set(input.id,a);}
   const previous='observation' in a?a.observation?.state:undefined;
   if(previous==='working'&&a.observationActivity==='work'&&!meta?.uncertain&&(meta?.state==='ended'||meta?.state==='ready')){
    a.observationGesture={kind:'stretch',startedFrame:a.frame,untilFrame:a.frame+132};
   }
   if(meta?.uncertain||meta?.state==='waiting'||meta?.state==='error'||meta?.state==='interrupted'||(meta?.state==='working'&&a.observationGesture?.kind==='stretch'))a.observationGesture=undefined;
   Object.assign(a,input);
   const working=(meta?.state??input.status)==='working';
   if(!working||meta?.uncertain){
    if(!restSeats.has(input.id)&&(!meta?.uncertain||first)){
     const used=new Set(restSeats.values());
     const candidates=LOUNGE_SEATS.filter(s=>!used.has(s.id)&&![...actors.values()].some(other=>other.id!==input.id&&Math.hypot(other.x-s.x,other.y-s.y)<40));
     candidates.sort((p,q)=>Math.hypot(p.x-a!.x,p.y-a!.y)-Math.hypot(q.x-a!.x,q.y-a!.y));
     if(candidates[0])restSeats.set(input.id,candidates[0].id);
    }
   }
   const rest=seatById.get(restSeats.get(input.id)??'');
   if(first&&(!working||meta?.uncertain)&&rest){a.x=rest.x;a.y=rest.y;a.facing=rest.facing;a.state="sitting";a.observationSeatLift=rest.id.startsWith("pantry")?.17:.245;}
   if(meta?.uncertain){a.observationActivity='unknown';if(a.state==='walking')a.state='standing';continue;}
   // If every shared seat is occupied, wait in the corridor without cloning furniture.
   const destination=working?work:rest??{x:870,y:40+seat*38};
   const goal=working?'work':rest?.id??'queue';
   if(goals.get(input.id)!==goal){
    goals.set(input.id,goal);
    a.path=Math.hypot(a.x-destination.x,a.y-destination.y)<1?[]:astar2D(a.x,a.y,destination.x,destination.y,grid);
    a.targetX=destination.x;a.targetY=destination.y;
   }
   a.frame+=dt*60;
   if(a.observationGesture?.kind==='stretch'&&(meta?.departing||a.frame<a.observationGesture.untilFrame)){a.state='sitting';a.observationActivity='travel';continue;}
   let distance=180*dt;
   while(a.path.length&&distance>0){
    const p=a.path[0],dx=p.x-a.x,dy=p.y-a.y,len=Math.hypot(dx,dy);
    if(len<.01){a.path.shift();continue;}
    a.facing=Math.atan2(dx,dy);const step=Math.min(distance,len);a.x+=dx/len*step;a.y+=dy/len*step;distance-=step;
    if(step===len)a.path.shift();
   }
   if(a.path.length){a.state='walking';a.observationSeatLift=0;a.observationActivity='travel';continue;}
   if(Math.hypot(a.x-destination.x,a.y-destination.y)>1){a.state='standing';a.observationActivity='travel';continue;}
   a.facing=working?Math.PI:rest?.facing??Math.PI/2;
   a.state=working||rest?'sitting':'standing';
   a.observationSeatLift=working?.11:rest?(rest.id.startsWith('pantry')?.17:.245):0;
   a.observationActivity=working?'work':rest?.activity??'travel';
  }
 }};
}
