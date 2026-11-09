"use client";
import {OrbitControls} from '@react-three/drei';
import {useFrame,useThree} from '@react-three/fiber';
import {useMemo,useRef,type RefObject} from 'react';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import * as THREE from 'three';
import type {RenderAgent} from '@/features/retro-office/core/types';
import {createCameraIntent,officeCameraFrame,type CameraCommand} from './cameraViews';

export function OfficeCamera({width,height,command,actors,reducedMotion,onManual}:{width:number;height:number;command:CameraCommand;actors:RefObject<Map<string,RenderAgent>>;reducedMotion:boolean;onManual:()=>void}){
 const controls=useRef<OrbitControlsImpl>(null);
 const intent=useMemo(()=>createCameraIntent(),[]);
 const {camera,size}=useThree();
 const ready=useRef(false),moving=useRef(true),previousView=useRef(''),previousSize=useRef('');
 const target=useMemo(()=>new THREE.Vector3(),[]),position=useMemo(()=>new THREE.Vector3(),[]);
 useFrame((_,delta)=>{
  const orbit=controls.current;if(!orbit||!(camera instanceof THREE.OrthographicCamera))return;
  const actor=command.employeeId?actors.current.get(command.employeeId):undefined;
  const available=!!actor&&'observation' in actor&&!actor.observation?.departing;
  const state=intent.update(command,available);
  const viewportKey=`${size.width}:${size.height}:${width}:${height}`;
  const viewChanged=previousView.current!==state.view;
  const resized=previousSize.current!==viewportKey;
  previousSize.current=viewportKey;previousView.current=state.view;
  if(state.changed||viewChanged||resized)moving.current=true;
  if(state.manual)return;
  if(!moving.current&&state.view!=='employee')return;
  const frame=officeCameraFrame(state.view,{width,height},size,actor);
  target.set(...frame.target);position.set(target.x+16,target.y+24,target.z+22);
  const blend=!ready.current||reducedMotion?1:1-Math.exp(-Math.min(delta,.1)*5);
  orbit.target.lerp(target,blend);camera.position.lerp(position,blend);
  Object.assign(camera,{zoom:THREE.MathUtils.lerp(camera.zoom,frame.zoom,blend)});
  camera.updateProjectionMatrix();orbit.update();ready.current=true;
  if(camera.position.distanceTo(position)<.01&&Math.abs(camera.zoom-frame.zoom)<.02)moving.current=false;
 });
 return <OrbitControls ref={controls} minZoom={3} maxZoom={180} maxPolarAngle={Math.PI/2.2} enableDamping={!reducedMotion} onStart={()=>{intent.interrupt();onManual();}}/>;
}
