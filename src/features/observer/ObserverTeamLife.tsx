"use client";
import {useSyncExternalStore} from 'react';
import {describeObserverEvent,employeeStyle} from './officeLife';
import {TOOL_NAMES,type ObserverSession} from './model';

const subscribe=(notify:()=>void)=>{
 const query=window.matchMedia('(prefers-reduced-motion: reduce)');
 query.addEventListener('change',notify);return()=>query.removeEventListener('change',notify);
};
export function useReducedOfficeMotion(){return useSyncExternalStore(subscribe,()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches,()=>false);}

export function EmployeeBadge({id}:{id:string}){
 const style=employeeStyle(id);
 return <span className="observer-employee" title="固定的装扮与动作风格，不代表能力或绩效" style={{color:style.color}}><i aria-hidden="true">●</i> {style.code} <span>{style.name}</span></span>;
}

export function ObserverTeamLife({sessions,working,resting,online,onSelect}:{sessions:(ObserverSession&{uncertain:boolean})[];working:number;resting:number;online:boolean;onSelect:(id:string)=>void}){
 // This is an explicitly dated event list, never a fabricated achievement counter.
 const recent=[...sessions].filter(s=>s.updatedAt>0).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,3);
 return <section className="observer-team-life" aria-label="团队近况">
  <div className="observer-team-heading"><span className="observer-team-mark" aria-hidden="true">✦</span><div><strong>{!online?'等伙伴们重新连上':working?`${working} 位伙伴正在投入工作`:resting?'歇一会儿，再一起出发':'办公室，等你们来'}</strong><p>认真做事，也好好休息。</p></div></div>
  {recent.length>0?<ol>{recent.map(s=><li key={s.id}><button onClick={()=>onSelect(s.id)}><span className="observer-team-dot" style={{background:s.uncertain?'#80909b':employeeStyle(s.id).color}}/><div><strong>{TOOL_NAMES[s.tool]} <small>{employeeStyle(s.id).code}</small></strong><span>{s.uncertain?'状态未知 · 最后记录：':'最近记录：'}{s.source==='codex-lifecycle'?(s.state==='ended'?'本轮告一段落':s.state==='working'?'开始新一轮':s.state==='interrupted'?'本轮已中断':s.lastEvent):describeObserverEvent(s.lastEvent,s.toolName)}</span></div><time dateTime={new Date(s.updatedAt).toISOString()}>{new Date(s.updatedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</time></button></li>)}</ol>:null}
  <small className="observer-team-footnote">近况来自真实事件 · 点击查看记录</small>
 </section>;
}
