"use client";
import {Canvas,useFrame} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import * as THREE from 'three';
import {AgentModel} from '@/features/retro-office/objects/agents';
import {getWoodFloorTextures,withRepeat} from '@/features/retro-office/core/proceduralTextures';
import {toWorld} from '@/features/retro-office/core/geometry';
import type {OfficeAgent,RenderAgent} from '@/features/retro-office/core/types';
import {createWorkRestSimulation,screenIsOn,workRestLayout,workRestSlot} from './workRest';

import {ObserverLounge3D} from "./ObserverLounge3D";
import {employeeStyle} from './officeLife';
import {OfficeCamera} from './OfficeCamera';
import type {CameraCommand,OfficeView} from './cameraViews';

type Simulation=ReturnType<typeof createWorkRestSimulation>;
function Box({position,size,color}:{position:[number,number,number];size:[number,number,number];color:string}){
 return <mesh position={position} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.72}/></mesh>;
}
function Chair({x,y,rest=false}:{x:number;y:number;rest?:boolean}){
 const [wx,,wz]=toWorld(x,y);
 return <group position={[wx,0,wz]}>
  <Box position={[0,rest?.2:.22,0]} size={[rest?1.05:.65,rest?.24:.13,rest?.82:.62]} color={rest?'#bd825d':'#354b5b'}/>
  {rest?[-.52,.52].map(dx=><Box key={dx} position={[dx,.39,0]} size={[.18,.4,.87]} color="#996749"/>):null}
  <Box position={[0,.5,.32]} size={[rest?1.16:.65,rest?.65:.55,rest?.22:.12]} color={rest?'#bc805c':'#354b5b'}/>
  {[-.25,.25].flatMap(dx=>[-.23,.23].map(dz=><Box key={`${dx}:${dz}`} position={[dx,.1,dz]} size={[.07,.2,.07]} color="#26383f"/>))}
 </group>;
}
function Monitor({actorId,sim,x,y,lively}:{actorId?:string;sim:Simulation;x:number;y:number;lively:boolean}){
 const face=useRef<THREE.MeshBasicMaterial>(null),code=useRef<THREE.Group>(null);
 const [wx,,wz]=toWorld(x,y);
 useFrame(({clock})=>{
  const a=actorId?sim.actors.get(actorId):undefined;
  const on=a&&screenIsOn(a);
  if(face.current)face.current.color.set(on?'#29bfa9':'#080e14');
  if(code.current){code.current.visible=!!on;code.current.position.y=lively?Math.sin(clock.elapsedTime*.8)*.025:0;}
 });
 return <group position={[wx,0,wz]}>
  <Box position={[0,.73,0]} size={[.36,.045,.24]} color="#25303c"/>
  <Box position={[0,.91,0]} size={[.06,.36,.06]} color="#25303c"/>
  <Box position={[0,1.14,0]} size={[.95,.6,.07]} color="#1a2530"/>
  <mesh position={[0,1.14,.041]}><planeGeometry args={[.84,.49]}/><meshBasicMaterial ref={face} color="#080e14"/></mesh>
  <group ref={code} visible={false}>
   {Array.from({length:6},(_,i)=><mesh key={i} position={[-.22,1.32-i*.065,.044]}>
    <planeGeometry args={[.25+(i%3)*.12,.018]}/><meshBasicMaterial color={i%2?'#99c2e4':'#63d9b6'}/>
   </mesh>)}
  </group>
 </group>;
}
function Station({seat,actorId,sim,lively}:{seat:number;actorId?:string;sim:Simulation;lively:boolean}){
 const p=workRestSlot(seat).work;
 const [wx,,wz]=toWorld(p.x,p.y-46);
 return <group>
  <group position={[wx,0,wz]}>
   <Box position={[0,.67,0]} size={[2.1,.13,1.05]} color="#b89e7d"/>
   {[-.8,.8].flatMap(dx=>[-.38,.38].map(dz=><Box key={`${dx}:${dz}`} position={[dx,.31,dz]} size={[.08,.62,.08]} color="#384951"/>))}
   <Box position={[0,.75,.36]} size={[.7,.04,.23]} color="#27353f"/>
   {actorId?<>
    <mesh position={[.77,.84,.23]}><cylinderGeometry args={[.10,.08,.18,16]}/><meshStandardMaterial color={employeeStyle(actorId).color}/></mesh>
    <mesh position={[.87,.84,.23]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.055,.018,8,16]}/><meshStandardMaterial color={employeeStyle(actorId).color}/></mesh>
    <Box position={[-.78,.81,-.25]} size={[.22,.16,.22]} color="#ecdbc3"/>
    <mesh position={[-.78,.99,-.25]} scale={[.16,.22,.12]}><sphereGeometry args={[1,10,10]}/><meshStandardMaterial color="#719a6a"/></mesh>
   </>:null}
  </group>
  <Monitor x={p.x} y={p.y-59} sim={sim} actorId={actorId} lively={lively}/>
  <Chair x={p.x} y={p.y}/>
 </group>;
}
type Relationship={child:string;parent:string};
type LifeProps={lively:boolean;selectedId?:string|null;relationships?:Relationship[];command:CameraCommand;reducedMotion:boolean;detailedLabels:boolean;onManual:()=>void};
function CollaborationLink({sim,child,parent}:{sim:Simulation;child:string;parent:string}){
 const lineRef=useRef<THREE.Line<THREE.BufferGeometry,THREE.LineDashedMaterial>>(null);
 const line=useMemo(()=>new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineDashedMaterial({color:'#efcc8e',dashSize:.16,gapSize:.12,transparent:true,opacity:.7})),[]);
 useEffect(()=>()=>{line.geometry.dispose();line.material.dispose();},[line]);
 useFrame(()=>{
  const activeLine=lineRef.current;if(!activeLine)return;
  const from=sim.actors.get(child),to=sim.actors.get(parent);activeLine.visible=!!from&&!!to;
  if(!from||!to)return;
  const points=activeLine.geometry.attributes.position as THREE.BufferAttribute;
  const a=toWorld(from.x,from.y),b=toWorld(to.x,to.y);
  points.setXYZ(0,a[0],.12,a[2]);points.setXYZ(1,b[0],.12,b[2]);points.needsUpdate=true;activeLine.computeLineDistances();
  activeLine.geometry.computeBoundingSphere();
 });
 return <primitive object={line} ref={lineRef}/>;
}
function SelectedEmployee({sim,id}:{sim:Simulation;id:string}){
 const ring=useRef<THREE.Mesh>(null);
 useFrame(()=>{if(!ring.current)return;const a=sim.actors.get(id);ring.current.visible=!!a;if(a){const [x,,z]=toWorld(a.x,a.y);ring.current.position.set(x,.09,z);}});
 return <mesh ref={ring} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.44,.5,48]}/><meshBasicMaterial color="#f3d39a" transparent opacity={.85} depthWrite={false}/></mesh>;
}
function Room({agents,onSelect,lively,selectedId,relationships=[],command,reducedMotion,detailedLabels,onManual}:{agents:OfficeAgent[];onSelect?:(id:string)=>void}&LifeProps){
 const sim=useMemo(()=>createWorkRestSimulation(),[]);
 const [hovered,setHovered]=useState<string|null>(null);
 const wood=useMemo(()=>withRepeat(getWoodFloorTextures(),12,6),[]);
 const input=useRef(agents);
 useEffect(()=>{input.current=agents;},[agents]);
 const refs=useRef<RenderAgent[]>([]);
 const capacity=Math.max(8,...agents.map(a=>(a.observation?.seat??0)+1));
 const layout=workRestLayout(capacity), center=toWorld(layout.width/2,layout.height/2);
 // Runs before all model animation callbacks so labels and props read the same frame.
 useFrame((_,dt)=>{sim.update(input.current,dt);refs.current=[...sim.actors.values()];},-1);
 const lookup=useRef(sim.actors) as RefObject<Map<string,RenderAgent>>;
 const bySeat=new Map(agents.map(a=>[a.observation?.seat??0,a.id]));
 const w=layout.width*.018,h=layout.height*.018;
 return <>
  <color attach="background" args={['#101b22']}/>
  <ambientLight intensity={.7}/><hemisphereLight args={['#fff0d9','#b7a18a',.8]}/>
  <directionalLight position={[center[0]-5,22,center[2]+6]} intensity={2.2} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-35} shadow-camera-right={35} shadow-camera-top={35} shadow-camera-bottom={-35}/>
  <OfficeCamera width={layout.width} height={layout.height} command={command} actors={lookup} reducedMotion={reducedMotion} onManual={onManual}/>
  <group position={center}>
   <Box position={[0,-.15,0]} size={[w,.3,h]} color="#4b565b"/>
   <mesh position={[-7.3,.015,0]} receiveShadow><boxGeometry args={[14.7,.03,h-.2]}/><meshStandardMaterial map={wood.map} color="#bc9e7b" roughness={.85}/></mesh>
   <Box position={[8,.02,0]} size={[12.5,.04,h-.2]} color="#4d6968"/>
   <Box position={[0,1,-h/2]} size={[w,2,.14]} color="#d6d6c9"/>
   <Box position={[-w/2,1,0]} size={[.14,2,h]} color="#d6d6c9"/>
  </group>
  {[{x:420,label:'工作区',tone:'#77dfc1'},{x:1320,label:'休息区',tone:'#edc594'}].map(z=>{
   const p=toWorld(z.x,55);return <Html key={z.label} position={[p[0],.12,p[2]]} center style={{pointerEvents:'none'}}>
    <div className="observer-zone-marker" style={{color:z.tone}}>{z.label}</div>
   </Html>;
  })}
  {Array.from({length:capacity},(_,seat)=><group key={seat}><Station seat={seat} actorId={bySeat.get(seat)} sim={sim} lively={lively}/></group>)}
  <ObserverLounge3D sim={sim} lively={lively}/>
  {selectedId?<SelectedEmployee sim={sim} id={selectedId}/>:null}
  {relationships.filter(r=>r.child===selectedId||r.parent===selectedId).map(r=><CollaborationLink key={r.child} sim={sim} {...r}/>)}
  {agents.map(a=>{
   const expanded=detailedLabels||a.id===selectedId||a.id===hovered;
   return <AgentModel key={a.id} agentId={a.id} name={expanded?a.name:employeeStyle(a.id).code} subtitle={expanded?a.subtitle:null} status={a.status} color={a.color} agentsRef={refs} agentLookupRef={lookup} onClick={onSelect} onHover={setHovered} onUnhover={()=>setHovered(null)} nameplateBaseHeight={1.2} nameplateMode={expanded?'standard':'compact'} observationMotion={lively} suppressSpeechBubble/>;
  })}
 </>;
}
const VIEW_LABELS:Record<OfficeView,string>={overview:'全景',work:'看工作',lounge:'去休息区',employee:'近看员工'};
export function ObserverOffice3D({agents,onAgentChatSelect,lively=true,selectedId,relationships,reducedMotion=false}:{agents:OfficeAgent[];onAgentChatSelect?:(id:string)=>void;lively?:boolean;selectedId?:string|null;relationships?:Relationship[];reducedMotion?:boolean}){
 const [request,setRequest]=useState<{view:OfficeView;revision:number}>({view:'overview',revision:0});
 const [manualCommand,setManualCommand]=useState<string|null>(null);
 const [detailedLabels,setDetailedLabels]=useState(false);
 const selected=agents.find(a=>a.id===selectedId&&!a.observation?.departing);
 const activeView=request.view==='employee'&&!selected?'overview':request.view;
 const chooseView=(view:OfficeView)=>{setRequest(previous=>({view,revision:previous.revision+1}));};
 const command={...request,employeeId:selectedId};
 const commandKey=`${request.view}:${request.revision}:${request.view==='employee'?selectedId??'':''}`;
 const manual=manualCommand===commandKey;
 return <div className="observer-work-rest-scene">
  <Canvas orthographic camera={{position:[16,24,22],zoom:35,near:.1,far:500}} shadows dpr={[1,1.5]}><Room agents={agents} onSelect={onAgentChatSelect} lively={lively} selectedId={selectedId} relationships={relationships} command={command} reducedMotion={reducedMotion} detailedLabels={detailedLabels} onManual={()=>setManualCommand(commandKey)}/></Canvas>
  <div className="observer-office-caption">今天，也一起把事情做好 <span>点选伙伴 · 近看工作与茶歇</span></div>
  <div className="observer-camera-tools">
  <nav className="observer-camera-bar" aria-label="办公室镜头">
   {(Object.keys(VIEW_LABELS) as OfficeView[]).map(view=><button key={view} aria-pressed={!manual&&activeView===view} disabled={view==='employee'&&!selected} title={view==='employee'&&!selected?'先选择一位在场的员工':VIEW_LABELS[view]} onClick={()=>chooseView(view)}>{VIEW_LABELS[view]}</button>)}
   <button className="observer-label-toggle" aria-pressed={detailedLabels} onClick={()=>setDetailedLabels(!detailedLabels)}>{detailedLabels?'名牌：详细':'名牌：简洁'}</button>
  </nav>
  <div className="observer-camera-hint" role="status">{manual?'自由视角 · 点击镜头按钮重新取景':request.view==='employee'&&!selected?'伙伴不在场，已回到全景':activeView==='employee'?`正在跟随 ${selected?.name} · 拖动即可自由查看`:'滚轮靠近 · 拖动环顾 · 短编号对应员工档案'}</div>
  </div>
 </div>;
}
