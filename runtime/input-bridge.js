// Each window owns its verified questions. Remote snapshots are never relayed.
var nfInputChannel, nfInputState={pending:[],sequence:0}, nfInputListeners=new Set();
var nfInputOwner=globalThis.crypto?.randomUUID?.()??String(Math.random());
var nfLocalPending=[],nfLocalSequence=0,nfRemoteInputs=new Map(),nfInputTimer;
function nfInputRefresh(){
 const now=Date.now(),pending=[...nfLocalPending];
 for(const [owner,s] of nfRemoteInputs){
  if(now-s.received>5000){nfDiag('remote-expired',{remoteOwner:owner,ageMs:now-s.received});nfRemoteInputs.delete(owner);continue;}
  pending.push(...s.pending);
 }
 const unique=[...new Set(pending)];
 nfInputState={pending:unique,sequence:nfInputState.sequence};
 for(const f of nfInputListeners)f(nfInputState);
}
function nfInputPublish(){nfInputChannel?.postMessage({kind:'state',owner:nfInputOwner,pending:nfLocalPending,sequence:nfLocalSequence});}
function nfInputInit(){
 if(nfInputTimer)return;
 nfDiag("bridge-start",{path:globalThis.location?.pathname,channel:"naifrog-input-v2"});
 if(typeof BroadcastChannel!=='undefined'){
  try{nfInputChannel=new BroadcastChannel('naifrog-input-v2');}catch(error){nfDiag('channel-error',{name:error?.name});}
  if(nfInputChannel){
   nfInputChannel.onmessage=({data:d})=>{
    if(d?.kind==='query'){nfInputPublish();return;}
    if(d?.kind!=='state'||typeof d.owner!=='string'||d.owner===nfInputOwner||!Array.isArray(d.pending)||!d.pending.every(k=>typeof k==='string')||!Number.isInteger(d.sequence))return;
    nfDiag('remote-received',{remoteOwner:d.owner,pending:d.pending,sequence:d.sequence},'remote:'+d.owner);
    const old=nfRemoteInputs.get(d.owner);
    // A late subscriber observes the current pose; it must not replay old laughs.
    if(old&&d.sequence>old.sequence)nfInputState.sequence++;
    nfRemoteInputs.set(d.owner,{pending:d.pending,sequence:d.sequence,received:Date.now()});nfInputRefresh();
   };
   nfInputChannel.postMessage({kind:'query'});
  }
 }
 nfInputTimer=setInterval(()=>{nfInputRefresh();nfInputPublish();},1000);
 globalThis.addEventListener?.('pagehide',()=>{nfLocalPending=[];nfInputPublish();});
}
function keyTask(t){return {hostId:t.hostId,threadId:t.threadId,entityKey:t.entityKey};}
function nfQuestionKey(t,id=t.itemId){return JSON.stringify([t.hostId,t.threadId,t.entityKey,id]);}
function nfInputChange(kind,t,ids){
 nfInputInit();let pending=nfLocalPending;
 const keys=(ids||[t.itemId]).map(id=>nfQuestionKey(t,id));
 if(kind==='sync'){
  const matches=k=>{try{const a=JSON.parse(k.startsWith('typed:')?k.slice(6):k);return a[0]===t.hostId&&a[1]===t.threadId&&a[2]===t.entityKey;}catch{return false;}};
  pending=pending.filter(k=>!matches(k)||keys.includes(k)||keys.some(id=>k==='typed:'+id));
  pending=[...pending,...keys.filter(k=>!pending.includes(k))];
 }
 if(kind==='open')pending=[...pending,...keys.filter(k=>!pending.includes(k))];
 if(kind==='close')pending=pending.filter(k=>!keys.includes(k)&&!keys.some(id=>k==='typed:'+id));
 if(kind==='type'&&keys.some(k=>pending.includes(k))&&!keys.some(k=>pending.includes('typed:'+k))){
  nfLocalSequence++;nfInputState.sequence++;pending=[...pending,...keys.map(k=>'typed:'+k)];
 }
 nfDiag('local-update',{kind,task:keyTask(t),ids:ids||[t.itemId],before:nfLocalPending,after:pending,sequence:nfLocalSequence},'local:'+nfQuestionKey(t));
 nfLocalPending=pending;nfInputRefresh();nfInputPublish();
}
function nfUseInput(){
 const [value,setValue]=__NF_REACT__.useState(nfInputState);
 __NF_REACT__.useEffect(()=>{nfInputInit();nfInputListeners.add(setValue);setValue(nfInputState);return()=>nfInputListeners.delete(setValue);},[]);
 return value;
}
var nfQuestionWatches=new Map();
function nfTrackQuestions(scope,key,ids){
 const id=JSON.stringify([key.hostId,key.threadId,key.entityKey]);
 const old=nfQuestionWatches.get(id);if(old)clearInterval(old.timer);
 nfInputChange('sync',key,[]);
 if(!ids.length){nfQuestionWatches.delete(id);return;}
 const tick=()=>{
  try{
   const turnStatus=scope.get(GI,key);
   const active=turnStatus==='inProgress';
   const shown=scope.get(iP,{hostId:key.hostId,threadId:key.threadId});
   const visible=shown?.selectedQuestionKey?.entityKey===key.entityKey;
   const pending=active&&visible?ids.filter(itemId=>shown.questionIds.includes(itemId)&&(()=>{const q=scope.get(rP,{...key,itemId});return q!=null&&q.lastSubmission==null&&!q.isSkipped;})()):[];
   nfDiag('question-check',{task:keyTask(key),turnStatus,visible,selected:shown?.selectedQuestionKey?.itemId??null,questions:ids.map(itemId=>{const q=scope.get(rP,{...key,itemId});return {itemId,exists:q!=null,submitted:q?.lastSubmission!=null,skipped:!!q?.isSkipped};}),pending},'check:'+id);
   nfInputChange('sync',key,pending);
   if(!active){clearInterval(nfQuestionWatches.get(id)?.timer);nfQuestionWatches.delete(id);}
  }catch(error){nfDiag('question-check-error',{task:keyTask(key),name:error?.name});nfInputChange('sync',key,[]);}
 };
 nfQuestionWatches.set(id,{timer:setInterval(tick,1000)});
}
function nfBlockingKey(props){return {hostId:props.hostId,threadId:props.conversationId,entityKey:'blocking:'+props.request.requestId,itemId:String(props.request.requestId)};}
globalThis.nfBlockingUse=function(props){
 const key=nfBlockingKey(props);
 __NF_REACT__.useEffect(()=>{
  nfDiag('blocking-open',{task:keyTask(key),requestId:key.itemId});
  nfInputChange('open',key);
  return()=>{nfInputChange('close',key);nfDiag('blocking-unmount',{task:keyTask(key),requestId:key.itemId});};
 },[key.hostId,key.threadId,key.entityKey]);
};
globalThis.nfBlockingEvent=function(kind,props){nfInputChange(kind,nfBlockingKey(props));};
