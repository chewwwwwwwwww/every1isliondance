import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Script,runInNewContext} from 'node:vm';
const root=fileURLToPath(new URL('..',import.meta.url));
const read=p=>readFile(resolve(root,p),'utf8');
let html=await read('client/index.html');
const assets={},assetSets=[];
for(const [id,suffix]of [['red',''],['jade','-jade'],['gold','-gold']]){
 const pair={id};let complete=true;
 for(const key of ['head','outfit']){const name=`lion-${key}${suffix}-v21.webp`;let bytes;try{bytes=await readFile(resolve(root,'client/assets',name));}catch(e){if(e.code==='ENOENT'){complete=false;break;}throw e;}assets['/assets/'+name]={mime:'image/webp',bytes:bytes.length,data:bytes.toString('base64')};pair[key]='/assets/'+name;}
 if(complete)assetSets.push(pair);
}
if(!assetSets.length)throw new Error('No complete costume set');
const assetUrls={head:assetSets[0].head,outfit:assetSets[0].outfit,sets:assetSets};
const library=await read('client/glyph-library.js');
const libraryContext={window:{}};runInNewContext(library,libraryContext);
const blessings=libraryContext.window.BlessingLibrary;
const recipeChoices=Object.fromEntries(blessings.choices.map(c=>[c.id,{text:c.text,charCount:c.chars.length,itemCount:c.kind==='phrase'?c.chars.length:blessings.glyphs[c.chars[0]].groups.length}]));
const base=`${await read('client/base.js')}\n${library}`,filter=`window.LION_ASSETS=${JSON.stringify(assetUrls)};\n${await read('client/lion-filter.js')}`,media=await read('client/media.js'),pose=`${await read('client/readiness-gesture.js')}\n${await read('client/pose-worker.js')}`;
new Script(pose);
let app=`${await read('client/cursor-smoothing.js')}\n${await read('client/player-lobby.js')}\n${await read('client/camera-lobby.js')}\n${(await read('client/app.js')).replace('"__POSE_WORKER__"',JSON.stringify(pose))}`;
for(const [marker,source]of [['BASE',base],['FILTER',filter],['MEDIA',media],['APP',app]])html=html.replace(`/* ${marker} */`,source.replaceAll('</script','<\\/script'));
for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(script[1]);
const audio=(await readFile(resolve(root,'soundtrack.mp3'))).toString('base64');
const api=`const RECIPE_CHOICES=${JSON.stringify(recipeChoices)};\n${(await read('worker/api.js')).replace('export async function handleApi','async function handleApi')}`;
const source=`${api}\nconst HTML=${JSON.stringify(html)};\nconst AUDIO=${JSON.stringify(audio)};\nconst ASSETS=${JSON.stringify(assets)};\nconst assetBytes=new Map();\nlet audioBytes;\nexport default {async fetch(request,env,ctx){\n const response=await handleApi(request,env,ctx);if(response)return response;\n const url=new URL(request.url);\n if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});\n if(ASSETS[url.pathname]){const asset=ASSETS[url.pathname];if(request.method==='HEAD')return new Response(null,{headers:{'Content-Type':asset.mime,'Content-Length':String(asset.bytes),'Cache-Control':'public,max-age=31536000,immutable'}});if(!assetBytes.has(url.pathname))assetBytes.set(url.pathname,Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0)));return new Response(assetBytes.get(url.pathname),{headers:{'Content-Type':asset.mime,'Content-Length':String(asset.bytes),'Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'}});}\n if(url.pathname==='/soundtrack.mp3'){audioBytes ||= Uint8Array.from(atob(AUDIO),c=>c.charCodeAt(0));const headers={'Content-Type':'audio/mpeg','Cache-Control':'public,max-age=86400','Content-Length':String(audioBytes.length)};return new Response(request.method==='HEAD'?null:audioBytes,{headers});}\n if(url.pathname==='/'||url.pathname==='/index.html')return new Response(request.method==='HEAD'?null:HTML,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(self),microphone=(),web-share=(self)'}});\n return new Response('Not found',{status:404});\n}};\n`;
await mkdir(resolve(root,'worker'),{recursive:true});await writeFile(resolve(root,'worker/index.js'),source);
await rm(resolve(root,'dist'),{recursive:true,force:true});await mkdir(resolve(root,'dist/server'),{recursive:true});await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await writeFile(resolve(root,'dist/server/index.js'),source);await writeFile(resolve(root,'dist/.openai/hosting.json'),await read('.openai/hosting.json'));
await writeFile(resolve(root,'dist/index.html'),html);
const module=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);if(typeof module.default.fetch!=='function')throw new Error('Worker validation failed');
console.log(JSON.stringify({htmlBytes:Buffer.byteLength(html),workerBytes:Buffer.byteLength(source),audioBytes:Buffer.from(audio,'base64').length,costumeSets:assetSets.length,costumeBytes:Object.values(assets).reduce((n,a)=>n+a.bytes,0)}));
