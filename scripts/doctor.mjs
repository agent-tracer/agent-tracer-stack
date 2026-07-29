import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composeArgs, parseProfile, readVersions } from "./stack.mjs";

const profile = parseProfile(process.argv, "tracer");
const monitoring = process.argv.includes("--monitoring");
const versions = readVersions();
let failed = 0;

function report(ok, message) {
    console.log(`${ok ? "통과" : "실패"}  ${message}`);
    if (!ok) failed += 1;
}

// 태그가 가리키는 이미지가 실제로 있어야 합성이 뜬다.
for (const [key, reference] of Object.entries(versions)) {
    const found = spawnSync("docker", ["image", "inspect", reference], { stdio: "ignore" }).status === 0;
    report(found, `${key} = ${reference}`);
}

const config = spawnSync(
    "docker",
    ["compose", ...composeArgs(profile, monitoring), "config", "-q"],
    { encoding: "utf8", env: { ...process.env, ...versions } },
);
report(config.status === 0, `프로파일 ${profile}의 합성이 유효하다`);
if (config.status !== 0) console.error(config.stderr);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const declared = existsSync(join(root, "gateway/upstreams.d/agent.map"));
const expectsAgent = profile !== "tracer";
report(declared === expectsAgent, expectsAgent ? "에이전트 상류가 선언되어 있다" : "에이전트 상류가 선언되어 있지 않다");

process.exit(failed === 0 ? 0 : 1);
