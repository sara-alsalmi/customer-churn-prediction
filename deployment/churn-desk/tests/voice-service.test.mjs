import test from "node:test";
import assert from "node:assert/strict";
import {getVoiceConfig,remoteVoiceRequest,VOICE_BACKEND} from "../web/js/voice-service-client.js";

let tokens=0,tts=0;
const seen=[];
globalThis.fetch=async(url,options={})=>{
  seen.push({url,options});
  if(url.endsWith("/voice/config")) return new Response(JSON.stringify({configured:true}));
  if(url.endsWith("/voice/session")) return new Response(JSON.stringify({token:"token-"+(++tokens),expires_in:600}));
  if(url.endsWith("/api/tts")) {
    if(++tts===1) return new Response("expired",{status:401});
    return new Response(new Uint8Array([73,68,51]),{headers:{"Content-Type":"audio/mpeg"}});
  }
  if(url.endsWith("/api/stt")) return new Response(JSON.stringify({text:"مرحباً",provider:"elevenlabs"}));
  throw Error("Unexpected route");
};
test("public app discovers ElevenLabs and uses a renewable server-issued voice session",async()=>{
  assert.equal((await getVoiceConfig()).voice,"elevenlabs");
  const response=await remoteVoiceRequest("/api/tts",{text:"customer reply",gender:"m"});
  assert.equal(response.headers.get("Content-Type"),"audio/mpeg");
  assert.equal(tokens,2);
  const request=seen.filter((item)=>item.url.endsWith("/api/tts")).at(-1);
  assert.equal(request.options.headers.Authorization,"Bearer token-2");
  assert.equal(request.url,VOICE_BACKEND+"/api/tts");
  assert.ok(!JSON.stringify(seen).includes("xi-api-key"));
});
test("microphone transcription uses multipart uploads without forcing JSON content type",async()=>{
  const form=new FormData();form.set("file",new Blob(["sample"],{type:"audio/webm"}),"speech.webm");
  const response=await remoteVoiceRequest("/api/stt",form);
  assert.equal(response.provider,"elevenlabs");
  const request=seen.at(-1);
  assert.equal(request.options.body,form);
  assert.equal(request.options.headers["Content-Type"],undefined);
});
