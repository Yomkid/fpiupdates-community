// Local operator tool only. Never expose this consent flow as a public route.
require('dotenv/config');
const {OAuth2Client}=require('google-auth-library');
const {createServer}=require('node:http');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {writeFile}=require('node:fs/promises');
const {resolve}=require('node:path');
async function main(){
 const {GMAIL_CLIENT_ID:clientId,GMAIL_CLIENT_SECRET:clientSecret,SMTP_FROM:from}=process.env;
 if(!clientId||!clientSecret||!from)throw Error('Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and SMTP_FROM in backend/.env first.');
 const redirectUri='http://127.0.0.1:53682/oauth/gmail/callback',state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
 const client=new OAuth2Client({clientId,clientSecret,redirectUri,transporterOptions:{timeout:15000}});
 let resolving=false;const server=createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Type','text/plain; charset=utf-8');
  const url=new URL(req.url,'http://127.0.0.1:53682');if(req.method!=='GET'||url.pathname!=='/oauth/gmail/callback'){res.writeHead(404);res.end('Not found');return;}
  const incoming=url.searchParams.get('state')??'';if(!/^[A-Za-z0-9_-]{43}$/.test(incoming)||incoming.length!==state.length||!timingSafeEqual(Buffer.from(incoming),Buffer.from(state))){res.writeHead(400);res.end('Invalid state. Restart the local tool.');return;}
  if(resolving){res.writeHead(409);res.end('Already processing.');return;}resolving=true;
  try{const code=url.searchParams.get('code');if(!code)throw Error();const {tokens}=await client.getToken({code,codeVerifier:verifier});if(!tokens.refresh_token)throw Error();
   const values={EMAIL_TRANSPORT:'gmail-api',GMAIL_CLIENT_ID:clientId,GMAIL_CLIENT_SECRET:clientSecret,GMAIL_REFRESH_TOKEN:tokens.refresh_token,SMTP_FROM:from};
   await writeFile(resolve(process.cwd(),'.env.gmail'),Object.entries(values).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600,flag:'wx'});
   res.end('Gmail sending authorised. You can close this tab and return to PowerShell.');console.log('Saved backend/.env.gmail. Copy its settings into backend/.env, or your hosting secret settings. Do not share or commit this file.');
  }catch{res.writeHead(400);res.end('Authorisation could not finish. Check Gmail API, test-user consent, callback configuration, and whether .env.gmail already exists.');console.error('Gmail authorisation failed. No tokens are printed.');process.exitCode=1;}finally{clearTimeout(timer);server.close();}
 });
 const timer=setTimeout(()=>{console.error('Authorisation timed out. Run the tool again.');server.close();process.exitCode=1;},300000);
 server.on('error',()=>{clearTimeout(timer);console.error('Local callback port is unavailable. Close the other authorisation tool and retry.');process.exitCode=1;});
 server.listen(53682,'127.0.0.1',()=>console.log('Open this URL in your browser and choose the dedicated sending Gmail account:\n'+client.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/gmail.send'],state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'})));
}
main().catch(()=>{console.error('Gmail setup is incomplete. Read docs/GMAIL-AND-STAGING.md. No credentials are printed.');process.exitCode=1;});
