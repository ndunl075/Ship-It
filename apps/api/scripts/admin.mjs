// Operator-only command; never exposed through the Worker or browser bundle.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [action, repository, ...rest] = process.argv.slice(2);
const remote = rest.includes('--remote');
const reason = rest.filter(v => v !== '--remote').join(' ');
if (!['hide','unhide','reconcile'].includes(action) || !/^[1-9]\d*$/.test(repository ?? '') || !Number.isSafeInteger(Number(repository)) || !reason.trim() || reason.length>1000) {
 console.error('Usage: node scripts/admin.mjs hide|unhide|reconcile REPOSITORY_ID "audit reason" [--remote]');process.exit(1);
}
const quote = value => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const safeUrl = value => {try {const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password?u.href:null;}catch{return null;}};
const pid=`gh:${repository}`,time=new Date().toISOString();let assignment=`status=${quote(action==='hide'?'hidden':'visible')}`;
if(action==='reconcile') {
 const response=await fetch(`https://api.github.com/repositories/${repository}`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Ship-It-maintenance',...(process.env.GITHUB_API_TOKEN?{Authorization:`Bearer ${process.env.GITHUB_API_TOKEN}`}:{})},signal:AbortSignal.timeout(10000)});
 if(response.status===404) assignment="status='hidden'";
 else {
  if(!response.ok) throw new Error(`GitHub unavailable (${response.status}); no database change`);
  const repo=await response.json();if(repo.id!==Number(repository)) throw new Error('Repository ID mismatch');
  if(repo.private || repo.visibility!=='public') assignment="status='hidden'";
  else {
   const clean=(v,max)=>typeof v==='string'?v.split('').filter(c=>c.charCodeAt(0)>31 && c.charCodeAt(0)!==127).join('').slice(0,max):null;
   // Preserve deliberate moderation state for repositories that remain public.
   assignment=`github_owner=${quote(clean(repo.owner.login,100))},github_repo=${quote(clean(repo.name,100))},display_name=${quote(clean(repo.name,100))},description=${quote(clean(repo.description,500))},repo_url=${quote(safeUrl(repo.html_url))},homepage_url=${quote(safeUrl(repo.homepage))}`;
  }
 }
}
const sql=`BEGIN TRANSACTION;\nUPDATE projects SET ${assignment},updated_at=${quote(time)} WHERE id=${quote(pid)};\nINSERT INTO moderation_audit(id,project_id,action,reason,created_at) VALUES(${quote(crypto.randomUUID())},${quote(pid)},${quote(action)},${quote(reason)},${quote(time)});\nCOMMIT;\n`;
const temp=mkdtempSync(join(tmpdir(),'ship-it-admin-'));
const file=join(temp,'moderation.sql');
try {
 writeFileSync(file,sql);
 const result=spawnSync(process.platform==='win32'?'pnpm.cmd':'pnpm',['exec','wrangler','d1','execute','ship-it',remote?'--remote':'--local','--file',file],{stdio:'inherit',shell:process.platform==='win32'});
 if(result.error) throw result.error;process.exitCode=result.status??1;
} finally {unlinkSync(file);rmdirSync(temp);}

