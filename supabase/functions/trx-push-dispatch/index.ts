import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { send } from "jsr:@daaku/webpush@0.2.0";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
function admin(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");let key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(raw){try{key=JSON.parse(raw).default??key}catch{}}const url=Deno.env.get("SUPABASE_URL");if(!url||!key)throw new Error("Supabase server credentials unavailable");return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
Deno.serve(async req=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const raw=Deno.env.get("VAPID_PRIVATE_KEY");if(!raw)return json({error:"VAPID private key is not configured"},503);
 const vapidSubject=Deno.env.get("VAPID_SUBJECT")||"https://appletheexchangetrx.github.io/mywhatsapp/";
 const publicKey=Deno.env.get("VAPID_PUBLIC_KEY");if(!publicKey)return json({error:"VAPID public key is not configured"},503);
 let vapid:JsonWebKey;
 try{
  if(raw.trim().startsWith("{"))vapid=JSON.parse(raw) as JsonWebKey;
  else{
   const decode=(value:string)=>{const normalized=value.replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(normalized+"=".repeat((4-normalized.length%4)%4)),c=>c.charCodeAt(0))};
   const encode=(value:Uint8Array)=>btoa(String.fromCharCode(...value)).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
   const point=decode(publicKey),privateBytes=decode(raw);
   if(point.length!==65||point[0]!==4||privateBytes.length!==32)throw new Error("Invalid VAPID key length");
   vapid={kty:"EC",crv:"P-256",x:encode(point.slice(1,33)),y:encode(point.slice(33,65)),d:encode(privateBytes),ext:true};
  }
  const privateCryptoKey=await crypto.subtle.importKey("jwk",vapid,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const publicCryptoKey=await crypto.subtle.importKey("raw",(()=>{const decode=(value:string)=>{const normalized=value.replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(normalized+"=".repeat((4-normalized.length%4)%4)),c=>c.charCodeAt(0))};return decode(publicKey)})(),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
  const probe=new TextEncoder().encode("vapid-key-pair-check");
  const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},privateCryptoKey,probe);
  if(!await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},publicCryptoKey,signature,probe))throw new Error("VAPID public/private key pair mismatch");
 }catch(error){console.error("VAPID configuration invalid",String(error));return json({error:"VAPID key configuration is invalid or the public/private keys do not match"},500)}
 try{
  const db=admin();
  const {data:subs,error:subError}=await db.from("trx_push_subscriptions").select("id,endpoint,p256dh,auth").eq("enabled",true);
  if(subError)throw subError;
  if(!subs?.length)return json({success:true,processed:0,waitingForSubscription:true});
  const {data:events,error:claimError}=await db.rpc("claim_trx_push_outbox",{batch_size:20});
  if(claimError)throw claimError;
  if(!events?.length)return json({success:true,processed:0});
  let delivered=0,failed=0;
  for(const event of events){
   let retry=false,deliveredForEvent=0;
   const {data:message}=await db.from("trx_messages").select("from_phone,profile_name,text_body,message_type").eq("id",event.message_id).maybeSingle();
   const notificationTitle=typeof message?.profile_name==="string"&&message.profile_name?message.profile_name:typeof message?.from_phone==="string"&&message.from_phone?message.from_phone:"WhatsApp";
   const messagePreview=typeof message?.text_body==="string"&&message.text_body?message.text_body:typeof message?.message_type==="string"?`Pesan ${message.message_type}`:"Anda menerima pesan baru.";
   const notificationBody=messagePreview.length>160?messagePreview.slice(0,157)+"...":messagePreview;
   for(const sub of subs){
    try{
     await send({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:notificationTitle,body:notificationBody,url:"./",tag:`wa-${event.message_id}`}),{vapid,subscriber:vapidSubject,ttl:60});
     delivered++;deliveredForEvent++;
    }catch(error){
     const e=error as {statusCode?:number;permanent?:boolean};
     if(e.permanent||e.statusCode===404||e.statusCode===410){
      const {error:disableError}=await db.from("trx_push_subscriptions").update({enabled:false,updated_at:new Date().toISOString()}).eq("id",sub.id);
      if(disableError)throw disableError;
     }else retry=true;
     console.warn("Web Push delivery failed",{statusCode:e.statusCode,permanent:e.permanent});
    }
   }
   const now=new Date(),attempts=Number(event.attempts||0)+1;
   let outboxUpdate;
   if(retry&&deliveredForEvent===0){
    outboxUpdate=await db.from("trx_push_outbox").update({status:attempts>=8?"failed":"pending",attempts,next_attempt_at:new Date(now.getTime()+Math.min(60,2**attempts)*60000).toISOString(),updated_at:now.toISOString()}).eq("id",event.id);
    failed++;
   }else if(deliveredForEvent>0){
    outboxUpdate=await db.from("trx_push_outbox").update({status:"sent",sent_at:now.toISOString(),updated_at:now.toISOString()}).eq("id",event.id);
   }else{
    outboxUpdate=await db.from("trx_push_outbox").update({status:"pending",attempts,next_attempt_at:new Date(now.getTime()+5*60000).toISOString(),updated_at:now.toISOString()}).eq("id",event.id);
   }
   if(outboxUpdate.error)throw outboxUpdate.error;
  }
  return json({success:true,processed:events.length,delivered,failed});
 }catch(error){console.error("Push dispatch failed",String(error));return json({error:"Push dispatcher failed"},500)}
});