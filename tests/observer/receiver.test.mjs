import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import {createObserver,normalizeEvent} from '../../server/observer.js';
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'observer-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let time=1000000;const o=createObserver({stateDir:dir,token:'test-token',now:()=>time});return {o,dir,tick:(n=1)=>time+=n};}
function ev(event,extra={}){return {tool:'codex',sessionId:'s1',project:'/tmp/project',event,...extra};}
test('waiting survives pre-tool/duplicate activity and clears only on progress',t=>{
 const {o}=setup(t);o.ingest(ev('UserPromptSubmit'));o.ingest(ev('PermissionRequest',{toolName:'Bash',eventId:'wait'}));
 o.ingest(ev('PreToolUse'));assert.equal(o.snapshot().sessions[0].state,'waiting');
 o.ingest(ev('PostToolUse',{toolName:'Bash'}));assert.equal(o.snapshot().sessions[0].state,'working');
 o.ingest(ev('PermissionRequest',{eventId:'wait'}));assert.equal(o.snapshot().sessions[0].state,'working');
 o.ingest(ev('Stop'));assert.equal(o.snapshot().sessions[0].state,'ended');
});
test('tool and session identity separate; delayed events cannot undo current state',t=>{
 const {o}=setup(t);o.ingest(ev('PermissionRequest',{occurredAt:999990}));o.ingest(ev('Stop',{occurredAt:999980}));
 assert.equal(o.snapshot().sessions[0].state,'waiting');
 o.ingest(ev('Stop',{tool:'claude'}));o.ingest(ev('Stop',{sessionId:'s2'}));assert.equal(o.snapshot().sessions.length,3);
});
test('question tools wait; session end, interruption and failure explicit',t=>{
 const {o}=setup(t);o.ingest(ev('PreToolUse',{toolName:'AskUserQuestion'}));assert.equal(o.snapshot().sessions[0].state,'waiting');
 for(const [event,state] of [['PostToolUseFailure','error'],['UserPromptSubmit','working'],['Interrupt','interrupted'],['SessionEnd','closed']]) {o.ingest(ev(event,{toolName:'AskUserQuestion'}));assert.equal(o.snapshot().sessions[0].state,state);}
});
test('silence and restart mark stale without inventing a terminal state',t=>{
 const {o,dir,tick}=setup(t);o.ingest(ev('UserPromptSubmit'));tick(120001);
 let s=o.snapshot().sessions[0];assert.equal(s.stale,true);assert.equal(s.state,'working');
 const restored=createObserver({stateDir:dir,token:'test-token'});s=restored.snapshot().sessions[0];assert.equal(s.restored,true);assert.equal(s.stale,true);
 restored.ingest(ev('Stop'));assert.equal(restored.snapshot().sessions[0].restored,false);
});
test('metadata whitelist and validation exclude all payload secrets',t=>{
 const {o}=setup(t);o.ingest(ev('PreToolUse',{toolName:'Bash',prompt:'PRIVATE',tool_input:{command:'PRIVATE'},output:'PRIVATE'}));
 assert.ok(!JSON.stringify(o.snapshot()).includes('PRIVATE'));
 assert.throws(()=>normalizeEvent(ev('made-up')));assert.throws(()=>normalizeEvent(ev('Stop',{tool:'shell'})));assert.throws(()=>normalizeEvent(ev('Stop',{sessionId:''})));
 assert.throws(()=>normalizeEvent(ev('Stop',{project:'x'.repeat(4097)})));
});
test('bounded history and session storage; no prototype-key collisions',t=>{
 const {o}=setup(t);
 for(let i=0;i<30;i++)o.ingest(ev('PostToolUse'));
 assert.equal(o.snapshot().sessions[0].events.length,12);
 for(let i=0;i<205;i++)o.ingest(ev('Stop',{sessionId:String(i)}));
 assert.equal(o.snapshot().sessions.length,200);
 o.ingest(ev('Stop',{sessionId:'__proto__'}));assert.equal(o.snapshot().sessions.length,200);
});
test('HTTP receiver authenticates, validates origin/body and serves only metadata',async t=>{
 const {o}=setup(t);
 const server=http.createServer((req,res)=>{if(!o.handleHttp(req,res)){res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(body,headers={})=>fetch(base+'/api/observer/events',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 assert.equal((await post(ev('Stop'))).status,401);
 const auth={Authorization:'Bearer test-token'};
 assert.equal((await post(ev('Stop'),{...auth,Origin:'https://evil.example'})).status,403);
 assert.equal((await post('{',auth)).status,400);
 assert.equal((await post('x'.repeat(17000),auth)).status,413);
 assert.equal((await post(ev('PermissionRequest'),auth)).status,202);
 const s=await (await fetch(base+'/api/observer/state')).json();assert.equal(s.sessions[0].state,'waiting');assert.ok(!JSON.stringify(s).includes('test-token'));
 assert.equal((await fetch(base+'/api/observer/state',{method:'POST'})).status,405);
});

test('unrelated concurrent tools must not clear a permission wait',t=>{
 const {o}=setup(t);o.ingest(ev('PermissionRequest',{toolName:'Bash'}));
 o.ingest(ev('PostToolUse',{toolName:'Read'}));
 assert.equal(o.snapshot().sessions[0].state,'waiting');
 o.ingest(ev('PostToolUse',{toolName:'Bash'}));assert.equal(o.snapshot().sessions[0].state,'working');
});

test('multiple pending tool calls require matching completions',t=>{
 const {o}=setup(t);
 o.ingest(ev('PermissionRequest',{toolName:'Bash',toolUseId:'a'}));
 o.ingest(ev('PermissionRequest',{toolName:'Bash',toolUseId:'b'}));
 o.ingest(ev('PostToolUse',{toolName:'Bash',toolUseId:'a'}));
 assert.equal(o.snapshot().sessions[0].state,'waiting');
 o.ingest(ev('PostToolUse',{toolName:'Bash',toolUseId:'b'}));
 assert.equal(o.snapshot().sessions[0].state,'working');
});
test('split UTF-8 input preserves Chinese paths',async t=>{
 const {o}=setup(t);
 const server=http.createServer((req,res)=>o.handleHttp(req,res));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const data=Buffer.from(JSON.stringify(ev('Stop',{project:'/tmp/中文项目'})));
 const split=data.indexOf(Buffer.from('中'))+1;
 const status=await new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/api/observer/events',method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-token'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
  req.on('error',reject);req.write(data.subarray(0,split));setTimeout(()=>req.end(data.subarray(split)),10);
 });
 assert.equal(status,202);assert.equal(o.snapshot().sessions[0].project,'/tmp/中文项目');
});

test('subagents have independent identities, waits, endings and parent links',t=>{
 const {o}=setup(t);o.ingest(ev('UserPromptSubmit'));
 o.ingest(ev('SubagentStart',{agentId:'child-a',agentType:'reviewer'}));
 o.ingest(ev('SubagentStart',{agentId:'child-b',agentType:'developer'}));
 o.ingest(ev('PermissionRequest',{agentId:'child-a',toolName:'Bash',toolUseId:'a'}));
 o.ingest(ev('SubagentStop',{agentId:'child-b'}));
 const all=o.snapshot().sessions,parent=all.find(s=>!s.agentId),a=all.find(s=>s.agentId==='child-a'),b=all.find(s=>s.agentId==='child-b');
 assert.equal(all.length,3);assert.equal(parent.state,'working');assert.equal(a.state,'waiting');assert.equal(b.state,'ended');assert.equal(a.parentId,parent.id);
 o.ingest(ev('PostToolUse',{sessionId:'child-a',toolName:'Bash',toolUseId:'a'}));
 assert.equal(o.snapshot().sessions.length,3);assert.equal(o.snapshot().sessions.find(s=>s.agentId==='child-a').state,'working');
});
test('long work uses process identity evidence, not fabricated event timestamps',t=>{
 const {dir,tick}=setup(t);let alive=true,time=1000000;
 const o=createObserver({stateDir:dir,token:'x',now:()=>time,processProbe:()=>alive});
 o.ingest(ev('UserPromptSubmit',{processInfo:{pid:123,start:'verified-start'}}));time+=600000;tick();
 let s=o.snapshot().sessions[0];assert.equal(s.stale,false);assert.equal(s.freshness,'process');assert.equal(s.updatedAt,1000000);
 alive=false;s=o.snapshot().sessions[0];assert.equal(s.stale,true);assert.equal(s.freshness,'unknown');assert.equal(s.state,'working');
});
test('restart does not turn a saved work event into verified current work',t=>{
 const {o,dir}=setup(t);o.ingest(ev('UserPromptSubmit',{processInfo:{pid:123,start:'x'}}));
 const restored=createObserver({stateDir:dir,token:'x',processProbe:()=>true});assert.equal(restored.snapshot().sessions[0].stale,true);
});
test('settled events stay settled after silence, and subagent lifecycle requires identity',t=>{
 const {o,tick}=setup(t);o.ingest(ev('Stop'));tick(900000);assert.equal(o.snapshot().sessions[0].stale,false);
 assert.throws(()=>o.ingest(ev('SubagentStart')));
});

test('learning a child identity merges its legacy standalone record',t=>{
 const {o}=setup(t);o.ingest(ev('PostToolUse',{sessionId:'child'}));
 o.ingest(ev('SubagentStart',{agentId:'child'}));
 const sessions=o.snapshot().sessions;
 assert.equal(sessions.length,1);assert.equal(sessions[0].agentId,'child');assert.equal(sessions[0].sessionId,'s1');
});

test('nested agent links to the actual parent child identity',t=>{
 const {o}=setup(t);o.ingest(ev('SubagentStart',{agentId:'child'}));
 o.ingest(ev('SubagentStart',{sessionId:'child',agentId:'grandchild'}));
 const all=o.snapshot().sessions;assert.equal(all.find(s=>s.agentId==='grandchild').parentId,all.find(s=>s.agentId==='child').id);
});
test('completion with an ID resolves an ID-less permission of the same tool only',t=>{
 const {o}=setup(t);o.ingest(ev('PermissionRequest',{toolName:'Bash'}));
 o.ingest(ev('PermissionRequest',{toolName:'Read',toolUseId:'read'}));
 o.ingest(ev('PostToolUse',{toolName:'Bash',toolUseId:'bash'}));
 assert.equal(o.snapshot().sessions[0].pending.length,1);assert.equal(o.snapshot().sessions[0].pending[0].toolName,'Read');
 o.ingest(ev('PostToolUse',{toolName:'Read',toolUseId:'read'}));assert.equal(o.snapshot().sessions[0].state,'working');
});

test('known Codex lifecycle completion corrects a missing stop without treating process life as work',t=>{
 const {dir}=setup(t);let lifecycle=null,time=1000000;
 const o=createObserver({stateDir:dir,token:'x',now:()=>time,processProbe:()=>true,lifecycleReader:()=>lifecycle});
 o.ingest(ev('PermissionRequest',{agentId:'child',toolName:'Bash',processInfo:{pid:123,start:'x'}}));
 lifecycle={event:'task_complete',at:1000100};time=1000200;
 const s=o.snapshot().sessions[0];assert.equal(s.state,'ended');assert.equal(s.source,'codex-lifecycle');assert.equal(s.updatedAt,1000100);assert.deepEqual(s.pending,[]);
 lifecycle={event:'task_started',at:1000300};time=1000400;assert.equal(o.snapshot().sessions[0].state,'working');
});
test('old lifecycle cannot replace newer hook state; non-Codex never reads Codex files',t=>{
 const {dir}=setup(t);let reads=0;
 const o=createObserver({stateDir:dir,token:'x',now:()=>1000000,lifecycleReader:()=>{reads++;return {event:'task_complete',at:999000};}});
 o.ingest(ev('UserPromptSubmit'));o.ingest(ev('UserPromptSubmit',{tool:'claude'}));
 assert.equal(o.snapshot().sessions.filter(s=>s.state==='working').length,2);assert.equal(reads,1);
});
test('a metadata-ended old wait cannot leak into the next tool event',t=>{
 const {dir}=setup(t);let lifecycle=null,time=1000000;
 const o=createObserver({stateDir:dir,token:'x',now:()=>time,lifecycleReader:()=>lifecycle});
 o.ingest(ev('PermissionRequest',{toolName:'Bash',toolUseId:'old'}));
 lifecycle={event:'task_complete',at:1000100};time=1000200;
 o.ingest(ev('PreToolUse',{toolName:'Read',toolUseId:'new'}));
 assert.equal(o.snapshot().sessions[0].state,'working');assert.deepEqual(o.snapshot().sessions[0].pending,[]);
});
test('confirmed metadata completion survives restart even when it leaves the tail window',t=>{
 const {dir}=setup(t);
 const o=createObserver({stateDir:dir,token:'x',now:()=>1000200,lifecycleReader:()=>({event:'task_complete',at:1000100})});
 o.ingest(ev('UserPromptSubmit',{occurredAt:1000000}));assert.equal(o.snapshot().sessions[0].state,'ended');
 const restarted=createObserver({stateDir:dir,token:'x',now:()=>1000300,lifecycleReader:()=>null});
 assert.equal(restarted.snapshot().sessions[0].state,'ended');assert.equal(restarted.snapshot().sessions[0].source,'codex-lifecycle');
 restarted.ingest(ev('UserPromptSubmit'));assert.equal(restarted.snapshot().sessions[0].state,'working');
});
