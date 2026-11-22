import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source=await fs.readFile(new URL("../dist/server/index.js",import.meta.url),"utf8");
const worker=(await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"))).default;
const origin="https://majed-codes.github.io";
const env={ELEVENLABS_API_KEY:"test-only-not-a-real-key",ELEVENLABS_VOICE_MALE:"test-male",ELEVENLABS_VOICE_FEMALE:"test-female"};
const phrase="مرحباً، هذا اختبار صوت مكتب رصين باستخدام إلفن لابز.";
const context={waitUntil(promise){return promise;}};
const upstream=[];
globalThis.fetch=async(url,options)=>{
  upstream.push({url:String(url),options});
  if(String(url).includes("speech-to-text")) return new Response(JSON.stringify({text:"اختبار صوت مكتب رصين"}),{headers:{"Content-Type":"application/json"}});
  return new Response(new Uint8Array([73,68,51,0,1]),{headers:{"Content-Type":"audio/mpeg"}});
};
function request(path,body,token,ip="test-client") {
  const headers={Origin:origin,"CF-Connecting-IP":ip};
  if(token) headers.Authorization="Bearer "+token;
  if(body && !(body instanceof FormData)) headers["Content-Type"]="application/json";
  return new Request("https://voice.example"+path,{method:body===undefined?"GET":"POST",headers,
    body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body)});
}
async function token(ip) {
  const r=await worker.fetch(request("/voice/session",{},null,ip),env,context);
  assert.equal(r.status,200);return (await r.json()).token;
}

test("health exposes readiness without leaking keys and blocks unapproved origins",async()=>{
  const response=await worker.fetch(request("/voice/config"),env,context);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"),origin);
  const body=await response.text();assert.equal(JSON.parse(body).configured,true);assert.ok(!body.includes(env.ELEVENLABS_API_KEY));
  const blocked=await worker.fetch(new Request("https://voice.example/voice/config",{headers:{Origin:"https://other.example"}}),env,context);
  assert.equal(blocked.status,403);
  const missing=await worker.fetch(request("/voice/session",{}),{},context);
  assert.equal(missing.status,503);
});
test("sessions bind requests to their origin and IP, reject tampering",async()=>{
  const auth=await token("auth-client");
  const bad=await worker.fetch(request("/api/tts",{text:phrase},auth+"x","auth-client"),env,context);
  assert.equal(bad.status,401);
  const otherIp=await worker.fetch(request("/api/tts",{text:phrase},auth,"different-client"),env,context);
  assert.equal(otherIp.status,401);
});
test("male and female TTS use the correct backend-only credentials and audio responses",async()=>{
  const auth=await token("tts-client");
  for(const [gender,voice] of [["m","test-male"],["f","test-female"]]) {
    const response=await worker.fetch(request("/api/tts",{text:phrase,gender},auth,"tts-client"),env,context);
    assert.equal(response.status,200);assert.equal(response.headers.get("X-Voice-Provider"),"elevenlabs");
    assert.equal(response.headers.get("Content-Type"),"audio/mpeg");assert.ok((await response.arrayBuffer()).byteLength>0);
    const sent=upstream.at(-1);assert.ok(sent.url.includes(voice));assert.equal(sent.options.headers["xi-api-key"],env.ELEVENLABS_API_KEY);
    assert.equal(JSON.parse(sent.options.body).model_id,"eleven_multilingual_v2");
  }
});
test("arbitrary text never consumes ElevenLabs credits",async()=>{
  const auth=await token("bad-text-client"),count=upstream.length;
  const response=await worker.fetch(request("/api/tts",{text:"arbitrary open TTS request"},auth,"bad-text-client"),env,context);
  assert.equal(response.status,400);assert.equal(upstream.length,count);
});
test("Arabic microphone upload reaches Scribe and oversized files are rejected",async()=>{
  const auth=await token("stt-client"),form=new FormData();
  form.append("file",new Blob([new Uint8Array([1,2,3])],{type:"audio/webm"}),"speech.webm");
  const response=await worker.fetch(request("/api/stt",form,auth,"stt-client"),env,context);
  assert.equal(response.status,200);assert.equal((await response.json()).provider,"elevenlabs");
  const sent=upstream.at(-1);assert.equal(sent.options.body.get("model_id"),"scribe_v2");assert.equal(sent.options.body.get("language_code"),"ara");
  const large=new FormData();large.append("file",new Blob([new Uint8Array(1024*1024+1)],{type:"audio/webm"}),"speech.webm");
  assert.equal((await worker.fetch(request("/api/stt",large,auth,"stt-client"),env,context)).status,413);
});
test("every client dialogue combination is present in the approved speech catalog",async()=>{
  const catalog=new Set(JSON.parse(await fs.readFile(new URL("../worker/speech-catalog.json",import.meta.url))));
  const rules=JSON.parse(await fs.readFile(new URL("../../churn-desk/web/data/rules.json",import.meta.url)));
  const fallback="وش يضمن لي؟ وضّح لي الشروط.";
  for(const left of rules.SOFTEN) for(const right of [...Object.values(rules.ASKED),...rules.INTERESTED,fallback]) assert.ok(catalog.has(left+" "+right));
});
