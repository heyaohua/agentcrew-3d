import type {NavGrid2D} from '@/lib/office/pathfinding';

export type LoungeSeat={id:string;x:number;y:number;facing:number;activity:'tea'|'game'};
export type LoungeSofa={id:string;x:number;y:number;length:number;facing:number;color:string};
// Furniture is authored once for the room, never cloned per agent.
export const LOUNGE_SOFAS:LoungeSofa[]=[
 {id:'main-north',x:1220,y:350,length:360,facing:0,color:'#bc855e'},
 {id:'main-west',x:1010,y:510,length:240,facing:Math.PI/2,color:'#bc855e'},
 {id:'main-south',x:1220,y:640,length:260,facing:Math.PI,color:'#bc855e'},
 {id:'window',x:1570,y:480,length:250,facing:-Math.PI/2,color:'#6e9590'},
 {id:'game-north',x:1310,y:735,length:270,facing:0,color:'#7489a8'},
 {id:'game-south',x:1310,y:985,length:270,facing:Math.PI,color:'#7489a8'},
 {id:'reading-bench',x:1060,y:1070,length:240,facing:Math.PI,color:'#9b9877'},
];
export const LOUNGE_TABLES=[
 {id:'tea',x:1220,y:485,w:180,h:100,game:false},
 {id:'window-tea',x:1460,y:480,w:65,h:100,game:false},
 {id:'board',x:1310,y:860,w:210,h:95,game:true},
];
const sofaSeats=LOUNGE_SOFAS.flatMap(sofa=>{
 const count=sofa.id==='main-north'?4:3;
 return Array.from({length:count},(_,i)=>{
  const offset=(i-(count-1)/2)*80;
  return {id:`${sofa.id}-${i}`,x:sofa.x+Math.cos(sofa.facing)*offset,y:sofa.y-Math.sin(sofa.facing)*offset,facing:sofa.facing,activity:sofa.id.startsWith('game')?'game' as const:'tea' as const};
 });
});
export const LOUNGE_SEATS:LoungeSeat[]=[...sofaSeats,...Array.from({length:6},(_,i)=>({id:`pantry-${i}`,x:1060+i*95,y:210,facing:Math.PI,activity:'tea' as const}))];
export const loungeRoomSize=(capacity:number)=>({width:1660,height:Math.max(1150,Math.ceil(capacity/4)*230+190)});

/** Same furniture footprints used by the scene; seat approaches are cut from the front. */
export function buildLoungeNavGrid(capacity:number):NavGrid2D{
 const {width,height}=loungeRoomSize(capacity),cellSize=10,cols=Math.ceil(width/cellSize),rows=Math.ceil(height/cellSize);
 const cells=new Uint8Array(cols*rows);
 const rect=(x:number,y:number,w:number,h:number,value=1)=>{
  for(let r=Math.max(0,Math.floor((y-h/2)/cellSize));r<=Math.min(rows-1,Math.floor((y+h/2)/cellSize));r++)
   for(let c=Math.max(0,Math.floor((x-w/2)/cellSize));c<=Math.min(cols-1,Math.floor((x+w/2)/cellSize));c++)cells[r*cols+c]=value;
 };
 rect(width/2,0,width,30);rect(0,height/2,30,height);rect(width,height/2,30,height);rect(width/2,height,width,30);
 // The perimeter pantry and the communal tables are solid.
 rect(1300,105,590,95);
 for(const t of LOUNGE_TABLES)rect(t.x,t.y,t.w+14,t.h+14);
 for(const sofa of LOUNGE_SOFAS){
  const horizontal=Math.abs(Math.sin(sofa.facing))<.5;
  rect(sofa.x,sofa.y,horizontal?sofa.length+20:75,horizontal?75:sofa.length+20);
 }
 for(const s of sofaSeats){
  const dx=Math.sin(s.facing),dy=Math.cos(s.facing);
  rect(s.x+dx*30,s.y+dy*30,Math.abs(dx)>0.5?70:34,Math.abs(dy)>0.5?70:34,0);
 }
 for(let i=0;i<capacity;i++)rect(120+(i%4)*180,190+Math.floor(i/4)*230-46,140,75);
 return {cells,cols,rows,cellSize};
}
