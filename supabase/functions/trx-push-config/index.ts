import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
function admin(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");let key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(raw){try{key=JSON.parse(raw).default??key}catch{}}const url=Deno.env.get("SUPABASE_URL");if(!url||!key)throw new Error("Supabase server credentials unavailable");return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers});
 try{
  const db=admin();
  const {data,error}=await db.rpc("get_trx_push_vapid_config");
  if(error)throw error;
  if(!data?.public_key)throw new Error("VAPID public key unavailable");
  return new Response(JSON.stringify({publicKey:data.public_key}),{headers});
 }catch(error){
  console.error("Push config lookup failed",String(error));
  return new Response(JSON.stringify({error:"Push notifications are not configured"}),{status:503,headers});
 }
});