import { launchInputSchema } from '@ship-it/shared';
import type { JWTVerifyGetKey } from 'jose';
import { authenticate } from './auth';
import { githubClient, verifyDeployment } from './github';
import { Store } from './store';
import { ApiError, type Env } from './types';
interface Context { waitUntil(promise:Promise<unknown>):void }
interface EdgeCache {match(request:Request):Promise<Response|undefined>; put(request:Request,response:Response):Promise<void>}
export function createWorker(options: {keys?:JWTVerifyGetKey; fetcher?:typeof fetch; now?:()=>Date; log?:(record:Record<string,unknown>)=>void; cache?:EdgeCache} = {}) {
 return { async fetch(request:Request,env:Env,context?:Context):Promise<Response> {
  const requestId=crypto.randomUUID(),started=Date.now(),url=new URL(request.url),now=options.now?.()??new Date();
  let status=500,code:string|undefined,diagnostic:ApiError['diagnostic'];
  let repositoryId:number|undefined,deploymentId:number|undefined,verificationResult:'verified'|'rejected'|'unavailable'|undefined;
  const origin=request.headers.get('Origin');
  const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','X-Request-Id':requestId,'Vary':'Origin','Cache-Control':'no-store'};
  if(origin===env.PLANET_ORIGIN) headers['Access-Control-Allow-Origin']=origin;
  const respond=(data:unknown,s=200)=>{status=s;return new Response(JSON.stringify(data),{status:s,headers});};
  try {
   if(origin && origin!==env.PLANET_ORIGIN) throw new ApiError(403,'origin_forbidden');
   if(request.method==='OPTIONS') {status=204; return new Response(null,{status,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});}
   if(request.method==='GET' && url.pathname==='/healthz') return respond({ok:true});
   const store=new Store(env.DB);
   if(request.method==='POST' && url.pathname==='/v1/launches') {
    if(!env.IP_LIMITER || !env.REPO_LIMITER) throw new ApiError(503,'rate_limit_unavailable');
    if(!(await env.IP_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')??'unknown'})).success) throw new ApiError(429,'rate_limited');
    if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json') throw new ApiError(400,'invalid_payload');
    const body=await boundedBody(request);
    let json:unknown;try {json=JSON.parse(body);}catch {throw new ApiError(400,'invalid_payload');}
    const parsed=launchInputSchema.safeParse(json); if(!parsed.success) throw new ApiError(400,'invalid_payload');
    repositoryId=parsed.data.repository_id;deploymentId=parsed.data.deployment_id;verificationResult='rejected';
    const identity=await authenticate(request.headers.get('Authorization'),env.GITHUB_OIDC_AUDIENCE,options.keys,now);
    if(!(await env.REPO_LIMITER.limit({key:String(identity.repositoryId)})).success) throw new ApiError(429,'rate_limited');
    let verified;
    try { verified=await verifyDeployment(parsed.data,identity,githubClient(env.GITHUB_API_TOKEN,options.fetcher),now.getTime()); }
    catch(error) {if(error instanceof ApiError) throw error;throw new ApiError(502,'github_invalid_response');}
    verificationResult='verified';
    let result; try { result=await store.ingest(parsed.data,verified,identity.runId,now.toISOString()); } catch {throw new ApiError(503,'storage_unavailable');}
    const site=new URL(env.SITE_ORIGIN);site.searchParams.set('launch',result.launch_id);
    return respond({...result,launch_url:site.toString()},result.duplicate?200:201);
   }
   if(request.method!=='GET') throw new ApiError(404,'not_found');
   const allowed = /^\/v1\/(world|projects|launches)(\/[^/]+)?(\/launches)?$/.test(url.pathname);
   if(!allowed) throw new ApiError(404,'not_found');
   const cache=options.cache??(globalThis as unknown as {caches?:{default:EdgeCache}}).caches?.default;
   // CORS and request IDs are applied after reading cached data.
   const cacheUrl=new URL(url);cacheUrl.searchParams.sort();const cacheKey=new Request(cacheUrl);
   const cached=await cache?.match(cacheKey);
   let data:unknown;
   if(cached) data=await cached.json();
   else {
    const rawLimit=url.searchParams.get('limit');const limit=rawLimit===null ? (url.pathname==='/v1/world'?100:30) : Number(rawLimit);
    if(!Number.isInteger(limit)||limit<1||limit>100) throw new ApiError(400,'invalid_limit');
    const cursor=url.searchParams.get('cursor'),query=url.searchParams.get('query')??'';
    if(query.length>100) throw new ApiError(400,'invalid_query');
    const p=url.pathname.split('/');
    try {
     if(url.pathname==='/v1/world') { const [projects,launches]=await Promise.all([store.listProjects(limit,cursor),store.listLaunches(30,null)]);data={projects:projects.items,launches:launches.items,nextCursor:projects.nextCursor}; }
     else if(url.pathname==='/v1/projects') data=await store.listProjects(limit,cursor,query);
     else if(url.pathname==='/v1/launches') data=await store.listLaunches(limit,cursor);
     else if(p[2]==='launches' && p.length===4) data=await store.detail(p[3]);
     else if(p[2]==='projects' && /^[1-9]\d*$/.test(p[3]) && Number.isSafeInteger(Number(p[3]))) {
      if(p.length===4) data=await store.project(Number(p[3]));
      else if(p.length===5 && p[4]==='launches') {if(!await store.project(Number(p[3]))) throw new ApiError(404,'not_found');data=await store.listLaunches(limit,cursor,Number(p[3]));}
     }
    } catch(error) {if(error instanceof ApiError) throw error;throw new ApiError(503,'storage_unavailable');}
    if(!data) throw new ApiError(404,'not_found');
    if(cache && context) context.waitUntil(cache.put(cacheKey,new Response(JSON.stringify(data),{headers:{'Cache-Control':'public, max-age=30','Content-Type':'application/json'}})));
   }
   const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));
   const etag='"'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')+'"';
   headers.ETag=etag;headers['Cache-Control']='public, max-age=30';
   if(request.headers.get('If-None-Match')?.split(',').map(s=>s.trim()).includes(etag)) {status=304;return new Response(null,{status,headers});}
   return respond(data);
  } catch(error) {
   const e=error instanceof ApiError?error:new ApiError(500,'internal_error');code=e.code;diagnostic=e.diagnostic;
   if(verificationResult==='rejected' && e.status>=500) verificationResult='unavailable';
   if(e.status===429) headers['Retry-After']='60';
   return respond({error:{code:e.code},request_id:requestId},e.status);
  } finally { (options.log??console.log)({request_id:requestId,status,latency_bucket_ms:Math.ceil((Date.now()-started)/100)*100,...(code?{error_code:code}:{}),...(repositoryId!==undefined?{repository_id:repositoryId,deployment_id:deploymentId,verification_result:verificationResult}:{}),...diagnostic}); }
 }};
}
async function boundedBody(request:Request):Promise<string> {
 if(Number(request.headers.get('Content-Length'))>8192) throw new ApiError(413,'body_too_large');
 const reader=request.body?.getReader();if(!reader) throw new ApiError(400,'invalid_payload');
 const chunks:Uint8Array[]=[];let size=0;
 try {while(true){const {done,value}=await reader.read();if(done) break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new ApiError(413,'body_too_large');}chunks.push(value);}} finally {reader.releaseLock();}
 const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
 try { return new TextDecoder('utf-8',{fatal:true}).decode(all); } catch {throw new ApiError(400,'invalid_payload');}
}
export default createWorker();
