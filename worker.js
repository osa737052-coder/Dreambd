import html from "./index.html";
// Dream Mini App backend — Cloudflare Worker + KV
const CORS={"access-control-allow-origin":"*","access-control-allow-headers":"content-type,x-init","access-control-allow-methods":"POST,OPTIONS"};
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{"content-type":"application/json",...CORS}});
const enc=new TextEncoder(),RATE=0.00001,MINW=0.08,F={err:"forbidden"};
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,"0")).join("");
async function hmac(key,msg){const k=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",k,enc.encode(msg)))}
async function verify(init,env){const p=new URLSearchParams(init||""),h=p.get("hash");if(!h)return null;p.delete("hash");
 const s=[...p.entries()].map(([k,v])=>k+"="+v).sort().join("\n"),sk=await hmac(enc.encode("WebAppData"),env.BOT_TOKEN);
 if(hex(await hmac(sk,s))!==h||Date.now()/1000-(+p.get("auth_date")||0)>86400)return null;
 try{return JSON.parse(p.get("user"))}catch{return null}}
const tg=(env,m,b)=>fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${m}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({ok:false}));
const get=(env,k)=>env.KV.get(k,"json"),put=(env,k,v)=>env.KV.put(k,JSON.stringify(v));
const isAdm=(env,id)=>(env.ADMIN_IDS||"").split(",").map(s=>s.trim()).includes(String(id));
async function listAll(env,prefix){let out=[],cursor;do{const r=await env.KV.list({prefix,cursor});out.push(...r.keys);cursor=r.list_complete?null:r.cursor}while(cursor);return out}
const banned=async(env,id)=>{const b=await get(env,"ban:"+id);return b&&!b.lifted?(b.reason||"banned"):""};
async function setBan(env,id,reason){await put(env,"ban:"+id,{reason,ts:Date.now()});const r=await get(env,"ref:"+id);if(r&&r.ref)await env.KV.put(`rc:${r.ref}:${id}`,"1",{metadata:{a:0,bad:1}})}
const unban=(env,id)=>put(env,"ban:"+id,{lifted:true,ts:Date.now()});
function chatRef(c){if(!c)return"";if(c.c)return c.c.trim();const u=c.u||"";if(u[0]==="@")return u;const m=u.match(/t\.me\/(\w+)/);return m&&!/^(joinchat|c)$/i.test(m[1])?"@"+m[1]:""}
async function gate(env,uid){const g=((await get(env,"cfg"))||{}).gate||{};if(!g.on)return{ok:true,missing:[]};const missing=[];
 for(const ch of(g.list||[]).map(chatRef).filter(Boolean)){const r=await tg(env,"getChatMember",{chat_id:ch,user_id:+uid}),st=r.ok&&r.result.status;
  if(!(["creator","administrator","member"].includes(st)||(st==="restricted"&&r.result.is_member)))missing.push(ch)}
 return{ok:!missing.length,missing}}
async function refCount(env,uid){const l=(await listAll(env,`rc:${uid}:`)).filter(k=>!(k.metadata||{}).bad);return{n:l.length,a:l.filter(k=>(k.metadata||{}).a).length}}
async function saveMe(env,uid,d){const o=(await get(env,"me:"+uid))||{},r=await get(env,"ref:"+uid),w=x=>(x.pts||0)+(x.usdt||0)/RATE;
 if(!(d.pts>=0)||!(d.usdt>=0))return{err:"bad"};
 const inc=w(d)-w(o),h=o.hb&&Date.now()-o.hb.t<36e5?o.hb:{t:Date.now(),n:0},step=(+env.MAX_STEP||3000)+(o.allow||0);
 if(inc>step||h.n+Math.max(inc,0)>(+env.MAX_HOUR||10000)+(o.allow||0))return{err:"limit"};
 h.n+=Math.max(inc,0);Object.assign(d,{hb:h,allow:0,rp:o.rp||0,codes:o.codes||[],ref:(r&&r.ref)||""});await put(env,"me:"+uid,d);return{ok:1}}
