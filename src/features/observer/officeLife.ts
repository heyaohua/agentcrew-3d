import type {RenderAgent} from '@/features/retro-office/core/types';

const STYLES = [
 {name:'轻快派',pace:1.16,color:'#efb67c'},
 {name:'沉稳派',pace:.85,color:'#89c7bd'},
 {name:'好奇派',pace:1,color:'#b9ace5'},
] as const;

/** Cosmetic identity only: never a skill, performance rating or inferred mood. */
export function employeeStyle(id:string){
 let hash=2166136261;
 for(const char of id)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
 return {...STYLES[hash%STYLES.length],phase:(hash%1000)/100,code:hash.toString(16).padStart(8,'0').slice(-4).toUpperCase()};
}

export type LifePose={kind:'type'|'focus'|'think'|'sip'|'play'|'relax'|'wave'|'stretch'|'attention'|'concern'|'none';phase:number;amount:number};
/** These are decorative poses, not claims about the agent's internal reasoning. */
export function sampleLifePose(agent:RenderAgent,enabled=true):LifePose{
 const state='observation' in agent?agent.observation:undefined;
 const phase=agent.frame/60*(agent.observationPace??1)+agent.phaseOffset;
 const none:LifePose={kind:'none',phase:0,amount:0};
 if(!state||state.uncertain)return none;
 if(state.state==='waiting')return {kind:'attention',phase:enabled?phase:0,amount:enabled?.5+.5*Math.sin(phase*1.3):.5};
 if(state.state==='error'||state.state==='interrupted')return {kind:'concern',phase:enabled?phase:0,amount:.5};
 const gesture=agent.observationGesture;
 if(enabled&&gesture&&agent.frame<gesture.untilFrame){
  const progress=(agent.frame-gesture.startedFrame)/(gesture.untilFrame-gesture.startedFrame);
  return {kind:gesture.kind,phase,amount:Math.sin(Math.PI*Math.max(0,Math.min(1,progress)))};
 }
 if(agent.state!=='sitting')return none;
 if(!enabled)return {kind:agent.observationActivity==='work'?'type':'relax',phase:0,amount:0};
 const cycle=phase%28;
 if(agent.observationActivity==='work'){
  if(cycle>=14&&cycle<19)return {kind:'focus',phase,amount:Math.sin((cycle-14)/5*Math.PI)};
  if(cycle>=19&&cycle<24)return {kind:'think',phase,amount:Math.sin((cycle-19)/5*Math.PI)};
  return {kind:'type',phase,amount:1};
 }
 if(agent.observationActivity==='tea')return {kind:cycle<8?'sip':'relax',phase,amount:cycle<8?Math.sin(cycle/8*Math.PI):.5};
 if(agent.observationActivity==='game')return {kind:'play',phase,amount:.5+.5*Math.sin(phase*.7)};
 return none;
}

/** Only translate tool/event metadata; a shell invocation says nothing about test success. */
export function describeObserverEvent(event:string,toolName=''){
 const events:Record<string,string>={SessionStart:'来到办公室',SubagentStart:'子 Agent 加入协作',SubagentStop:'子 Agent 本轮结束',Stop:'本轮告一段落',SessionEnd:'会话已关闭',UserPromptSubmit:'收到新任务',PermissionRequest:'等待你确认',PermissionResolved:'已处理批准请求',PostToolUseFailure:'工具报告错误',task_complete:'本轮告一段落',task_started:'开始新一轮'};
 if(Object.hasOwn(events,event))return events[event];
 const tools:Record<string,string>={Read:'读取文件',read_file:'读取文件',Write:'写入文件',Edit:'修改文件',apply_patch:'修改文件',Bash:'执行命令',Shell:'执行命令',exec_command:'执行命令',Grep:'搜索代码',Glob:'查找文件',WebSearch:'搜索资料',WebFetch:'读取网页',spawn_agent:'发起协作',Agent:'调用子 Agent',Task:'调用子 Agent'};
 const name=toolName.split(/[.:/]/).pop()??toolName;
 if(event==='PreToolUse')return Object.hasOwn(tools,name)?tools[name]:(toolName?'调用工具 · '+toolName:'调用工具');
 if(event==='PostToolUse')return '工具已返回'+(toolName?' · '+toolName:'');
 return toolName?event+' · '+toolName:event;
}
