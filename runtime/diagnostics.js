// Diagnostic transport only: no question/answer text or image data.
var nfDiagVersion='2026-09-23.1',nfDiagRows=[],nfDiagLast=new Map();
function nfDiag(event,details={},key=event){
 try{
  const fingerprint=JSON.stringify(details);
  if(nfDiagLast.get(key)===fingerprint)return;
  if(nfDiagLast.size>512)nfDiagLast.clear();
  nfDiagLast.set(key,fingerprint);
  const row={time:new Date().toISOString(),build:nfDiagVersion,owner:typeof nfInputOwner==='string'?nfInputOwner:null,event,...details};
  nfDiagRows.push(row);if(nfDiagRows.length>300)nfDiagRows.shift();
  // This Electron build forwards console.error to its desktop journal.
  // DIAG is an observation, not an application exception.
  console.error('[NAIFROG_DIAG] '+JSON.stringify(row));
  try{localStorage.setItem('naifrog-diagnostics-v1',JSON.stringify(nfDiagRows));}catch{}
 }catch{}
}
globalThis.naifrogDiagnostics=()=>({build:nfDiagVersion,rows:nfDiagRows.slice()});
