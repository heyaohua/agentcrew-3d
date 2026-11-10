import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {apply,createMapper,runtimeParent,deliver} from '../../plugins/dsh-observer/index.mjs';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
const require=createRequire(import.meta.url);const {createObserver}=require('../../server/observer.js');
const session=()=>({id:'dsh-one',header:{cwd:'/demo/project'}});
const e=(type,data={},seq=1)=>({type,data,seq,time:1000+seq});
async function until(predicate){for(let i=0;i<150;i++){if(predicate())return;await delay(10);}throw Error('Condition did not arrive');}
test('plugin callback is read-only, asynchronous, global, authenticated and stops on disposal',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dsh-native-plugin-')), received=[],listeners={};
 const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{received.push({auth:req.headers.authorization,event:JSON.parse(body)});res.writeHead(202).end('{}');});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  writeFileSync(join(dir,'connection.json'),JSON.stringify({url:`http://127.0.0.1:${server.address().port}/api/observer/events`,token:'fixture-only-token'}));
  const ctx={on(name,fn,options){listeners[name]=fn;if(name==='session/event')assert.equal(options.global,true);},get(){return {get(){},isOwnedBy(){return false;}};}};
  apply(ctx,{stateDir:dir});const s=session();assert.equal(listeners['session/event'](s,e('turn/start')),undefined);
  listeners['session/event'](s,e('tool/call',{name:'bash',callId:'1',arguments:{secret:'PRIVATE_BODY'}},2));
  listeners['session/event'](s,e('turn/end',{reason:{kind:'completed'}},3));
  await until(()=>received.length===3);assert.deepEqual(received.map(r=>r.event.event),['UserPromptSubmit','PreToolUse','Stop']);
  assert.ok(received.every(r=>r.auth==='Bearer fixture-only-token'));assert.ok(!JSON.stringify(received).includes('PRIVATE_BODY'));
  listeners.dispose();listeners['session/event'](s,e('turn/start',{},4));await delay(40);assert.equal(received.length,3);
 }finally{listeners.dispose?.();await new Promise(resolve=>server.close(resolve));await delay(30);rmSync(dir,{recursive:true,force:true});}
});
test('receiver failure is isolated from session callbacks and recorded without sensitive details',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dsh-failed-plugin-')),listeners={};
 try{
  writeFileSync(join(dir,'connection.json'),JSON.stringify({url:'http://invalid.example/api/observer/events',token:'PRIVATE_TOKEN'}));
  apply({on(name,fn){listeners[name]=fn;},get(){}},{stateDir:dir});
  assert.equal(listeners['session/event'](session(),e('turn/start')),undefined);
  await until(()=>{try{return JSON.parse(readFileSync(join(dir,'dsh-plugin-status.json'),'utf8')).failed===1;}catch{return false;}});
  assert.ok(!readFileSync(join(dir,'dsh-plugin-status.json'),'utf8').includes('PRIVATE_TOKEN'));
 }finally{listeners.dispose?.();await delay(30);rmSync(dir,{recursive:true,force:true});}
});
test('native turn boundaries; no transcript or tool arguments leave the mapper',()=>{
 const map=createMapper(),s=session();
 assert.equal(map(s,e('turn/start')).event,'UserPromptSubmit');
 const got=map(s,e('tool/call',{name:'bash',callId:'call',arguments:{command:'PRIVATE_BODY'}}));
 assert.equal(got.tool,'dsh');assert.ok(!JSON.stringify(got).includes('PRIVATE_BODY'));
 assert.equal(map(s,e('tool/result',{message:{toolCallId:'call',isError:false,content:['PRIVATE_RESULT']}})).event,'PostToolUse');
 assert.equal(map(s,e('step/end')),null);assert.equal(map(s,e('assistant/message',{content:'SECRET'})),null);
 assert.equal(map(s,e('turn/end',{reason:{kind:'completed'}})).event,'Stop');
});
test('aborted/error/blocked turns never report normal completion; unknown reason ignored',()=>{
 for(const [kind,event] of [['aborted','Interrupt'],['error','StopFailure'],['blocked','StopFailure'],['max-tokens','StopFailure']])assert.equal(createMapper()(session(),e('turn/end',{reason:{kind,message:'private'}})).event,event);
 assert.equal(createMapper()(session(),e('turn/end',{reason:{kind:'new-version'}})),null);
});
test('approval decisions retain exact approval identity without impersonating tool results',()=>{
 const map=createMapper(),s=session();const asked=map(s,e('approval/asked',{id:'a',toolName:'bash',callId:'call',reason:'PRIVATE'}));
 const decided=map(s,e('approval/decided',{id:'a',outcome:'rejected'}));
 assert.equal(asked.toolUseId,decided.toolUseId);assert.equal(decided.event,'PermissionResolved');assert.ok(!JSON.stringify(asked).includes('PRIVATE'));
 assert.equal(map(s,e('approval/decided',{id:'absent',outcome:'allowed-once'})),null);
});
test('overlapping approvals survive unrelated tools and resolve independently',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dsh-observer-test-'));
 try{const observer=createObserver({stateDir:dir,token:'test-token',now:()=>10000,processProbe:()=>false,lifecycleReader:()=>null});const map=createMapper(),s=session();let n=0;
 const send=(type,data)=>observer.ingest(map(s,e(type,data,n++)));
 send('turn/start',{});send('approval/asked',{id:'a',toolName:'bash'});send('approval/asked',{id:'b',toolName:'bash'});
 send('tool/call',{name:'read',callId:'r'});send('tool/result',{message:{toolCallId:'r'}});assert.equal(observer.snapshot().sessions[0].state,'waiting');
 send('approval/decided',{id:'a',outcome:'allowed-once'});assert.equal(observer.snapshot().sessions[0].state,'waiting');
 send('approval/decided',{id:'b',outcome:'rejected'});assert.equal(observer.snapshot().sessions[0].state,'working');
 send('turn/end',{reason:{kind:'aborted'}});assert.equal(observer.snapshot().sessions[0].state,'interrupted');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('foreground question wait ends when its native tool returns, including timed continuation',()=>{
 const map=createMapper(),s=session();assert.equal(map(s,e('tool/call',{name:'ask_user_question',callId:'q',arguments:{questions:['private']}})).event,'Elicitation');
 const r=map(s,e('tool/result',{message:{toolCallId:'q',content:['pending private body']}}));assert.equal(r.event,'PostToolUse');assert.ok(!JSON.stringify(r).includes('private'));
});
test('only verified live ownership creates a child; ordinary forks and restored roots remain roots',()=>{
 const s=session();s.header={cwd:'/demo',origin:'subagent',parentSession:'parent'};const parent={id:'parent'};
 const owned={get:()=>parent,isOwnedBy:()=>true};assert.equal(runtimeParent(owned,s),'parent');
 const map=createMapper();assert.equal(map(s,e('turn/start'),{parentId:runtimeParent(owned,s)}).agentId,s.id);
 assert.equal(runtimeParent({...owned,isOwnedBy:()=>false},s),undefined);
 assert.equal(map(s,e('turn/start')).agentId,'');s.header.origin='fork';assert.equal(runtimeParent(owned,s),undefined);
});
test('malformed identity rejected and source objects never mutated',()=>{
 const map=createMapper(),s=Object.freeze({id:'valid',header:Object.freeze({cwd:'/demo'})});const event=Object.freeze(e('turn/start',Object.freeze({turn:1})));assert.ok(map(s,event));
 assert.equal(map({id:'bad\n',header:{cwd:'/demo'}},event),null);assert.equal(map({id:'ok',header:{}},event),null);
});
test('transport rejects non-loopback targets, redirects/query URLs, and never prints token',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'dsh-transport-'));
 try{for(const url of ['http://example.com/api/observer/events','http://127.0.0.1/api/observer/events?redirect=x','http://user:pass@127.0.0.1/api/observer/events']){
 writeFileSync(join(dir,'connection.json'),JSON.stringify({url,token:'PRIVATE_TOKEN'}));await assert.rejects(deliver({},dir),/loopback/);
 }}finally{rmSync(dir,{recursive:true,force:true});}
});
test('late working directory becomes usable without mutating the session header',()=>{
 const map=createMapper(),s={id:'late',header:{}};
 assert.equal(map(s,e('turn/start')),null);
 assert.equal(map(s,e('working-directory/change',{cwd:'/demo/late'},2)),null);
 assert.equal(map(s,e('step/start',{},3)).project,'/demo/late');assert.deepEqual(s.header,{});
});
test('session disposal closes only observed records with the original child identity once',()=>{
 const map=createMapper(),s=session();
 assert.equal(map.close(s),null);map(s,e('turn/start'),{parentId:'parent'});
 const close=map.close(s);assert.equal(close.event,'SessionEnd');assert.equal(close.sessionId,'parent');assert.equal(close.agentId,s.id);
 assert.equal(map.close(s),null);
});
test('Cordis Loader sees apply and inject together after its default-export normalization',async()=>{
 const module=await import('../../plugins/dsh-observer/index.mjs');const plugin=module.default??module;
 assert.equal(typeof plugin.apply,'function');assert.deepEqual(plugin.inject,['sessions','agents']);
});
