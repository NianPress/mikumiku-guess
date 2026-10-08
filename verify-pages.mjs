import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{createHandler}from'./server.mjs';
import{assetFiles,assetType}from'./asset-files.mjs';
import{filterLibrary,collectionOf}from'./dist/filters.js';
const assets=Object.fromEntries(assetFiles.map(file=>['/'+file,{type:assetType(file),body:readFileSync('dist/'+file,'utf8')}])),library=JSON.parse(assets['/songs.json'].body),handler=createHandler(assets,library);
for(const[url,marker]of[['/','home-title'],['/daily','data-mode="daily"'],['/single','data-mode="practice"'],['/undercover','data-mode="undercover"']]){const response=await handler.fetch(new Request('https://test'+url));assert.equal(response.status,200);assert((await response.text()).includes(marker));}
assert(!assets['/index.html'].body.includes('src="/game.js"'),'Home does not load the catalog/game eagerly');
assert(assets['/index.html'].body.includes('href="/daily"')&&assets['/index.html'].body.includes('href="/single"'));
for(const file of ['daily.html','single.html']){const html=assets['/'+file].body;assert(html.includes('src="/theme.js"'));assert(!html.includes('chart-library'));assert(!html.includes('class="mode-tabs"'));assert(html.includes('data-open-settings'));}
const app=assets['/app.js'].body;assert(app.includes('<dialog id="settings-dialog"'));assert(app.includes('<dialog id="feedback-dialog"'));assert(app.includes("fetch('/api/feedback'"));assert(!app.includes('type="checkbox"'));
assert.equal(collectionOf({collection:'myth'}),'myth');assert(filterLibrary(library.songs,{collection:'billboard'}).some(s=>s.publishDate<'2022-12-07'));
assert(filterLibrary([{year:2025,rankings:{weekly:{weeks:1}},collections:[]}],{collection:'weekly'}).length===1);
console.log('Pages: home, separate modes, shared modal settings, inclusive chart membership verified');
