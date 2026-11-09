"use client";
import dynamic from "next/dynamic";
import {useEffect,useMemo,useState,useRef} from "react";
import Link from "next/link";
import {buildObserverView,TOOL_NAMES,type ObserverSnapshot} from "./model";
import "./observer.css";
import {EmployeeBadge,ObserverTeamLife,useReducedOfficeMotion} from './ObserverTeamLife';
import {describeObserverEvent} from './officeLife';
import {createLifeRoster} from './lifeRoster';
const Office3D=dynamic(()=>import("./ObserverOffice3D").then(m=>m.ObserverOffice3D),{ssr:false,loading:()=> <div className="observer-loading">正在加载 3D 办公室…</div>});
const Office2D=dynamic(()=>import("@/features/pixel-office/PixelOffice2D").then(m=>m.PixelOffice2D),{ssr:false,loading:()=> <div className="observer-loading">正在加载像素办公室…</div>});
const EMPTY:ObserverSnapshot={sessions:[],generatedAt:0,staleAfterMs:120000};
function age(seconds:number){return seconds<60?seconds+" 秒前":seconds<3600?Math.floor(seconds/60)+" 分钟前":Math.floor(seconds/3600)+" 小时前";}
export function ObserverScreen(){
 const seatById=useRef(new Map<string,number>());
 const sidebarRef=useRef<HTMLElement>(null);
 const lifeRoster=useRef(createLifeRoster());
 const [snapshot,setSnapshot]=useState(EMPTY);
 const [online,setOnline]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [now,setNow]=useState(0);
 const [hideEnded,setHideEnded]=useState(true);
 const [mode,setMode]=useState<"3d"|"2d">("3d");
 const [selected,setSelected]=useState<string|null>(null);
 const reducedMotion=useReducedOfficeMotion();
 const [motionOverride,setMotionOverride]=useState<boolean|null>(null);
 const lively=motionOverride??!reducedMotion;
 useEffect(()=>{if(selected)sidebarRef.current?.scrollTo({top:0});},[selected]);
 useEffect(()=>{
  let stopped=false;let timer:ReturnType<typeof setTimeout>;let controller:AbortController|null=null;
  const poll=async()=>{
   controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),4000);
   try{
    const res=await fetch("/api/observer/state",{cache:"no-store",signal:controller.signal});
    if(!res.ok)throw new Error("offline");
    const data=await res.json() as ObserverSnapshot;
    if(!Array.isArray(data.sessions))throw new Error("invalid");
    if(!stopped){setSnapshot(data);setOnline(true);}
   }catch{if(!stopped)setOnline(false);}
   finally{clearTimeout(timeout);if(!stopped){setLoaded(true);setNow(Date.now());timer=setTimeout(poll,2000);}}
  };
  void poll();const clock=setInterval(()=>setNow(Date.now()),1000);
  return()=>{stopped=true;clearTimeout(timer);clearInterval(clock);controller?.abort();};
 },[]);
 const view=useMemo(()=>buildObserverView(snapshot.sessions,{online,now,staleAfterMs:snapshot.staleAfterMs,hideEnded,seatById:seatById.current}),[snapshot,online,now,hideEnded]);
 const allRows=useMemo(()=>buildObserverView(snapshot.sessions,{online,now,staleAfterMs:snapshot.staleAfterMs,hideEnded:false}).rows,[snapshot,online,now]);
 const sceneAgents=useMemo(()=>lifeRoster.current.update(view.agents,new Set(allRows.filter(s=>s.state==='ended'&&!s.uncertain).map(s=>s.id)),now,online),[view,allRows,now,online]);
 const detail=allRows.find(s=>s.id===selected);
 const working=view.counts.working;
 return <main className="observer-root">
  <header className="observer-header">
   <div><div className="observer-eyebrow">AI 伙伴办公室</div><h1>AgentCrew 3D</h1></div>
   <div className="observer-summary"><span><b>{view.counts.main}</b> 主会话</span><span><b>{view.counts.subagents}</b> 子 Agent</span><span><b>{working}</b> 正在工作</span><span className="observer-muted-count"><b>{view.counts.unknown}</b> 状态未知</span><span className={view.attention.length?"observer-gold":""}><b>{view.attention.length}</b> 等待你处理</span></div>
   <div className="observer-actions"><span role="status" className={online?"observer-online":"observer-offline"}>{online?"● 已连接":loaded?"● 连接中断":"● 正在连接"}</span>
    <button aria-pressed={mode==="3d"} onClick={()=>setMode("3d")}>3D</button><button aria-pressed={mode==="2d"} onClick={()=>setMode("2d")}>2D</button>
    {mode==='3d'?<button aria-pressed={lively} onClick={()=>setMotionOverride(!lively)} title="切换人物生活动作；工作状态照常更新">{lively?'生活动作：开':'生活动作：关'}</button>:null}
    <button onClick={()=>{void document.documentElement.requestFullscreen?.().catch(()=>{});}}>全屏</button>
    {online && snapshot.publicReadOnly === false ? <Link href="/office">运行时办公室 ↗</Link> : null}
   </div>
  </header>
  <div className="observer-body">
   <section className="observer-scene" aria-label="Agent 办公室">
    {mode==="3d"?<Office3D agents={sceneAgents} onAgentChatSelect={setSelected} lively={lively} reducedMotion={reducedMotion} selectedId={selected} relationships={view.rows.filter(s=>s.parentId).map(s=>({child:s.id,parent:s.parentId!}))} />:
     <Office2D agents={view.agents} observationMode renderMode="2d" onRenderModeChange={setMode} onAgentChatSelect={setSelected}
      officeTitle="AgentCrew 3D" officeTitleLoaded gatewayStatus={online?"connected":"disconnected"}
      remoteOfficeEnabled={false} remoteOfficeSourceKind="presence_endpoint" remoteOfficeLabel="" remoteOfficePresenceUrl="" remoteOfficeGatewayUrl="" remoteOfficeTokenConfigured={false}
      voiceRepliesEnabled={false} voiceRepliesVoiceId={null} voiceRepliesSpeed={1} voiceRepliesLoaded />}
    {!online&&loaded?<div role="alert" className="observer-banner">观察服务未连接，画面中的状态可能过期。请确认以 <code>npm run observe</code> 启动。</div>:null}
    {online&&snapshot.sessions.length===0?<div className="observer-empty"><div className="observer-eyebrow">等待第一条真实事件</div><h2>终端里的工作，会出现在这里</h2><p>接好 Hook 后，在 Codex、Claude Code 或 Kimi Code 中提交消息。</p><p>已打开的终端可能需要重新加载 Hook。这里不会自动接管会话。</p></div>:null}
    <div className="observer-scene-note">观察模式 · 操作请回到终端{view.counts.unknown>0?` · ${view.counts.unknown} 个状态未知，暂不安排工作或休息`:""}</div>
   </section>
   <aside className="observer-sidebar" ref={sidebarRef}>
    <ObserverTeamLife sessions={allRows} working={working} resting={view.counts.resting} online={online} onSelect={setSelected}/>
    {detail?<section className="observer-detail"><div className="observer-card-top"><h3>员工档案</h3><button onClick={()=>setSelected(null)} aria-label="关闭会话详情">×</button></div><EmployeeBadge id={detail.id}/><p>{TOOL_NAMES[detail.tool]} · {detail.displayLabel}</p><code>{detail.project}</code><code>{detail.agentId?"上级":"会话"}：{detail.sessionId}</code>{detail.agentId?<code>子 Agent：{detail.agentId} · {detail.agentType}</code>:null}{detail.parentId?<button className="observer-parent-link" onClick={()=>setSelected(detail.parentId!)}>查看上级伙伴 ↗</button>:null}<h3>最近事件</h3><ol>{[...detail.events].reverse().map((e,i)=><li key={i}><time>{new Date(e.at).toLocaleTimeString("zh-CN")}</time> {e.event} {e.toolName}</li>)}</ol></section>:null}
    <div className="observer-sidebar-title"><h2>会话动态</h2><label><input type="checkbox" checked={hideEnded} onChange={e=>setHideEnded(e.target.checked)} /> 隐藏历史（{view.counts.history}）</label></div>
    {view.attention.length>0?<div className="observer-attention" role="status"><strong>{view.attention.length} 个会话等待你处理</strong><p>在终端确认或回答后，大屏会随新事件更新。</p></div>:null}
    <div className="observer-list">
     {[...view.rows].sort((a,b)=>Number(b.state==="waiting")-Number(a.state==="waiting") || b.updatedAt-a.updatedAt).map(s=><button key={s.id} className={"observer-card "+(s.state==="waiting"&&!s.uncertain?"is-waiting ":"")+(selected===s.id?"is-selected":"")} onClick={()=>setSelected(selected===s.id?null:s.id)}>
      <div className="observer-card-top"><strong>{TOOL_NAMES[s.tool]}{s.agentId?" · 子 Agent":" · 主会话"}</strong><span className={"observer-badge state-"+(s.uncertain?"unknown":s.state)}>{s.displayLabel}</span></div>
      <div className="observer-project" title={s.project}>{s.projectName}</div>
      <EmployeeBadge id={s.id}/>
      <div className="observer-meta"><code>{(s.agentId||s.sessionId).slice(0,12)}</code><span>{age(s.ageSeconds)}</span></div>
      <div className="observer-event" title={s.lastEvent+' '+s.toolName}>{describeObserverEvent(s.lastEvent,s.toolName)}</div>
      {s.agentId?<div className="observer-relation">{s.agentType||"子 Agent"} · 上级 {s.sessionId.slice(0,12)}</div>:null}
      {(s.activeChildren??0)>0?<div className="observer-relation">{s.activeChildren} 个子 Agent 正在工作</div>:null}
      {s.source==="codex-lifecycle"?<div className="observer-evidence">由本机生命周期记录确认</div>:null}
      {s.freshness==="process"?<div className="observer-evidence">所属进程仍在运行 · 尚未收到本轮结束事件</div>:null}
      {s.uncertain?<div className="observer-stale">当前状态未确认 · 最后记录：{s.label}</div>:null}
     </button>)}
     {view.rows.length===0?<p className="observer-muted">{snapshot.sessions.length?"没有符合筛选条件的会话":"暂未收到会话事件"}</p>:null}
    </div>
    <footer>只收集状态元数据。没有新事件不等于任务完成；“本轮已结束”不代表验收通过。</footer>
   </aside>
  </div>
 </main>;
}
