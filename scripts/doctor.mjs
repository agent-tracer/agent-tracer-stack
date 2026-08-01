import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
    composeArgs,
    gatewayUpstreamSource,
    parseProfile,
    parseStack,
    projectArgs,
    readVersions,
    stackEnv,
    stackProject,
    upstreamFallback,
    upstreamNames,
} from "./stack.mjs";

const profile = parseProfile(process.argv, "tracer");
const stack = parseStack(process.argv);
const monitoring = process.argv.includes("--monitoring");
const local = process.argv.includes("--local");
const environment = stackEnv(stack);
// 이미지를 만들지 않는 자리에서도 합성과 선언은 검사할 수 있다.
const skipImages = process.argv.includes("--skip-images");
let failed = 0;

function report(ok, message) {
    console.log(`${ok ? "통과" : "실패"}  ${message}`);
    if (!ok) failed += 1;
}

// 태그가 가리키는 이미지가 실제로 있어야 합성이 뜬다.
if (!skipImages) {
    for (const key of Object.keys(readVersions())) {
        const reference = environment[key];
        const found = spawnSync("docker", ["image", "inspect", reference], { stdio: "ignore" }).status === 0;
        report(found, `${key} = ${reference}`);
    }
}

const config = spawnSync(
    "docker",
    ["compose", ...projectArgs(stack), ...composeArgs(profile, monitoring, local), "config", "-q"],
    { encoding: "utf8", env: { ...process.env, ...environment } },
);
report(config.status === 0, `프로파일 ${profile}의 합성이 ${stackProject(stack)}에서 유효하다`);
if (config.status !== 0) console.error(config.stderr);

// 얹힌 선언은 기동이 프로파일에 맞춰 다시 쓰므로, 진단은 이 프로파일이 얹을 원본이 있는지를 본다.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = gatewayUpstreamSource(profile);
const declared = source !== null && existsSync(join(root, "gateway/profiles", source));
report(
    source === null || declared,
    source === null ? `프로파일 ${profile}은 에이전트 상류를 얹지 않는다` : `프로파일 ${profile}의 에이전트 상류 선언이 있다`,
);

// 목록 창구가 선언에서 이름을 읽고, 상류가 둘 이상이면 파라미터 없는 요청을 거절해야 한다.
if (declared) {
    const declaration = readFileSync(join(root, "gateway/profiles", source), "utf8");
    const names = upstreamNames(declaration);
    report(names.length > 0, `프로파일 ${profile}의 상류가 이름을 갖는다: ${names.join(" · ")}`);
    const fallback = upstreamFallback(declaration);
    const ambiguous = fallback === "ambiguous";
    report(
        names.length > 1 ? ambiguous : !ambiguous && fallback !== null,
        names.length > 1
            ? `프로파일 ${profile}은 파라미터 없는 요청을 거절한다`
            : `프로파일 ${profile}은 파라미터와 무관하게 한 상류로 보낸다`,
    );
}

process.exit(failed === 0 ? 0 : 1);
