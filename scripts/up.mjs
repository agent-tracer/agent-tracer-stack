import { spawnSync } from "node:child_process";
import {
    applyGatewayProfile,
    applyMonitoringProfile,
    composeArgs,
    missingImages,
    parseProfile,
    parseStack,
    projectArgs,
    stackEnv,
} from "./stack.mjs";
import { loadRunner } from "./profile.runner.mjs";

const profile = parseProfile(process.argv, "tracer");

// 자기 실행체를 갖는 프로파일은 합성도 이미지도 쓰지 않으므로 도커를 부르기 전에 갈라진다.
const runner = await loadRunner(profile);
if (runner !== null) process.exit(runner.up());

const stack = parseStack(process.argv);
const monitoring = process.argv.includes("--monitoring");
const local = process.argv.includes("--local");
const environment = stackEnv(stack);
// 프로파일과 자격 오버레이가 성립하는지는 이미지를 세기 전에 드러나야 한다.
const files = composeArgs(profile, monitoring, local);

// 이 저장소는 이미지를 만들지 않으므로 없는 참조는 레지스트리 오류가 아니라 만드는 저장소의 이름으로 알린다.
const absent = missingImages(environment, (reference) =>
    spawnSync("docker", ["image", "inspect", reference], { stdio: "ignore" }).status === 0,
);
if (absent.length > 0) {
    console.error("로컬에 없는 이미지가 있다. 만드는 저장소에서 빌드한 뒤 다시 실행한다.");
    for (const { reference, source } of absent) console.error(`  ${reference} — ${source}`);
    process.exit(1);
}

applyGatewayProfile(profile, stack);
applyMonitoringProfile(profile, stack);

const ONE_SHOTS = ["migrate", "connect-init", "redpanda-init"];

function compose(stdio, ...args) {
    return spawnSync(
        "docker",
        ["compose", ...projectArgs(stack), ...files, ...args],
        { stdio, env: { ...process.env, ...environment } },
    );
}

/** 커넥터 선언 원샷은 connect 가 응답할 때까지 기다리므로 up 이 돌아온 뒤에도 한동안 돈다. */
const ONE_SHOT_TIMEOUT_MS = 240_000;

function listContainers() {
    const listed = compose("pipe", "ps", "--all", "--format", "json");
    if (listed.status !== 0) return null;
    return listed.stdout
        .toString()
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
}

/** 이미 끝난 컨테이너를 compose wait 가 부재로 읽으므로 종료를 직접 기다리고 코드를 읽는다. */
function failedOneShots() {
    const deadline = Date.now() + ONE_SHOT_TIMEOUT_MS;
    for (;;) {
        const rows = listContainers();
        if (rows === null) return ONE_SHOTS;
        const states = ONE_SHOTS.map((service) => ({
            service,
            row: rows.find((entry) => entry.Service === service),
        }));
        const pending = states.filter(({ row }) => row === undefined || row.State !== "exited");
        if (pending.length === 0) {
            return states.filter(({ row }) => row.ExitCode !== 0).map(({ service }) => service);
        }
        if (Date.now() >= deadline) return pending.map(({ service }) => service);
        spawnSync("sleep", ["3"]);
    }
}

// 프로파일이 고르지 않은 컨테이너가 남으면 게이트웨이 뒤에 앞 프로파일의 파드가 그대로 응답한다.
const up = compose("inherit", "up", "-d", "--remove-orphans");

if (up.status === 0) {
    // nginx는 include를 설정을 읽을 때만 훑으므로 선언을 바꾸면 다시 읽혀야 한다.
    compose("ignore", "exec", "-T", "gateway", "nginx", "-s", "reload");

    const failed = failedOneShots();
    if (failed.length > 0) console.warn(`원샷 컨테이너가 정상으로 끝나지 않았다: ${failed.join(" · ")}`);
}

process.exit(up.status ?? 1);
