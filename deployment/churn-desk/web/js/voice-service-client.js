// Only the public backend URL belongs in browser code; the API key never does.
export const VOICE_BACKEND = "https://churn-desk-ae1.majedx10.chatgpt.site";
let configPromise, sessionPromise;

export function getVoiceConfig() {
  configPromise ||= fetch(VOICE_BACKEND+"/voice/config", {signal:AbortSignal.timeout(4000),credentials:"omit"})
    .then(async (response) => {
      if (!response.ok) throw Error("Voice service unavailable");
      const config=await response.json();
      return {voice:config.configured ? "elevenlabs" : "browser", voice_status:config.configured ? "ready" : "not_configured"};
    }).catch(() => ({voice:"browser",voice_status:"backend_unavailable"}));
  return configPromise;
}

async function session() {
  sessionPromise ||= fetch(VOICE_BACKEND+"/voice/session", {method:"POST",credentials:"omit"})
    .then(async (response) => {
      if (!response.ok) throw Error("Voice session unavailable");
      const data=await response.json();
      return {...data,expires:Date.now()+data.expires_in*1000-15000};
    }).catch((error) => {sessionPromise=null;throw error;});
  const current=await sessionPromise;
  if (current.expires<Date.now()) {sessionPromise=null;return session();}
  return current;
}

export async function remoteVoiceRequest(path, body, retried=false) {
  const auth=await session();
  const form=body instanceof FormData;
  const headers={Authorization:"Bearer "+auth.token};
  if (!form) headers["Content-Type"]="application/json";
  const response=await fetch(VOICE_BACKEND+path,{method:"POST",credentials:"omit",headers,
    body:form ? body : JSON.stringify(body),signal:AbortSignal.timeout(path==="/api/stt" ? 65000 : 35000)});
  if (response.status===401 && !retried) {sessionPromise=null;return remoteVoiceRequest(path,body,true);}
  if (!response.ok) throw Error(`Voice request failed (${response.status})`);
  return path==="/api/stt" ? response.json() : response;
}
