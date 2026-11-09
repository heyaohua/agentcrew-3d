"use client";
import {useFrame} from '@react-three/fiber';
import {useRef} from 'react';
import * as THREE from 'three';
import {toWorld} from '@/features/retro-office/core/geometry';
import {LOUNGE_SOFAS,LOUNGE_TABLES,LOUNGE_SEATS,type LoungeSofa} from './loungeLayout';
import type {createWorkRestSimulation} from './workRest';

type Simulation=ReturnType<typeof createWorkRestSimulation>;
function Block({p,s,c}:{p:[number,number,number];s:[number,number,number];c:string}){
 return <mesh position={p} castShadow receiveShadow><boxGeometry args={s}/><meshStandardMaterial color={c} roughness={.85}/></mesh>;
}
function Sofa({sofa}:{sofa:LoungeSofa}){
 const [x,,z]=toWorld(sofa.x,sofa.y),length=sofa.length*.018;
 const seats=LOUNGE_SEATS.filter(s=>s.id.startsWith(sofa.id+'-'));
 return <group position={[x,0,z]} rotation={[0,sofa.facing,0]}>
  <Block p={[0,.16,0]} s={[length,.26,1.15]} c="#675142"/>
  <Block p={[0,.52,-.48]} s={[length,.75,.25]} c={sofa.color}/>
  {[-1,1].map(side=><Block key={side} p={[side*(length/2-.1),.42,0]} s={[.23,.62,1.25]} c={sofa.color}/>)}
  {seats.map((seat,i)=>{
   const offset=(i-(seats.length-1)/2)*80*.018;
   return <group key={seat.id} position={[offset,0,0]}>
    <Block p={[0,.32,.02]} s={[1.36,.2,.87]} c={sofa.color}/>
    <Block p={[0,.62,-.31]} s={[1.32,.48,.2]} c={sofa.color}/>
   </group>;
  })}
  <mesh position={[-length/2+.48,.62,-.1]} rotation={[0,0,.15]}><boxGeometry args={[.42,.42,.16]}/><meshStandardMaterial color="#e5cda6"/></mesh>
 </group>;
}
function SharedTable({table,sim,lively}:{table:typeof LOUNGE_TABLES[number];sim:Simulation;lively:boolean}){
 const [x,,z]=toWorld(table.x,table.y);const piece=useRef<THREE.Mesh>(null);
 useFrame(()=>{
  if(!piece.current)return;
  const playing=[...sim.actors.values()].find(a=>a.observationActivity==='game'&&'observation' in a&&['ready','ended'].includes(a.observation?.state??''));
  piece.current.position.x=playing&&lively?Math.sin(playing.frame*.025)*.4:.2;
 });
 return <group position={[x,0,z]}>
  <Block p={[0,.36,0]} s={[table.w*.018,.14,table.h*.018]} c="#d5b388"/>
  {[-1,1].flatMap(dx=>[-1,1].map(dz=><Block key={`${dx}${dz}`} p={[dx*table.w*.006,.16,dz*table.h*.005]} s={[.1,.32,.1]} c="#60554b"/>))}
  {table.game?<>
   <Block p={[0,.44,0]} s={[1.35,.035,1.05]} c="#f2dbb3"/>
   {Array.from({length:36},(_,i)=><Block key={i} p={[-.55+(i%6)*.22,.465,-.43+Math.floor(i/6)*.17]} s={[.21,.008,.16]} c={(i+Math.floor(i/6))%2?'#50796f':'#dbc79c'}/>)}
   <mesh ref={piece} position={[.2,.52,.15]}><cylinderGeometry args={[.085,.085,.1,12]}/><meshStandardMaterial color="#b85e43"/></mesh>
   <Block p={[-1,.47,.2]} s={[.28,.04,.38]} c="#f0e3cc"/>
  </>:<>
   <mesh position={[0,.6,0]} castShadow><sphereGeometry args={[.24,20,12]}/><meshStandardMaterial color="#8caaa0"/></mesh>
   <mesh position={[.22,.61,.05]} rotation={[0,0,-.8]}><cylinderGeometry args={[.07,.10,.3,12]}/><meshStandardMaterial color="#8caaa0"/></mesh>
   <mesh position={[0,.85,0]}><sphereGeometry args={[.06,12,8]}/><meshStandardMaterial color="#507469"/></mesh>
   {[-.45,.45].map(dx=><group key={dx} position={[dx,.53,.26]}><mesh><cylinderGeometry args={[.11,.09,.16,12]}/><meshStandardMaterial color="#f4e5c4"/></mesh><mesh position={[0,.082,0]}><cylinderGeometry args={[.095,.095,.004,12]}/><meshStandardMaterial color="#805c36"/></mesh></group>)}
  </>}
 </group>;
}
function Plant({x,y}:{x:number;y:number}){
 const [wx,,wz]=toWorld(x,y);
 return <group position={[wx,0,wz]}>
  <mesh position={[0,.25,0]} castShadow><cylinderGeometry args={[.28,.21,.5,16]}/><meshStandardMaterial color="#b4aa94"/></mesh>
  {[-.2,0,.2].map((dx,i)=><mesh key={i} position={[dx,.7+i*.12,0]} scale={[.25,.45,.28]} castShadow><sphereGeometry args={[1,12,10]}/><meshStandardMaterial color={i%2?'#618360':'#456d54'}/></mesh>)}
 </group>;
}
export function ObserverLounge3D({sim,lively=true}:{sim:Simulation;lively?:boolean}){
 const [counterX,,counterZ]=toWorld(1300,105);
 const [rugX,,rugZ]=toWorld(1220,495);
 const [gameX,,gameZ]=toWorld(1310,860);
 return <group>
  <Block p={[rugX,.04,rugZ]} s={[8.5,.035,6.6]} c="#b3a087"/>
  <Block p={[gameX,.04,gameZ]} s={[6.2,.035,5.6]} c="#8b9b9b"/>
  {/* One shared pantry along the wall, with cupboards, sink, kettle and cups. */}
  <group position={[counterX,0,counterZ]}>
   <Block p={[0,.49,0]} s={[10.6,.98,1.65]} c="#d5c8b2"/>
   <Block p={[0,1.02,0]} s={[10.8,.12,1.77]} c="#dce3d9"/>
   {[-4,-2,0,2,4].map(dx=><group key={dx}><Block p={[dx,.5,.84]} s={[1.85,.82,.05]} c="#b3bca9"/><Block p={[dx, .67,.88]} s={[.28,.045,.045]} c="#5d6c63"/></group>)}
   <Block p={[-3.2,1.1,0]} s={[1.05,.04,.8]} c="#657d80"/>
   <Block p={[-3.2,1.4,-.35]} s={[.07,.65,.07]} c="#96a8ae"/>
   <Block p={[-3.2,1.7,-.13]} s={[.07,.07,.5]} c="#96a8ae"/>
   <Block p={[2.7,1.43,-.12]} s={[.85,.78,.63]} c="#4f615d"/>
   <mesh position={[.6,1.35,0]} castShadow><cylinderGeometry args={[.22,.28,.55,16]}/><meshStandardMaterial color="#d1dfe1"/></mesh>
   {Array.from({length:5},(_,i)=><mesh key={i} position={[-.6+i*.3,1.17,.54]}><cylinderGeometry args={[.09,.07,.18,12]}/><meshStandardMaterial color="#f4e9d0"/></mesh>)}
  </group>
  {LOUNGE_SEATS.filter(s=>s.id.startsWith('pantry')).map(s=>{const [x,,z]=toWorld(s.x,s.y);return <group key={s.id} position={[x,0,z]}><Block p={[0,.28,0]} s={[.65,.13,.65]} c="#bb9a74"/><Block p={[0,.12,0]} s={[.12,.24,.12]} c="#4b5d5a"/></group>;})}
  {LOUNGE_SOFAS.map(sofa=><Sofa key={sofa.id} sofa={sofa}/>)}
  {LOUNGE_TABLES.map(table=><SharedTable key={table.id} table={table} sim={sim} lively={lively}/>)}
  <Plant x={980} y={95}/><Plant x={1600} y={270}/><Plant x={1040} y={780}/><Plant x={1530} y={1060}/>
  {/* A small shelf belongs to the room, not to an agent slot. */}
  <group position={toWorld(1635,720)}><Block p={[0,.75,0]} s={[.32,1.5,2.2]} c="#a69170"/>{[-.65,0,.65].map(dz=><Block key={dz} p={[-.2,.85,dz]} s={[.15,.65,.5]} c="#839b91"/>)}</group>
 </group>;
}
