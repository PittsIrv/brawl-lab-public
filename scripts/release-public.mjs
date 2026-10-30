// Fail closed: staging starts only after every validation and privacy audit passes.
import {spawnSync} from 'node:child_process';
import {cpSync,mkdirSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const run=(cmd,args,cwd=process.cwd())=>{const p=spawnSync(cmd,args,{cwd,stdio:'inherit'});if(p.status!==0)throw new Error(`${cmd} failed (${p.status})`);};
run('npm',['run','typecheck']);run('npm',['test']);run('npm',['run','build:public']);
const stage=resolve('work/public-release');mkdirSync(stage,{recursive:true});
for(const e of readdirSync(stage))if(e!=='.vercel')rmSync(join(stage,e),{recursive:true,force:true});
mkdirSync(join(stage,'.vercel'),{recursive:true});
const target={projectId:'prj_5cf7DHddNoZ9GvnNacCd5pwC4VkU',orgId:'team_kDLeZKlyF0ibaojUtMPwUyap',projectName:'brawl-lab'};
writeFileSync(join(stage,'.vercel/project.json'),JSON.stringify(target));
writeFileSync(join(stage,'.vercelignore'),'.env*\n.git\n');
for(const e of readdirSync('dist-public')){if(!['assets','index.html','favicon.svg','vercel.json'].includes(e))throw new Error(`Unexpected release entry: ${e}`);cpSync(join('dist-public',e),join(stage,e),{recursive:true});}
if(process.argv.includes('--deploy'))run('vercel',['deploy','--prod','--yes','--scope','mingxiy-cmuedus-projects','--non-interactive'],stage);
else console.log(`Verified static release staged at ${stage}; use --deploy to publish.`);
