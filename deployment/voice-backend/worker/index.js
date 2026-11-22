// Public speech service for the GitHub Pages app. All ElevenLabs credentials stay here.
const API = "https://api.elevenlabs.io/v1";
const ALLOWED_PHRASES = new Set(/* @SPEECH_CATALOG@ */ []);
const LIMIT_BYTES = 1024 * 1024;
const limits = new Map();
const encoder = new TextEncoder();
const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
const nowSeconds = () => Math.floor(Date.now() / 1000);
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{"Content-Type":"application/json", "Cache-Control":"no-store"}});

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "https://majed-codes.github.io").split(",").map((s) => s.trim());
}
function settings(env) {
  return {configured:!!(env.ELEVENLABS_API_KEY && (env.ELEVENLABS_VOICE_MALE || env.ELEVENLABS_VOICE_FEMALE)),
    provider:"elevenlabs", tts_model:env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2",
    stt_model:env.ELEVENLABS_STT_MODEL || "scribe_v2", max_recording_seconds:30};
}
function rateLimit(key, maximum, window = 60) {
  const now = nowSeconds();
  if (limits.size > 5000) for (const [id, value] of limits) if (value.reset <= now) limits.delete(id);
  let count = limits.get(key);
  if (!count || count.reset <= now) {count = {used:0, reset:now+window}; limits.set(key, count);}
  return ++count.used <= maximum;
}
const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64 = (value) => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")), (c) => c.charCodeAt(0));
async function signingKey(env) {
  return crypto.subtle.importKey("raw", encoder.encode(env.ELEVENLABS_API_KEY), {name:"HMAC",hash:"SHA-256"}, false, ["sign","verify"]);
}
async function createToken(env, origin, ip) {
  const payload = toBase64(encoder.encode(JSON.stringify({exp:nowSeconds()+600, origin, ip, id:crypto.randomUUID()})));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(env), encoder.encode(payload));
  return payload+"."+toBase64(signature);
}
async function authenticate(request, env, origin, ip) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await signingKey(env), fromBase64(signature), encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64(payload)));
    return data.exp > nowSeconds() && data.origin === origin && data.ip === ip ? data : null;
  } catch {return null;}
}

