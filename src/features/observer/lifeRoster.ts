import type {OfficeAgent} from '@/features/retro-office/core/types';

/** A brief visual farewell for staff actually seen working. Never replays historical arrivals. */
export function createLifeRoster(){
 let previous=new Map<string,OfficeAgent>();
 const leaving=new Map<string,{agent:OfficeAgent;until:number}>();
 return {update(agents:OfficeAgent[],freshEnded:Set<string>,now:number,online:boolean){
  const current=new Map(agents.map(a=>[a.id,a]));
  if(!online)leaving.clear();
  if(online)for(const [id,a] of previous){
   if(!current.has(id)&&freshEnded.has(id)&&a.observation?.state==='working'){
    leaving.set(id,{agent:{...a,status:'idle',subtitle:'本轮已结束 · 收工伸展',observation:{...a.observation,state:'ended',departing:true}},until:now+3000});
   }
  }
  const occupied=new Set(agents.map(a=>a.observation?.seat));
  for(const [id,entry] of leaving){
   if(current.has(id)||!freshEnded.has(id)||now>=entry.until||occupied.has(entry.agent.observation?.seat))leaving.delete(id);
  }
  previous=current;
  return [...agents,...[...leaving.values()].map(e=>e.agent)];
 }};
}
