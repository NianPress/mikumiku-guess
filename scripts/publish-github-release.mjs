import {readReleases,releaseBody,repository} from './release-notes.mjs';
const note=(await readReleases())[0],tag='v'+note.version,token=process.env.GITHUB_TOKEN;
if(!token||process.env.GITHUB_REPOSITORY!==repository||!process.env.GITHUB_SHA)throw Error('Release publishing is restricted to the configured repository');
let live=false;
for(let attempt=0;attempt<24;attempt++){
 try{const response=await fetch('https://mikumiku-guess.online/api/health',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(response.ok&&(await response.json()).releaseVersion===note.version){live=true;break;}}catch{}
 console.log('Waiting for website version '+note.version+' before announcing');
 await new Promise(resolve=>setTimeout(resolve,15000));
}
if(!live)throw Error('Website version did not match; no release announcement was published');
const base='https://api.github.com/repos/'+repository+'/releases',headers={Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10','User-Agent':'mikumiku-guess-release'};
const prior=await fetch(base+'/tags/'+tag,{headers,signal:AbortSignal.timeout(15000)});
if(!prior.ok&&prior.status!==404)throw Error('Cannot read release: HTTP '+prior.status);
const existing=prior.ok?await prior.json():null,body={tag_name:tag,name:tag+' · '+note.title,body:releaseBody(note),draft:false,prerelease:false,...(!existing?{target_commitish:process.env.GITHUB_SHA}: {})};
const response=await fetch(existing?base+'/'+existing.id:base,{method:existing?'PATCH':'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('Cannot publish release: HTTP '+response.status);
const release=await response.json();console.log('Website version confirmed. Release announcement: '+release.html_url);