async function handle(request, env, ctx) {
  const url = new URL(request.url), origin = request.headers.get("Origin") || "";
  const ip = request.headers.get("CF-Connecting-IP") || "anonymous";
  if (url.pathname === "/") return Response.redirect("https://majed-codes.github.io/churn-desk-ae1/", 302);
  if (origin && !allowedOrigins(env).includes(origin)) return json({error:"origin_not_allowed"},403);
  if (request.method === "OPTIONS") return new Response(null,{status:204});
  if (url.pathname === "/api/health" && request.method === "GET") return json({ok:true,...settings(env)});
  if (url.pathname === "/voice/config" && request.method === "GET") return json(settings(env));
  if (!["/voice/session","/api/tts","/api/stt"].includes(url.pathname)) return json({error:"not_found"},404);
  if (request.method !== "POST") return json({error:"method_not_allowed"},405);
  if (!origin || !allowedOrigins(env).includes(origin)) return json({error:"origin_required"},403);
  if (!settings(env).configured) return json({error:"voice_not_configured"},503);
  if (url.pathname === "/voice/session") {
    if (!rateLimit("session:"+ip,12,3600)) return json({error:"session_limit"},429);
    return json({token:await createToken(env,origin,ip),expires_in:600});
  }
  const session = await authenticate(request,env,origin,ip);
  if (!session) return json({error:"invalid_session"},401);
  if (!rateLimit("requests:"+session.id,30) || !rateLimit("ip:"+ip,100,3600)) return json({error:"voice_rate_limit"},429);
  if (url.pathname === "/api/tts") {
    if (Number(request.headers.get("Content-Length")) > 5000) return json({error:"text_too_large"},413);
    const raw = await request.text();
    if (raw.length > 5000) return json({error:"text_too_large"},413);
    let body;
    try {body=JSON.parse(raw);} catch {return json({error:"invalid_json"},400);}
    const text=normalize(body.text), gender=body.gender === "f" ? "f" : "m";
    if (!text || text.length>600 || !ALLOWED_PHRASES.has(text)) return json({error:"phrase_not_in_simulator"},400);
    const voice = gender === "f" ? env.ELEVENLABS_VOICE_FEMALE || env.ELEVENLABS_VOICE_MALE : env.ELEVENLABS_VOICE_MALE || env.ELEVENLABS_VOICE_FEMALE;
    const model=settings(env).tts_model;
    const hash=toBase64(await crypto.subtle.digest("SHA-256",encoder.encode(JSON.stringify([voice,model,text]))));
    const cacheKey=new Request(url.origin+"/__voice_cache/"+hash);
    let cache, cached;
    try {cache=globalThis.caches?.default;cached=cache ? await cache.match(cacheKey) : null;}
    catch {cache=null;}
    if (cached) return new Response(cached.body,{headers:{"Content-Type":"audio/mpeg","X-Voice-Provider":"elevenlabs","X-Voice-Cache":"hit","Cache-Control":"private, max-age=86400"}});
    const result=await fetch(API+"/text-to-speech/"+encodeURIComponent(voice)+"?output_format=mp3_44100_128", {
      method:"POST",signal:AbortSignal.timeout(30000),headers:{"xi-api-key":env.ELEVENLABS_API_KEY,"Content-Type":"application/json","Accept":"audio/mpeg"},
      body:JSON.stringify({text,model_id:model,voice_settings:{stability:.45,similarity_boost:.8,style:.35}}),
    });
    if (!result.ok) return json({error:"elevenlabs_tts_failed",upstream_status:result.status},502);
    if (!(result.headers.get("Content-Type") || "").startsWith("audio/")) return json({error:"invalid_audio_response"},502);
    const audio=await result.arrayBuffer();
    if (!audio.byteLength) return json({error:"empty_audio"},502);
    const response=new Response(audio,{headers:{"Content-Type":"audio/mpeg","X-Voice-Provider":"elevenlabs","Cache-Control":"public, max-age=604800"}});
    if (cache) ctx.waitUntil(cache.put(cacheKey,response.clone()).catch(()=>{}));
    return response;
  }
  if (Number(request.headers.get("Content-Length"))>LIMIT_BYTES) return json({error:"recording_too_large"},413);
  // Limit streamed uploads before multipart parsing, including requests without Content-Length.
  const reader=request.body?.getReader();
  if (!reader) return json({error:"missing_recording"},400);
  const chunks=[];let total=0;
  while (true) {
    const {done,value}=await reader.read();if(done) break;
    total+=value.byteLength;
    if(total>LIMIT_BYTES) {await reader.cancel();return json({error:"recording_too_large"},413);}
    chunks.push(value);
  }
  let form;
  try {form=await new Response(new Blob(chunks),{headers:{"Content-Type":request.headers.get("Content-Type") || ""}}).formData();}
  catch {return json({error:"invalid_recording"},400);}
  const file=form.get("file");
  if (!(file instanceof Blob) || !file.size || !/^(audio\/|video\/webm)/.test(file.type)) return json({error:"invalid_audio_file"},400);
  const upload=new FormData();
  upload.set("file",file,"recording."+(file.type.includes("mp4") ? "mp4" : file.type.includes("mpeg") ? "mp3" : "webm"));
  upload.set("model_id",settings(env).stt_model);
  upload.set("language_code","ara");
  const result=await fetch(API+"/speech-to-text",{method:"POST",signal:AbortSignal.timeout(60000),headers:{"xi-api-key":env.ELEVENLABS_API_KEY},body:upload});
  if (!result.ok) return json({error:"elevenlabs_stt_failed",upstream_status:result.status},502);
  const transcription=await result.json();
  return json({text:String(transcription.text || "").trim(),provider:"elevenlabs"});
}

export default {
  async fetch(request,env,ctx) {
    let response;
    try {response=await handle(request,env,ctx);} catch (error) {
      console.error("voice_service_failure",error.name,String(error.message).slice(0,180));
      response=json({error:"voice_service_unavailable"},502);
    }
    const origin=request.headers.get("Origin");
    response=new Response(response.body,response);
    if (origin && allowedOrigins(env).includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin",origin);
      response.headers.set("Vary","Origin");
      response.headers.set("Access-Control-Allow-Methods","GET, POST, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers","Content-Type, Authorization");
      response.headers.set("Access-Control-Expose-Headers","X-Voice-Provider, X-Voice-Cache");
    }
    response.headers.set("X-Content-Type-Options","nosniff");
    return response;
  },
};
