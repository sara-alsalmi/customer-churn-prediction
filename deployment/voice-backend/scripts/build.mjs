import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = await fs.readFile(path.join(root, "worker/index.js"), "utf8");
const catalog = JSON.parse(await fs.readFile(path.join(root, "worker/speech-catalog.json"), "utf8"));
if (!catalog.length) throw Error("Speech catalog must not be empty");
await fs.rm(path.join(root, "dist"), {recursive:true, force:true});
await fs.mkdir(path.join(root, "dist/server"), {recursive:true});
await fs.mkdir(path.join(root, "dist/.openai"), {recursive:true});
await fs.writeFile(path.join(root, "dist/server/index.js"), source.replace("/* @SPEECH_CATALOG@ */ []", JSON.stringify(catalog)));
await fs.copyFile(path.join(root, ".openai/hosting.json"), path.join(root, "dist/.openai/hosting.json"));
console.log(`Built voice backend with ${catalog.length} approved scripted phrases`);
