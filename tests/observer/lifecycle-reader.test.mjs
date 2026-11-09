import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createLifecycleReader} from '../../server/observer-codex-lifecycle.js';
test('reads only known UUID lifecycle fields, ignores content and incomplete tails, invalidates truncation',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lifecycle-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const id='12345678-1234-1234-1234-123456789abc';const file=path.join(root,`rollout-date-${id}.jsonl`);
 const row=(event,at)=>JSON.stringify({timestamp:at,type:'event_msg',payload:{type:event,turn_id:'turn',last_agent_message:'PRIVATE'}})+'\n';
 fs.writeFileSync(file,JSON.stringify({type:'response_item',payload:{text:'PRIVATE'}})+'\n'+row('task_started','2026-11-05T00:00:00Z'));
 const read=createLifecycleReader(root);assert.equal(read('../secrets'),null);assert.equal(read(id).event,'task_started');
 fs.appendFileSync(file,row('task_complete','2026-11-05T00:01:00Z')+'{"partial":');
 const result=read(id);assert.deepEqual(result,{event:'task_complete',at:Date.parse('2026-11-05T00:01:00Z'),turnId:'turn'});assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 fs.writeFileSync(file,row('turn_aborted','2026-11-05T00:02:00Z'));assert.equal(read(id).event,'turn_aborted');
 fs.unlinkSync(file);assert.equal(read(id),null);
});
test('append-only tail movement retains known completion but replacement invalidates it',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lifecycle-tail-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const id='12345678-1234-1234-1234-123456789abc',file=path.join(root,`rollout-${id}.jsonl`),read=createLifecycleReader(root);
 const event=JSON.stringify({timestamp:'2026-11-05T00:01:00Z',type:'event_msg',payload:{type:'task_complete'}})+'\n';
 fs.writeFileSync(file,event);assert.equal(read(id).event,'task_complete');
 const content=JSON.stringify({type:'response_item',payload:{text:'PRIVATE'.repeat(100000)}})+'\n';
 fs.appendFileSync(file,content);assert.equal(read(id).event,'task_complete');
 fs.writeFileSync(file,content+'\n');assert.equal(read(id),null);
 fs.unlinkSync(file);fs.writeFileSync(file,content);assert.equal(read(id),null);
});
test('late older lines cannot reverse a newer lifecycle',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lifecycle-order-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const id='12345678-1234-1234-1234-123456789abc',file=path.join(root,`rollout-${id}.jsonl`),read=createLifecycleReader(root);
 const row=(type,time)=>JSON.stringify({timestamp:time,type:'event_msg',payload:{type}})+'\n';
 fs.writeFileSync(file,row('task_complete','2026-11-05T00:02:00Z'));read(id);
 fs.appendFileSync(file,row('task_started','2026-11-05T00:01:00Z'));assert.equal(read(id).event,'task_complete');
});