async function dbOp(env,uid,adm,{op,path="",data}){const p=path.split("/"),key=path.replace(/\//g,":");
 if(op==="claims"){const t=((await get(env,"cfg"))||{}).tasks||[],used={};for(const x of t){const n=+(await env.KV.get("cnt:"+x.id))||0;if(n)used[x.id]=n}return{used}}
 if(path==="config/main"){if(op==="get"){const c=await get(env,"cfg");if(!c)return{exists:false};const o={...c};if(!adm)delete o.promos;return{exists:true,data:o}}
  if(op==="set"&&adm){await put(env,"cfg",data);return{ok:1}}return F}
 if(p[0]==="data"&&p[3]==="me"){if(p[2]!==uid&&!adm)return F;if(op==="get"){const m=await get(env,"me:"+p[2]);return m?{exists:true,data:m}:{exists:false}}
  if(op==="set"&&p[2]===uid){if(await banned(env,uid))return F;return saveMe(env,uid,data)}return F}
 if(p[0]==="claims"&&op==="set"&&p[1]===uid){const old=(await get(env,"claim:"+uid))||{ids:[]},t=((await get(env,"cfg"))||{}).tasks||[],ids=(data.ids||[]).filter(i=>t.some(x=>x.id===i));
  for(const i of ids.filter(i=>!old.ids.includes(i)))await env.KV.put("cnt:"+i,String((+(await env.KV.get("cnt:"+i))||0)+1));await put(env,"claim:"+uid,{ids});return{ok:1}}
 if(p[0]==="refs"&&op==="update"&&p[1]===uid){const m=await get(env,"me:"+uid),r=await get(env,"ref:"+uid);
  if(m&&r&&r.ref&&data.active&&(m.gp||0)>=5&&(m.done||[]).length>=3){const rk=`rc:${r.ref}:${uid}`,e=await env.KV.getWithMetadata(rk);if(e.value&&!(e.metadata||{}).bad)await env.KV.put(rk,"1",{metadata:{a:1,bad:0}})}return{ok:1}}
 if(p[0]==="bans"){if(op==="get"&&(p[1]===uid||adm)){const b=await get(env,"ban:"+p[1]);return b?{exists:true,data:b}:{exists:false}}
  if(adm&&op==="set"){data.lifted?await unban(env,p[1]):await setBan(env,p[1],data.reason||"banned by admin");return{ok:1}}
  if(adm&&op==="list"){const l=await listAll(env,"ban:"),docs=[];for(const k of l)docs.push({id:k.name.slice(4),data:await get(env,k.name)});return{docs}}return F}
 if(p[0]==="taskreq"){if(op==="set"&&p[1]===uid&&data.uid===uid){await put(env,"treq:"+uid,data);return{ok:1}}
  if(adm&&op==="list"){const l=await listAll(env,"treq:"),docs=[];for(const k of l)docs.push({id:k.name,data:await get(env,k.name)});return{docs}}return F}
 if(p[0]==="taskstatus"){if(op==="get"){const s=await get(env,"ts:"+p[1]);return s?{exists:true,data:s}:{exists:false}}
  if(adm&&op==="set"){await put(env,"ts:"+p[1],data);return{ok:1}}
  if(adm&&op==="list"){const l=await listAll(env,"ts:"),docs=[];for(const k of l)docs.push({id:k.name.slice(3),data:await get(env,k.name)});return{docs}}return F}
 if(p[0]==="withdrawals"){if(adm&&op==="list"){const l=await listAll(env,"wd:"),docs=[];for(const k of l)docs.push({id:k.name.slice(3),data:await get(env,k.name)});return{docs}}
  if(adm&&op==="update"){const w=await get(env,"wd:"+p[1]);if(!w)return F;await put(env,"wd:"+p[1],{...w,...data});return{ok:1}}
  if(op==="set"&&p[1].startsWith(uid+"_")){const m=await get(env,"me:"+uid)||{},n=+data.amount,rc=await refCount(env,uid),g=await gate(env,uid);
   if(rc.a<1||!m.wallet||!(n>=MINW)||n>(m.usdt||0)||!g.ok||await banned(env,uid))return{err:"rejected"};
   m.usdt=+(m.usdt-n).toFixed(8);await put(env,"me:"+uid,m);await put(env,"wd:"+p[1],{uid,amount:n,wallet:m.wallet,status:"pending",ts:Date.now()});return{ok:1}}return F}
 return F}
async function api(req,env,name){const u=await verify(req.headers.get("x-init"),env);if(!u)return J({err:"auth"},401);
 const uid=String(u.id),adm=isAdm(env,uid),b=await req.json().catch(()=>({})),bn=await banned(env,uid);
 if(name==="init"){let r=await get(env,"ref:"+uid);if(!r){const pr=await env.KV.get("pref:"+uid);r={ref:pr||""};await put(env,"ref:"+uid,r);if(pr)await env.KV.put(`rc:${pr}:${uid}`,"1",{metadata:{a:0,bad:0}})}
  return J({uid,admin:adm,ban:bn,ref:r.ref,bot:env.BOT_USERNAME||""})}
 if(bn&&!adm)return J({err:"banned",ban:bn},403);
 if(name==="db")return J(await dbOp(env,uid,adm,b));
 if(name==="gate")return J(await gate(env,uid));
 if(name==="login")return J({ok:adm&&(!env.ADMIN_PASS||b.pw===env.ADMIN_PASS)});
 if(name==="refs"){const c=await refCount(env,uid),m=await get(env,"me:"+uid);let owed=0,rp=0;
  if(m){const tot=c.n*400+c.a*500;owed=tot-(m.rp||0);rp=tot;if(owed>0){m.rp=tot;m.allow=(m.allow||0)+owed;await put(env,"me:"+uid,m)}else owed=0}return J({ok:1,...c,owed,rp})}
 if(name==="redeem"){const c=String(b.code||"").trim().toUpperCase(),pr=(((await get(env,"cfg"))||{}).promos||[]).find(x=>String(x.code).toUpperCase()===c);
  if(!pr)return J({err:"Invalid code"});const m=(await get(env,"me:"+uid))||{};m.codes=m.codes||[];if(m.codes.includes(c))return J({err:"Already used"});
  m.codes.push(c);m.allow=(m.allow||0)+pr.pts;await put(env,"me:"+uid,m);return J({pts:pr.pts,codes:m.codes})}
 if(name==="dev"){const did=b.did||"n-"+uid,fp=String(b.fp||""),dk="dev:"+did,o=await env.KV.get(dk),r=await get(env,"ref:"+uid);
  if(o&&o!==uid&&!adm){const self=r&&r.ref===o,why=self?"Fake referral (same device)":"Duplicate account on this device";await setBan(env,uid,why);if(self)await setBan(env,o,why);return J({ban:why})}
  if(!o)await env.KV.put(dk,uid);
  if(fp){if(r&&r.ref){const l=await env.KV.list({prefix:"fp:"+fp+":"});if(l.keys.some(k=>k.name.endsWith(":"+r.ref)))await env.KV.put(`rc:${r.ref}:${uid}`,"1",{metadata:{a:0,bad:1}})}await env.KV.put(`fp:${fp}:${uid}`,"1")}
  return J({ok:1})}
 return J({err:"unknown"},404)}
async function hook(req,env){if(req.headers.get("x-telegram-bot-api-secret-token")!==env.WEBHOOK_SECRET)return new Response("no",{status:403});
 const m=((await req.json()).message);if(!m||!m.text)return new Response("ok");
 const id=String(m.from.id),[cmd,a1,...rest]=m.text.trim().split(/\s+/),c=cmd.split("@")[0].toLowerCase(),say=t=>tg(env,"sendMessage",{chat_id:m.chat.id,text:t});
 if(c==="/start"){const mm=(a1||"").match(/^r-?(\d+)$/);if(mm&&mm[1]!==id&&!(await get(env,"ref:"+id)))await env.KV.put("pref:"+id,mm[1]);
  await tg(env,"sendMessage",{chat_id:m.chat.id,text:"👋 Welcome! Tap the button to open the app.",reply_markup:{inline_keyboard:[[{text:"🚀 Open App",web_app:{url:env.APP_URL}}]]}})}
 else if((c==="/ban"||c==="/unban")&&isAdm(env,id)){const t=(a1||"").replace(/\D/g,"");if(!t)return(await say("Usage: "+c+" <telegram_id>"),new Response("ok"));
  if(c==="/ban"){await setBan(env,t,rest.join(" ")||"banned by admin");await say("🚫 Banned "+t)}else{await unban(env,t);await say("✅ Unbanned "+t)}}
 return new Response("ok")}
export default{async fetch(req,env){const u=new URL(req.url);
 if(req.method==="OPTIONS")return new Response(null,{headers:CORS});
 if(u.pathname==="/webhook"&&req.method==="POST")return hook(req,env);
 if(u.pathname.startsWith("/api/")&&req.method==="POST")return api(req,env,u.pathname.slice(5));
 return new Response(html,{headers:{"content-type":"text/html;charset=utf-8","cache-control":"no-cache"}})}};
   
