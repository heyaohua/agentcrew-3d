import {toWorld} from '@/features/retro-office/core/geometry';

export type OfficeView='overview'|'work'|'lounge'|'employee';
export type CameraFrame={view:OfficeView;target:[number,number,number];zoom:number};
type Size={width:number;height:number};

/** Fit the same isometric angle used by the office; room coordinates are pixels. */
export function officeCameraFrame(view:OfficeView,room:Size,viewport:Size,employee?:{x:number;y:number}):CameraFrame{
 let actual=view;
 if(actual==='employee'&&!employee)actual='overview';
 let x=room.width/2,y=room.height/2,w=room.width,h=room.height;
 if(actual==='work'){x=440;w=880;h=room.height;}
 if(actual==='lounge'){x=1290;y=580;w=760;h=1150;}
 if(actual==='employee'&&employee){x=employee.x;y=employee.y;w=320;h=320;}
 const target=toWorld(x,y);
 target[1]=actual==='employee'?.65:0;
 const zoom=Math.min(Math.max(viewport.width,1)/(w*.018*.88+h*.018*.6),Math.max(viewport.height,1)/(w*.018*.3+h*.018*.7+4))*.83;
 return {view:actual,target,zoom:Math.max(3,Math.min(150,zoom))};
}

export type CameraCommand={view:OfficeView;revision:number;employeeId?:string|null};
/** User gestures cancel tracking until an explicit new camera command. Polling is not a command. */
export function createCameraIntent(){
 let key='';let manual=false;
 return {
  interrupt(){manual=true;},
  update(command:CameraCommand,employeeAvailable:boolean){
   const next=`${command.view}:${command.revision}:${command.view==='employee'?command.employeeId??'':''}`;
   const changed=next!==key;
   if(changed){key=next;manual=false;}
   const lost=command.view==='employee'&&!employeeAvailable;
   return {manual,changed,view:lost?'overview' as const:command.view};
  },
 };
}
