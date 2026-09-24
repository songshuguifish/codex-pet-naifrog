import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../runtime/input-bridge.js',import.meta.url),'utf8');let now=0;const channels=[];
class BC{constructor(){channels.push(this)}postMessage(data){for(const c of channels)if(c!==this&&!c.off)c.onmessage?.({data:structuredClone(data)})}}
function make(id){const timers=new Map();let serial=0;const c={nfDiag:()=>{},BroadcastChannel:BC,crypto:{randomUUID:()=>id},Date:{now:()=>now},setInterval:f=>(timers.set(++serial,f),serial),clearInterval:i=>timers.delete(i),GI:'status',rP:'question',iP:'shown'};vm.createContext(c);vm.runInContext(code,c);c.nfInputInit();return {c,timers};}
const a=make('a'),b=make('b');const key={hostId:'local',threadId:'thread',entityKey:'turn',itemId:'q'};
a.c.nfInputChange('open',key);assert.equal(b.c.nfInputState.pending.length,1);
a.c.nfInputChange('type',key);assert.equal(b.c.nfInputState.sequence,1);a.c.nfInputChange('type',key);assert.equal(b.c.nfInputState.sequence,1);
// A receiver cannot renew another window's lease.
now=6000;b.c.nfInputRefresh();assert.equal(b.c.nfInputState.pending.length,0);b.c.nfInputPublish();assert.equal(a.c.nfInputState.pending.length,2);
a.c.nfInputChange('close',key);assert.equal(b.c.nfInputState.pending.length,0);
let status='inProgress',shown=null;const scope={get:k=>k==='status'?status:k==='shown'?shown:{lastSubmission:null,isSkipped:false}};
a.c.nfTrackQuestions(scope,key,['q']);for(const f of [...a.timers.values()])f();assert.equal(a.c.nfInputState.pending.length,0);
shown={selectedQuestionKey:key,questionIds:['q']};for(const f of [...a.timers.values()])f();assert.equal(a.c.nfInputState.pending.length,1);
shown=null;for(const f of [...a.timers.values()])f();assert.equal(a.c.nfInputState.pending.length,0);
status='completed';for(const f of [...a.timers.values()])f();assert.equal(a.c.nfQuestionWatches.size,0);
console.log('PASS: owner isolation, expiry, no remote renewal, one laugh, hidden question cleanup and turn completion');
let cleanup;a.c.__NF_REACT__={useEffect:fn=>{cleanup=fn()}};const props={hostId:'local',conversationId:'blocking-task',request:{requestId:123}};
a.c.nfBlockingUse(props);assert(a.c.nfInputState.pending.some(x=>x.includes('blocking:123')));
const before=a.c.nfInputState.sequence;a.c.nfBlockingEvent('type',props);a.c.nfBlockingEvent('type',props);assert.equal(a.c.nfInputState.sequence,before+1);
a.c.nfBlockingEvent('close',props);assert.equal(a.c.nfInputState.pending.length,0);cleanup();assert.equal(b.c.nfInputState.pending.length,0);
a.c.nfBlockingUse(props);cleanup();assert.equal(b.c.nfInputState.pending.length,0);console.log('Blocking mount, selection/edit deduplication, submit, dismissal/unmount passed');
