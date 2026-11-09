import { describe, expect, it } from "vitest";
import { buildWorkspaceMap } from "@/features/pixel-office/map/workspaceMap";
import { createPixelSimulation } from "@/features/pixel-office/sim/agentSimulation";
import { observerScreenState } from "@/features/pixel-office/sim/observerPresentation";
import { buildPixelNavGrid, tileCenter } from "@/features/pixel-office/map/navGrid";
import { createObserverAgentDepth } from "@/features/pixel-office/scene/observerDepth";
import { observerFurnitureFlip } from "@/features/pixel-office/scene/furnitureOrientation";
import { OBJECT_FOOTPRINT } from "@/features/pixel-office/types";
import { astar2D } from "@/lib/office/pathfinding";
import type { PixelAgentInput, PixelAgentPose } from "@/features/pixel-office/types";

const input = (seat: number, state = "working", uncertain = false): PixelAgentInput => ({
 id: `agent-${seat}`, name: `Agent ${seat}`, status: state === "working" ? "working" : state === "error" ? "error" : "idle", color: "#55aaff", streaming:false, thinking:false, awaitingApproval:state === "waiting", dancing:false, hold:null, standup:false,
 observation:{ state: state as NonNullable<PixelAgentInput["observation"]>["state"], uncertain, seat },
});
const run = (sim: ReturnType<typeof createPixelSimulation>, inputs: PixelAgentInput[], start=0, duration=15000) => {
 let poses: PixelAgentPose[]=[];
 for(let now=start;now<start+duration;now+=100) poses=sim.tick({inputs,nowMs:now,dtMs:100,cleaningActive:false});
 return poses;
};
const restSeats = (map: ReturnType<typeof buildWorkspaceMap>) => map.stations.filter(s=>s.id.startsWith("rest-tea-")||s.id.startsWith("rest-game-"));

