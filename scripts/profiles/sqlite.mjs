// 도커 없이 추적만 세우는 실행이며 합성도 이미지도 쓰지 않으므로 프로파일 분기를 여기서 갖는다.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 합성이 아니라 형제 저장소의 프로세스를 세우는 프로파일이다. */
export const SQLITE_PROFILE = "sqlite";

/** 기동이 세우는 프로세스이며 이름은 로그 파일과 상태 출력에 그대로 쓴다. */
const PROCESSES = [
    { name: "ingest-api", project: "services/ingest-api/tsconfig.json", entry: "services/ingest-api/src/main.ts" },
    { name: "tracer-local", project: "services/tracer-api/tsconfig.json", entry: "services/tracer-api/src/local.main.ts" },
];

const READY_TIMEOUT_MS = 60_000;
const READY_INTERVAL_MS = 500;

/** 애플리케이션 소스를 갖는 형제 저장소이며 clone 위치가 다르면 환경변수가 이긴다. */
export function tracerRepo() {
    const configured = process.env["AGENT_TRACER_REPO"];
    const candidate = configured ?? resolve(root, "..", "agent-tracer");
    if (!existsSync(join(candidate, "services", "tracer-api", "src", "local.main.ts"))) {
        throw new Error(
            `agent-tracer 저장소를 ${candidate} 에서 찾지 못했다. AGENT_TRACER_REPO 로 위치를 준다`,
        );
    }
    return candidate;
}

/** 원장과 조회 모델 파일이 사는 자리이며 기동과 상태와 정리가 모두 이 값을 본다. */
export function dataDir() {
    return process.env["MONITOR_LOCAL_DIR"] ?? join(homedir(), ".agent-tracer", "local");
}

function runtimeDir() {
    const directory = join(dataDir(), "run");
    mkdirSync(directory, { recursive: true });
    return directory;
}

function pidFile() {
    return join(runtimeDir(), "pids.json");
}

export function entryPort() {
    return Number(process.env["MONITOR_LOCAL_PORT"] ?? 3847);
}

function readPids() {
    const file = pidFile();
    if (!existsSync(file)) return [];
    try {
        const parsed = JSON.parse(readFileSync(file, "utf8"));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function alive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/** 띄워 둔 프로세스 가운데 아직 살아 있는 것만 낸다. */
export function running() {
    return readPids().filter((entry) => alive(entry.pid));
}

function waitForHealth(port) {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    for (;;) {
        const probe = spawnSync("curl", ["-sf", "-o", "/dev/null", `http://127.0.0.1:${port}/health`]);
        if (probe.status === 0) return true;
        if (Date.now() >= deadline) return false;
        spawnSync("sleep", [String(READY_INTERVAL_MS / 1000)]);
    }
}

function launch(repo, logDir) {
    return PROCESSES.map((entry) => {
        const out = openLog(join(logDir, `${entry.name}.log`));
        const child = spawn(
            process.execPath,
            ["--import", "@swc-node/register/esm-register", entry.entry],
            {
                cwd: repo,
                detached: true,
                stdio: ["ignore", out, out],
                env: {
                    ...process.env,
                    MONITOR_PROFILE: SQLITE_PROFILE,
                    SWC_NODE_PROJECT: join(repo, entry.project),
                },
            },
        );
        child.unref();
        return { name: entry.name, pid: child.pid };
    });
}

// 자식이 물려받을 기술자라 append 로 열어 재기동이 이전 기록을 지우지 않는다.
function openLog(path) {
    return openSync(path, "a");
}

/** sqlite 프로파일을 세우고 단일 진입점이 응답할 때까지 기다린다. */
export function up() {
    const repo = tracerRepo();
    const logDir = join(runtimeDir(), "logs");
    mkdirSync(logDir, { recursive: true });

    const already = running();
    if (already.length > 0) {
        console.error(`이미 떠 있다: ${already.map((entry) => `${entry.name}(${entry.pid})`).join(" · ")}`);
        console.error("먼저 node scripts/down.mjs --profile sqlite 를 실행한다");
        return 1;
    }

    const started = launch(repo, logDir);
    writeFileSync(pidFile(), JSON.stringify(started, null, 2));

    const port = entryPort();
    if (!waitForHealth(port)) {
        console.error(`진입점이 ${READY_TIMEOUT_MS / 1000}초 안에 응답하지 않았다. 로그를 본다: ${logDir}`);
        return 1;
    }

    console.log(`sqlite 프로파일이 떴다. 진입점 http://127.0.0.1:${port}`);
    for (const entry of started) console.log(`  ${entry.name} pid ${entry.pid}`);
    console.log(`  데이터 ${dataDir()}`);
    console.log(`  로그 ${logDir}`);
    return 0;
}

/** 띄워 둔 프로세스를 내리며 데이터 파일은 건드리지 않는다. */
export function down(purge) {
    if (purge) {
        console.error("--volumes 는 sqlite 프로파일에 쓰지 않는다. 데이터는 다음 경로의 파일이다");
        console.error(`  ${dataDir()}`);
        console.error("지울 때는 그 디렉터리를 직접 지운다");
        return 1;
    }
    const live = running();
    for (const entry of live) {
        try {
            process.kill(entry.pid, "SIGTERM");
            console.log(`내렸다: ${entry.name}(${entry.pid})`);
        } catch {
            console.warn(`이미 없다: ${entry.name}(${entry.pid})`);
        }
    }
    if (live.length === 0) console.log("떠 있는 sqlite 프로세스가 없다");
    rmSync(pidFile(), { force: true });
    return 0;
}

/** 기동 전에 성립해야 하는 것만 검사하며 도커와 이미지는 보지 않는다. */
export function doctor(report) {
    try {
        const repo = tracerRepo();
        report(true, `agent-tracer 저장소 = ${repo}`);
    } catch (error) {
        report(false, error.message);
    }
    const port = entryPort();
    const taken = spawnSync("curl", ["-sf", "-o", "/dev/null", `http://127.0.0.1:${port}/health`]).status === 0;
    const live = running();
    if (live.length > 0) {
        report(true, `sqlite 프로파일이 이미 떠 있다: ${live.map((entry) => entry.name).join(" · ")}`);
    } else {
        report(!taken, taken ? `진입점 ${port} 을 다른 프로세스가 쓰고 있다` : `진입점 ${port} 이 비어 있다`);
    }
    report(true, `데이터 디렉터리 = ${dataDir()}`);
}
