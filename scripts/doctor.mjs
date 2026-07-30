import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composeArgs, gatewayUpstreamSource, parseProfile, readVersions } from "./stack.mjs";

const profile = parseProfile(process.argv, "tracer");
const monitoring = process.argv.includes("--monitoring");
const versions = readVersions();
// 이미지를 만들지 않는 자리에서도 합성과 선언은 검사할 수 있다.
const skipImages = process.argv.includes("--skip-images");
let failed = 0;

function report(ok, message) {
    console.log(`${ok ? "통과" : "실패"}  ${message}`);
    if (!ok) failed += 1;
}

// 태그가 가리키는 이미지가 실제로 있어야 합성이 뜬다.
if (!skipImages) {
    for (const [key, reference] of Object.entries(versions)) {
        const found = spawnSync("docker", ["image", "inspect", reference], { stdio: "ignore" }).status === 0;
        report(found, `${key} = ${reference}`);
    }
}

const config = spawnSync(
    "docker",
    ["compose", ...composeArgs(profile, monitoring), "config", "-q"],
    { encoding: "utf8", env: { ...process.env, ...versions } },
);
report(config.status === 0, `프로파일 ${profile}의 합성이 유효하다`);
if (config.status !== 0) console.error(config.stderr);

// 얹힌 선언은 기동이 프로파일에 맞춰 다시 쓰므로, 진단은 이 프로파일이 얹을 원본이 있는지를 본다.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = gatewayUpstreamSource(profile);
report(
    source === null || existsSync(join(root, "gateway/profiles", source)),
    source === null ? `프로파일 ${profile}은 에이전트 상류를 얹지 않는다` : `프로파일 ${profile}의 에이전트 상류 선언이 있다`,
);

process.exit(failed === 0 ? 0 : 1);