describe("observer pixel work/rest",()=>{
 it("initializes first-seen uncertain people in reserved shared seats, using queue only after all seats fill",()=>{
  const map=buildWorkspaceMap(28), sim=createPixelSimulation(map);
  const inputs=Array.from({length:27},(_,i)=>input(i,i%2?"waiting":"working",true));
  const poses=sim.tick({inputs,nowMs:0,dtMs:16,cleaningActive:false});
  expect(poses.filter(p=>p.stationId?.match(/^rest-(tea|game)-/))).toHaveLength(24);
  expect(poses.filter(p=>p.stationId?.startsWith("rest-queue-"))).toHaveLength(3);
  expect(new Set(poses.map(p=>`${p.x},${p.y}`)).size).toBe(27);
  expect(poses.every(p=>p.activity==="standing"&&!p.moving)).toBe(true);
  for(const pose of poses) expect(observerScreenState(inputs.find(i=>i.id===pose.id)!,pose)).toBe("unknown");
  const later=run(sim,inputs,16,15000);
  expect(later.map(p=>[p.x,p.y,p.stationId])).toEqual(poses.map(p=>[p.x,p.y,p.stationId]));
 });
 it("renders all shared-sofa occupants above sofa sprites, including stale frozen occupants",()=>{
  const map=buildWorkspaceMap(24), depth=createObserverAgentDepth(map,true), normalDepth=createObserverAgentDepth(map,false);
  const sofaDepth=Math.max(...map.objects.filter(o=>o.kind==="sofa_h"||o.kind==="sofa_v").map(o=>(o.ty+OBJECT_FOOTPRINT[o.kind][1])*32));
  for(const seat of restSeats(map)) {
   const point=tileCenter(seat.tx,seat.ty);
   const pose:PixelAgentPose={id:"test",...point,facing:seat.facing,activity:"drinking_tea",moving:false,stationId:seat.id,deskId:null};
   expect(depth(pose),seat.id).toBeGreaterThan(sofaDepth);
   expect(depth({...pose,activity:"standing"}),`stale ${seat.id}`).toBeGreaterThan(sofaDepth);
   expect(normalDepth(pose)).toBe(pose.y+16);
  }
  const walker:PixelAgentPose={id:"walker",x:21*32,y:3*32,facing:"right",activity:"walking",moving:true,stationId:null,deskId:null};
  expect(depth(walker)).toBe(walker.y+16);
 });
 it("orients every shared sofa opening toward its seated character without changing normal office art",()=>{
  const map=buildWorkspaceMap(24);
  for(const seat of restSeats(map)) {
   const sofa=map.objects.find(object=>{
    if(object.kind!=="sofa_h"&&object.kind!=="sofa_v") return false;
    const [width,height]=OBJECT_FOOTPRINT[object.kind];
    return seat.tx>=object.tx&&seat.tx<object.tx+width&&seat.ty>=object.ty&&seat.ty<object.ty+height;
   });
   expect(sofa,seat.id).toBeDefined();
   const flip=observerFurnitureFlip(sofa!,true);
   const visibleFacing=sofa!.kind==="sofa_h"?(flip.flipY?"up":"down"):(flip.flipX?"left":"right");
   expect(visibleFacing,seat.id).toBe(seat.facing);
   expect(observerFurnitureFlip(sofa!,false)).toEqual({flipX:false,flipY:false});
  }
 });
 it("uses fixed shared lounge furniture rather than one rest pod per agent",()=>{
  const small=buildWorkspaceMap(8), large=buildWorkspaceMap(24);
  const rest=small.objects.filter(object=>object.tx>=23);
  expect(large.objects.filter(object=>object.tx>=23)).toEqual(rest);
  expect(rest.some(object=>["desk_monitor","arcade","tv_stand"].includes(object.kind))).toBe(false);
  expect(rest.some(object=>object.kind==="sofa_h")).toBe(true);
  expect(rest.some(object=>object.kind==="sofa_v")).toBe(true);
  expect(rest.filter(object=>object.id==="shared-tea-table")).toHaveLength(1);
  expect(rest.filter(object=>object.id==="shared-game-table")).toHaveLength(1);
  expect(rest.some(object=>object.kind==="coffee_machine")).toBe(true);
  expect(small.zones.find(zone=>zone.id==="restspace")?.label).toContain("桌游");
  expect(large.desks).toHaveLength(24);
 });
 it("provides 24 unique shared seats with multiple facings and reachable approaches",()=>{
  const map=buildWorkspaceMap(24), seats=restSeats(map), grid=buildPixelNavGrid(map);
  expect(seats).toHaveLength(24);
  expect(new Set(seats.map(s=>`${s.tx},${s.ty}`)).size).toBe(24);
  expect(new Set(seats.map(s=>s.facing)).size).toBeGreaterThanOrEqual(3);
  const origin=tileCenter(map.spawn.tx,map.spawn.ty);
  for(const seat of seats){
   const target=tileCenter(seat.tx,seat.ty);
   const path=astar2D(origin.x,origin.y,target.x,target.y,grid);
   expect(path.length,seat.id).toBeGreaterThan(0);
   expect(path.at(-1),seat.id).toEqual(target);
  }
 });
 it("allocates 24 resting people stable non-overlapping shared seats independently of desk ids",()=>{
  const sim=createPixelSimulation(buildWorkspaceMap(24));
  const agents=Array.from({length:24},(_,i)=>input(i,"ready"));
  const poses=run(sim,agents);
  expect(poses.every(p=>p.activity==="drinking_tea"||p.activity==="playing_game")).toBe(true);
  expect(new Set(poses.map(p=>`${p.x},${p.y}`)).size).toBe(24);
  const again=run(sim,agents,15000,1000);
  expect(again.map(p=>p.stationId)).toEqual(poses.map(p=>p.stationId));
  const rekeyed=createPixelSimulation(buildWorkspaceMap(44));
  const arbitrary=input(43,"ready"); arbitrary.id="another-agent";
  expect(run(rekeyed,[arbitrary])[0].activity).toBe("drinking_tea");
 });
 it("releases seats when work starts and allocates free places to new arrivals",()=>{
  const sim=createPixelSimulation(buildWorkspaceMap(28));
  const agents=Array.from({length:24},(_,i)=>input(i,"ready"));
  const previous=run(sim,agents);
  const released=previous.find(p=>p.id==="agent-0")!.stationId;
  agents[0]=input(0);
  run(sim,agents,15000,15000);
  const poses=run(sim,[...agents,input(24,"ready")],30000,15000);
  expect(poses.find(p=>p.id==="agent-0")!.activity).toBe("sitting_desk");
  expect(poses.find(p=>p.id==="agent-24")!.stationId).toMatch(/^rest-(tea|game)-/);
  expect(poses.some(p=>p.id!=="agent-0"&&p.stationId===released)).toBe(true);
  expect(new Set(poses.map(p=>`${p.x},${p.y}`)).size).toBe(25);
 });
 it("full lounge queues additional people visibly without stealing occupied or stale seats",()=>{
  const sim=createPixelSimulation(buildWorkspaceMap(28));
  const agents=Array.from({length:24},(_,i)=>input(i,"ready"));
  const before=run(sim,agents);
  agents[0]=input(0,"ready",true);
  const poses=run(sim,[...agents,input(24,"ready"),input(25,"ready"),input(26,"ready")],15000,15000);
  expect(poses.filter(p=>p.stationId?.startsWith("rest-queue-")).length).toBe(3);
  expect(new Set(poses.map(p=>`${p.x},${p.y}`)).size).toBe(27);
  const stale=poses.find(p=>p.id==="agent-0")!,old=before.find(p=>p.id==="agent-0")!;
  expect([stale.x,stale.y,stale.stationId]).toEqual([old.x,old.y,old.stationId]);
  expect(stale.moving).toBe(false);
 });
 it("working characters have unique powered desks and waiting walks back to shared lounge",()=>{
  const map=buildWorkspaceMap(12), sim=createPixelSimulation(map);
  const agents=Array.from({length:12},(_,i)=>input(i));
  const poses=run(sim,agents);
  expect(new Set(poses.map(p=>`${p.x},${p.y}`)).size).toBe(12);
  expect(poses.every(p=>p.activity==="sitting_desk")).toBe(true);
  expect(poses.every(p=>observerScreenState(agents.find(a=>a.id===p.id)!,p)==="working")).toBe(true);
  const waiting=input(0,"waiting");
  let pose=sim.tick({inputs:[waiting],nowMs:15000,dtMs:100,cleaningActive:false})[0];
  expect(observerScreenState(waiting,pose)).toBe("off");
  expect(pose.moving).toBe(true);
  pose=run(sim,[waiting],15100,15000)[0];
  expect(["drinking_tea","playing_game"]).toContain(pose.activity);
  pose=sim.tick({inputs:[input(0)],nowMs:30100,dtMs:100,cleaningActive:false})[0];
  expect(pose.moving).toBe(true);
  expect(run(sim,[input(0)],30200,15000)[0].activity).toBe("sitting_desk");
 });
 it("uncertain freezes positions and turns off active effects until fresh evidence",()=>{
  const sim=createPixelSimulation(buildWorkspaceMap(8));
  const before=run(sim,[input(0)],0,1000)[0];
  const stale=input(0,"working",true);
  const after=run(sim,[stale],1000,20000)[0];
  expect([after.x,after.y]).toEqual([before.x,before.y]);
  expect(after.moving).toBe(false);
  expect(after.activity).toBe("standing");
  expect(observerScreenState(stale,after)).toBe("unknown");
  expect(run(sim,[input(0)],21000,18000)[0].activity).toBe("sitting_desk");
 });
 it("closed people leave and errors keep their real status in the shared lounge",()=>{
  const sim=createPixelSimulation(buildWorkspaceMap(8));
  expect(run(sim,[input(0,"closed")])).toEqual([]);
  const error=input(1,"error");
  const pose=run(sim,[error])[0];
  expect(["drinking_tea","playing_game"]).toContain(pose.activity);
  expect(error.status).toBe("error");
  expect(observerScreenState(error,pose)).toBe("off");
 });
 it("room growth preserves stale positions and their seat reservations",()=>{
  const small=createPixelSimulation(buildWorkspaceMap(8));
  const before=run(small,[input(0,"ready")])[0];
  const larger=createPixelSimulation(buildWorkspaceMap(12),small.getState());
  const poses=run(larger,[input(0,"ready",true),input(11,"ready")],15000,15000);
  const after=poses[0];
  expect([after.x,after.y,after.stationId]).toEqual([before.x,before.y,before.stationId]);
  expect(poses[1].stationId).not.toBe(after.stationId);
 });
});
