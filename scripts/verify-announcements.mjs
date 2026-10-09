import assert from 'node:assert/strict';
import {readReleases,releaseBody} from './release-notes.mjs';
const latest=(await readReleases())[0],oldFetch=globalThis.fetch,oldTimer=globalThis.setTimeout,oldEnv={...process.env};
process.env.GITHUB_TOKEN='announcement-test-only';process.env.GITHUB_REPOSITORY='NianPress/mikumiku-guess';process.env.GITHUB_SHA='a'.repeat(40);
globalThis.setTimeout=callback=>{queueMicrotask(callback);return 0;};
async function scenario(name,respond,verify){const calls=[];globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),...options});return respond(String(url),options,calls);};await verify(()=>import('./publish-github-release.mjs?scenario='+name),calls);}
try{
 await scenario('deployment-failed',()=>Response.json({releaseVersion:'0.0.0'}),async(run,calls)=>{await assert.rejects(run,/no release announcement/);assert.equal(calls.length,24);assert(calls.every(c=>!c.method));});
 await scenario('new-release',(url,options)=>url.includes('/api/health')?Response.json({releaseVersion:latest.version}):url.includes('/tags/')?new Response(null,{status:404}):Response.json({html_url:'https://github.com/NianPress/mikumiku-guess/releases/tag/v'+latest.version},{status:201}),async(run,calls)=>{await run();assert.equal(calls[2].method,'POST');const body=JSON.parse(calls[2].body);assert.equal(body.body,releaseBody(latest));assert.equal(body.target_commitish,process.env.GITHUB_SHA);assert.equal(body.tag_name,'v'+latest.version);});
 await scenario('existing-release',(url,options)=>url.includes('/api/health')?Response.json({releaseVersion:latest.version}):url.includes('/tags/')?Response.json({id:123}):Response.json({html_url:'https://github.com/NianPress/mikumiku-guess/releases/tag/v'+latest.version}),async(run,calls)=>{await run();assert.equal(calls[2].method,'PATCH');assert(calls[2].url.endsWith('/releases/123'));assert(!('target_commitish'in JSON.parse(calls[2].body)));});
 process.env.GITHUB_REPOSITORY='someone/else';await scenario('wrong-repository',()=>{throw Error('Should not fetch');},async(run,calls)=>{await assert.rejects(run,/restricted/);assert.equal(calls.length,0);});
 console.log('Announcements verified: wait for matching deployment, no early publication, exact notes/target, idempotent updates and repository boundary');
}finally{globalThis.fetch=oldFetch;globalThis.setTimeout=oldTimer;for(const key of ['GITHUB_TOKEN','GITHUB_REPOSITORY','GITHUB_SHA']){if(oldEnv[key]===undefined)delete process.env[key];else process.env[key]=oldEnv[key];}}
