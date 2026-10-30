import {readdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const root='dist-public';
const forbidden=[/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/gh[pousr]_[A-Za-z0-9]{30,}/,/BRAWL_STARS_API_TOKEN/,/OAI-Sites-Authorization/,/\/api\/(?:player|history|journal|model-maintenance)/,/siwc_bypass_bearer_token/];
let count=0;
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())walk(p);else{if(/(?:\.map|\.env|\.sqlite|\.parquet|\.npz|\.pkl)$/.test(p))throw new Error(`Unexpected public artifact: ${p}`);const text=readFileSync(p,'utf8');for(const pattern of forbidden)if(pattern.test(text))throw new Error(`Private content pattern in ${p}: ${pattern}`);count++;}}}
if(!existsSync(root))throw new Error('Build the public app first.');walk(root);
writeFileSync(join(root,'vercel.json'),JSON.stringify({cleanUrls:true,headers:[{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'}]}]},null,2));
console.log(`PASS: ${count} public artifacts scanned; no credential patterns, player defaults, private endpoints or source maps. Static-only release.`);
