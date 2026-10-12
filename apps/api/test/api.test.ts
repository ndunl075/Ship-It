import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createWorker } from '../src/index';
import type { Database, Statement, Env } from '../src/types';
import { Store } from '../src/store';
import { authenticate } from '../src/auth';
import { githubClient } from '../src/github';
const now=new Date('2026-10-12T12:00:00Z'),sha='a'.repeat(40);
const input={schema_version:1,repository_id:42,deployment_id:7,environment:'production',commit_sha:sha};
const key=await generateKeyPair('RS256');const jwk=await exportJWK(key.publicKey);jwk.kid='test';
const keys=createLocalJWKSet({keys:[jwk]});
async function token(overrides:Record<string,unknown>={}) {return new SignJWT({repository_id:'42',repository:'owner/repo',repository_visibility:'public',sha,run_id:'8',run_attempt:'1',event_name:'push',...overrides}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://token.actions.githubusercontent.com').setAudience('ship-it-api').setIssuedAt(now.getTime()/1000).setNotBefore(now.getTime()/1000).setExpirationTime(now.getTime()/1000+300).sign(key.privateKey);}
class SqliteAdapter implements Database {
 db=new DatabaseSync(':memory:');fail=false;
 constructor(){this.db.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));}
 prepare(sql:string):Statement {let params:unknown[]=[];const query=()=>this.db.prepare(sql);const statement:Statement={bind:(...p)=>{params=p;return statement;},first:async<T>()=>(query().get(...params as never[])??null) as T|null,all:async<T>()=>({results:query().all(...params as never[]) as T[]}),run:async()=>{query().run(...params as never[]);return {success:true};}};return statement;}
 async batch(statements:Statement[]){if(this.fail)throw new Error('database offline');this.db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());this.db.exec('COMMIT');return results;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
let db:SqliteAdapter,env:Env;
let overrides:Record<string,unknown>;
function github(path: string) {
 const data:Record<string,unknown>={
  '/repositories/42':{id:42,private:false,visibility:'public',name:'repo',full_name:'owner/repo',owner:{login:'owner'},description:'A project',homepage:'javascript:alert(1)',html_url:'https://github.com/owner/repo'},
  '/repos/owner/repo/deployments/7':{id:7,sha,environment:'production',production_environment:true,repository_url:'https://api.github.com/repos/owner/repo'},
  '/repos/owner/repo/actions/runs/8':{id:8,run_attempt:1,event:'push',head_sha:sha,repository:{id:42},head_repository:{id:42}},
  '/repos/owner/repo/deployments/7/statuses?per_page=100':[{state:'success',created_at:now.toISOString(),environment_url:'https://example.com',url:'https://api.github.com/repos/owner/repo/deployments/7/statuses/9'}]
 };
 return path in overrides?overrides[path]:data[path];
}
const logs:Record<string,unknown>[]=[];
const worker=createWorker({keys,now:()=>now,log:r=>logs.push(r),fetcher:async(request)=>{const u=new URL(String(request));const data=github(u.pathname+u.search);return data instanceof Response?data:Response.json(data);}});
async function post(claims:Record<string,unknown>={},payload:unknown=input){return worker.fetch(new Request('https://api.test/v1/launches',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await token(claims)}`},body:JSON.stringify(payload)}),env);}
async function get(path:string){return worker.fetch(new Request('https://api.test'+path),env);}
beforeEach(()=>{db=new SqliteAdapter();env={DB:db,PLANET_ORIGIN:'https://planet.test',SITE_ORIGIN:'https://planet.test/Ship-It/',GITHUB_OIDC_AUDIENCE:'ship-it-api',IP_LIMITER:{limit:async()=>({success:true})},REPO_LIMITER:{limit:async()=>({success:true})}};overrides={};logs.length=0;});
describe('verified registration',()=>{
 it('uses supported manual redirect mode and follows only bounded GitHub redirects',async()=>{
  const calls:string[]=[];const client=githubClient('maintainer-test',async(url,init)=>{calls.push(String(url));expect(init?.redirect).toBe('manual');return calls.length===1?new Response(null,{status:301,headers:{Location:'https://api.github.com/repos/owner/renamed'}}):Response.json({id:42});});
  expect(await client('/repositories/42')).toEqual({id:42});expect(calls).toHaveLength(2);
  let count=0;const unsafe=githubClient('maintainer-test',async()=>{count++;return new Response(null,{status:302,headers:{Location:'https://attacker.test/steal'}});});
  await expect(unsafe('/repositories/42')).rejects.toMatchObject({status:502,diagnostic:{upstream_status:302,upstream_failure:'redirect'}});expect(count).toBe(1);
  let loopCount=0;const loop=githubClient(undefined,async()=>{loopCount++;return new Response(null,{status:301,headers:{Location:'/repositories/42'}});});await expect(loop('/repositories/42')).rejects.toMatchObject({status:502});expect(loopCount).toBe(3);
 });
 it.each([['Illegal invocation secret-token','illegal_invocation'],['AbortSignal.timeout is not a function secret-token','unsupported_timeout'],['redirect not allowed secret-token','redirect'],['fetch failed secret-token','fetch_failed'],['other secret-token','network']])('classifies runtime failures without leaking messages',async(message,classification)=>{
  const client=githubClient(undefined,async()=>{throw new TypeError(message);});
  let error:unknown;try {await client('/repositories/42');}catch(caught){error=caught;}
  expect(error).toMatchObject({status:502,diagnostic:{upstream_path:'/repositories/42',upstream_failure:classification,upstream_error_name:'TypeError'}});
  expect(JSON.stringify(error)).not.toContain('secret-token');
 });
 it.each(['issuer','audience','expiry','future','signature'])('rejects invalid JWT %s cryptographically',async kind=>{
  const other=kind==='signature' ? await generateKeyPair('RS256') : key;
  const jwt=await new SignJWT({repository_id:'42',repository:'owner/repo',repository_visibility:'public',sha,run_id:'8',run_attempt:'1',event_name:'push'})
   .setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(kind==='issuer'?'https://attacker.test':'https://token.actions.githubusercontent.com')
   .setAudience(kind==='audience'?'another-api':'ship-it-api').setIssuedAt(now.getTime()/1000)
   .setNotBefore(now.getTime()/1000+(kind==='future'?300:0)).setExpirationTime(now.getTime()/1000+(kind==='expiry'?-300:300)).sign(other.privateKey);
  await expect(authenticate(`Bearer ${jwt}`,'ship-it-api',keys,now)).rejects.toMatchObject({status:401,code:'invalid_identity'});
 });
 it('creates a verified launch and duplicate returns the same ID',async()=>{const first=await post();expect(first.status).toBe(201);const a=await first.json();const second=await post();expect(second.status).toBe(200);expect(await second.json()).toEqual({...a,duplicate:true});expect(db.db.prepare('SELECT count(*) AS n FROM launches').get()).toEqual({n:1});expect(JSON.stringify(logs)).not.toContain('Bearer');});
 it('deduplicates simultaneous requests at the database constraint',async()=>{const auth=await token();const request=()=>new Request('https://api.test/v1/launches',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},body:JSON.stringify(input)}); // Serialize the SQLite adapter batch as D1 does.
  const batch=db.batch.bind(db);let chain=Promise.resolve<{success:boolean}[]>([]);db.batch=(s)=>{chain=chain.then(()=>batch(s));return chain;};
  const responses=await Promise.all(Array.from({length:8},()=>worker.fetch(request(),env)));expect(responses.filter(r=>r.status===201)).toHaveLength(1);expect(responses.filter(r=>r.status===200)).toHaveLength(7);
 });
 it.each([{repository_id:'43'},{sha:'b'.repeat(40)},{repository_visibility:'private'},{event_name:'pull_request'}])('rejects mismatched identity %j',async claims=>{expect((await post(claims)).status).toBeGreaterThanOrEqual(401);expect(db.db.prepare('SELECT count(*) AS n FROM launches').get()).toEqual({n:0});});
 it('rejects token with wrong audience and signature',async()=>{const jwt=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('wrong').setAudience('wrong').sign(key.privateKey);const res=await worker.fetch(new Request('https://api.test/v1/launches',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt}`},body:JSON.stringify(input)}),env);expect(res.status).toBe(401);});
 it.each(['failure','pending','inactive'])('rejects latest %s status',async state=>{overrides['/repos/owner/repo/deployments/7/statuses?per_page=100']=[{state,created_at:now.toISOString()}];expect((await post()).status).toBe(409);});
 it('rejects stale success, preview deployment and foreign run',async()=>{overrides['/repos/owner/repo/deployments/7/statuses?per_page=100']=[{state:'success',created_at:'2026-10-10T00:00:00Z'}];expect((await post()).status).toBe(409);overrides={};const original=github('/repos/owner/repo/deployments/7') as object;overrides['/repos/owner/repo/deployments/7']={...original,environment:'preview'};expect((await post()).status).toBe(403);overrides={};overrides['/repos/owner/repo/actions/runs/8']={id:8,run_attempt:1,event:'push',head_sha:sha,repository:{id:43},head_repository:{id:42}};expect((await post()).status).toBe(403);});
 it('returns retryable errors for GitHub quotas and storage failure',async()=>{overrides['/repositories/42']=new Response('',{status:429});expect((await post()).status).toBe(502);overrides={};db.fail=true;expect((await post()).status).toBe(503);expect(db.db.prepare('SELECT count(*) AS n FROM projects').get()).toEqual({n:0});});
 it('logs only allowlisted diagnostics for upstream quota failures',async()=>{overrides['/repositories/42']=new Response('secret upstream error body',{status:403,headers:{'X-RateLimit-Remaining':'0',Authorization:'secret header'}});const result=await post();expect(result.status).toBe(502);expect((await result.json()).error.code).toBe('github_rate_limited');expect(logs.at(-1)).toMatchObject({upstream_path:'/repositories/42',upstream_status:403,upstream_remaining:0});expect(JSON.stringify(logs)).not.toContain('secret');});
 it('enforces strict schemas, streamed size and limits',async()=>{expect((await post({}, {...input,description:'untrusted'})).status).toBe(400);expect((await post({}, {...input,environment:'staging'})).status).toBe(400);expect((await post({},'x'.repeat(9000))).status).toBe(413);env.REPO_LIMITER={limit:async()=>({success:false})};const r=await post();expect(r.status).toBe(429);expect(r.headers.get('Retry-After')).toBe('60');});
});
describe('public API',()=>{
 it('returns typed world, detail, project, directory and history with safe URLs',async()=>{const r=await post();const {launch_id}=await r.json();for(const path of ['/v1/world','/v1/projects','/v1/launches','/v1/projects/42','/v1/projects/42/launches',`/v1/launches/${launch_id}`]){const response=await get(path);expect(response.status,path).toBe(200);expect(await response.text()).not.toContain('javascript:');}expect((await (await get('/v1/projects/42')).json()).launchCount).toBe(1);});
 it('hides project and its launches everywhere and records an audit',async()=>{const {launch_id}=await (await post()).json();await new Store(db).moderate(42,true,'Owner removal');expect((await get('/v1/projects/42')).status).toBe(404);expect((await get(`/v1/launches/${launch_id}`)).status).toBe(404);expect((await (await get('/v1/world')).json()).projects).toEqual([]);expect((await (await get('/v1/launches')).json()).items).toEqual([]);expect(db.db.prepare('SELECT count(*) AS n FROM moderation_audit').get()).toEqual({n:1});});
 it('paginates by stable keys without repeats and rejects cross-scope cursors',async()=>{await post();db.db.exec(`INSERT INTO launches SELECT 'second',project_id,8,github_run_id,commit_sha,environment,target_url,status_url,deployed_at,recorded_at FROM launches LIMIT 1`);const page=await (await get('/v1/launches?limit=1')).json();expect(page.nextCursor).toBeTruthy();const next=await (await get(`/v1/launches?limit=1&cursor=${page.nextCursor}`)).json();expect(next.items[0].id).not.toBe(page.items[0].id);expect(next.nextCursor).toBeNull();expect((await get(`/v1/projects?cursor=${page.nextCursor}`)).status).toBe(400);});
 it('uses ETags, CORS and bounded queries',async()=>{await post();const response=await get('/v1/world');const cached=await worker.fetch(new Request('https://api.test/v1/world',{headers:{'If-None-Match':response.headers.get('ETag')!}}),env);expect(cached.status).toBe(304);expect((await get('/v1/world?limit=999')).status).toBe(400);const forbidden=await worker.fetch(new Request('https://api.test/v1/world',{headers:{Origin:'https://evil.test'}}),env);expect(forbidden.status).toBe(403);expect(forbidden.headers.get('Access-Control-Allow-Origin')).toBeNull();});
});

