// 브로커도 조회 데이터베이스도 없는 합성이며 이미지를 만드는 저장소가 그 선언을 갖는다.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 다른 프로파일과 같은 프로젝트를 쓰므로 두 구성이 같은 자리에서 서로를 밀어낸다. */
const PROJECT = "agent-tracer";

/** 합성이 세우는 파드이며 상태 출력이 이 이름을 그대로 쓴다. */
const SERVICES = ["ingest-api", "tracer-api", "tracer-web", "gateway"];

/** 이 합성이 쓰는 이미지와 그것을 만드는 저장소다. */
const IMAGES = [
    "agent-tracer/ingest-api",
    "agent-tracer/tracer-local",
    "agent-tracer/web",
    "agent-tracer/gateway",
];
const IMAGE_SOURCE = "agent-tracer";

/** 애플리케이션 소스와 합성을 갖는 형제 저장소이며 clone 위치가 다르면 환경변수가 우선한다. */
export function tracerRepo() {
    const configured = process.env["AGENT_TRACER_REPO"];
    const candidate = configured ?? resolve(root, "..", "agent-tracer");
    if (!existsSync(join(candidate, "compose", "sqlite.yml"))) {
        throw new Error(
            `agent-tracer 저장소를 ${candidate} 에서 찾지 못했다. AGENT_TRACER_REPO 로 위치를 준다`,
        );
    }
    return candidate;
}

function composeFile() {
    return join(tracerRepo(), "compose", "sqlite.yml");
}

/** 두 데이터베이스 파일이 사는 호스트 디렉터리이며 파드가 이 자리를 함께 본다. */
export function dataDir() {
    return process.env["MONITOR_LOCAL_DIR"] ?? join(homedir(), ".agent-tracer", "local");
}

export function entryPort() {
    return Number(process.env["MONITOR_LOCAL_PORT"] ?? 3847);
}

function compose(stdio, ...args) {
    return spawnSync(
        "docker",
        ["compose", "-p", PROJECT, "-f", composeFile(), ...args],
        { stdio, env: { ...process.env, LOCAL_DATA_DIR: dataDir() } },
    );
}

function hasImage(reference) {
    return spawnSync("docker", ["image", "inspect", reference], { stdio: "ignore" }).status === 0;
}

function missingImages() {
    return IMAGES.filter((reference) => !hasImage(reference));
}

/** 지금 이 합성으로 떠 있는 파드의 이름을 낸다. */
export function running() {
    const listed = compose("pipe", "ps", "--services", "--filter", "status=running");
    if (listed.status !== 0) return [];
    return listed.stdout.toString().split("\n").map((line) => line.trim()).filter(Boolean);
}

/** 합성을 세우고 두 파드가 건강해질 때까지 기다린다. */
export function up() {
    const absent = missingImages();
    if (absent.length > 0) {
        console.error("로컬에 없는 이미지가 있다. 만드는 저장소에서 빌드한 뒤 다시 실행한다.");
        for (const reference of absent) console.error(`  ${reference} — ${IMAGE_SOURCE}`);
        return 1;
    }
    // 파드가 호스트 디렉터리를 그대로 보므로 자리를 먼저 만들어 둔다.
    mkdirSync(dataDir(), { recursive: true });

    const result = compose("inherit", "up", "-d", "--remove-orphans", "--wait");
    if (result.status !== 0) return result.status ?? 1;

    console.log(`sqlite 프로파일이 떴다. 진입점 http://127.0.0.1:${entryPort()}`);
    for (const service of running()) console.log(`  ${service}`);
    console.log(`  데이터 ${dataDir()}`);
    return 0;
}

/** 합성을 걷으며 데이터는 호스트 디렉터리에 남는다. */
export function down(purge) {
    if (purge) {
        console.error("--volumes 는 이 프로파일에 쓰지 않는다. 데이터는 호스트의 파일이다");
        console.error(`  ${dataDir()}`);
        console.error("지울 때는 그 디렉터리를 직접 지운다");
        return 1;
    }
    const result = compose("inherit", "down", "--remove-orphans");
    return result.status ?? 1;
}

/** 기동 전에 성립해야 하는 것만 검사하며 다른 프로파일의 상류와 계측은 보지 않는다. */
export function doctor(report) {
    let file;
    try {
        file = composeFile();
        report(true, `합성 = ${file}`);
    } catch (error) {
        report(false, error.message);
        return;
    }
    for (const reference of IMAGES) {
        report(hasImage(reference), `${reference}${hasImage(reference) ? "" : ` — ${IMAGE_SOURCE} 에서 빌드한다`}`);
    }
    const config = compose("pipe", "config", "--quiet");
    report(config.status === 0, "합성 선언이 유효하다");

    const live = running();
    if (live.length > 0) report(true, `이미 떠 있다: ${live.join(" · ")}`);
    else report(true, `세울 파드: ${SERVICES.join(" · ")}`);
    report(true, `데이터 디렉터리 = ${dataDir()}`);
}
