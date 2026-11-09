import {expect,it} from 'vitest';
import {createCameraIntent,officeCameraFrame} from '@/features/observer/cameraViews';
import {toWorld} from '@/features/retro-office/core/geometry';
const room={width:1660,height:1150},viewport={width:1400,height:900};
it('frames work and lounge on their own areas, with a closer employee view',()=>{
 const wide=officeCameraFrame('overview',room,viewport);
 const work=officeCameraFrame('work',room,viewport),rest=officeCameraFrame('lounge',room,viewport);
 const close=officeCameraFrame('employee',room,viewport,{x:120,y:190});
 expect(work.target[0]).toBeLessThan(wide.target[0]);expect(rest.target[0]).toBeGreaterThan(wide.target[0]);
 expect(close.zoom).toBeGreaterThan(wide.zoom*2);
 expect(close.target).toEqual([toWorld(120,190)[0],.65,toWorld(120,190)[2]]);
});
it('uses overview when an employee has left or is unknown',()=>{
 expect(officeCameraFrame('employee',room,viewport)).toEqual(officeCameraFrame('overview',room,viewport));
});
it('adapts safely to small screens and larger offices',()=>{
 for(const size of [{width:0,height:0},{width:360,height:280},viewport]){
  const frame=officeCameraFrame('overview',{width:1660,height:4000},size);expect(Number.isFinite(frame.zoom)).toBe(true);expect(frame.zoom).toBeGreaterThanOrEqual(3);expect(frame.zoom).toBeLessThanOrEqual(150);
 }
 expect(officeCameraFrame('overview',{width:1660,height:4000},viewport).zoom).toBeLessThan(officeCameraFrame('overview',room,viewport).zoom);
});
it('manual gestures interrupt tracking and repeated data polls do not steal the camera',()=>{
 const intent=createCameraIntent(),command={view:'employee' as const,revision:1,employeeId:'one'};
 expect(intent.update(command,true).manual).toBe(false);intent.interrupt();
 for(let i=0;i<20;i++)expect(intent.update({...command},true).manual).toBe(true);
 expect(intent.update({...command,revision:2},true).manual).toBe(false);
});
it('follows a newly selected employee, and falls back when that actor disappears',()=>{
 const intent=createCameraIntent();const command={view:'employee' as const,revision:1,employeeId:'one'};
 intent.update(command,true);intent.interrupt();
 expect(intent.update({...command,employeeId:'two'},true)).toMatchObject({manual:false,view:'employee',changed:true});
 expect(intent.update({...command,employeeId:'two'},false).view).toBe('overview');
});

it('keeps a manual view when polling removes and restores the selected actor',()=>{
 const intent=createCameraIntent(),command={view:'employee' as const,revision:1,employeeId:'one'};
 intent.update(command,true);intent.interrupt();
 expect(intent.update(command,false)).toMatchObject({manual:true,changed:false,view:'overview'});
 expect(intent.update(command,true)).toMatchObject({manual:true,changed:false,view:'employee'});
});
