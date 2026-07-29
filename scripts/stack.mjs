import { readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 프로파일이 고르는 compose 파일 목록이며 앞에서 뒤로 겹친다. */
export const PROFILES = {
    tracer: ["tracer.yml"],
    ts: ["tracer.yml", "agent-infra.yml", "agent-ts.yml", "agent-web.yml"],
    python: ["tracer.yml", "agent-infra.yml", "agent-python.yml", "agent-web.yml"],
};

/** 계측 오버레이는 프로파일 위에 겹친다. */
const MONITORING = "monitoring.yml";

/** 프로파일마다 게이트웨이가 읽을 상류 선언이 다르다. */
const UPSTREAMS = { tracer: null, ts: "ts.map", python: "python.map" };

export function readVersions() {
    const text = readFileSync(join(root, "versions.lock"), "utf8");
    const entries = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) => line.split("="));
    return Object.fromEntries(entries);
}

export function composeArgs(profile, withMonitoring = false) {
    const files = PROFILES[profile];
    if (files === undefined) {
        throw new Error(`알 수 없는 프로파일이다: ${profile}. 쓸 수 있는 것은 ${Object.keys(PROFILES).join(" · ")}`);
    }
    const selected = withMonitoring ? [...files, MONITORING] : files;
    return selected.flatMap((file) => ["-f", join(root, "compose", file)]);
}

function clear(directory) {
    mkdirSync(directory, { recursive: true });
    for (const name of readdirSync(directory)) {
        if (name.endsWith(".map")) rmSync(join(directory, name));
    }
}

/** 게이트웨이가 읽는 선언을 프로파일에 맞춰 다시 쓴다. 에이전트가 없으면 비워 둔다. */
export function applyGatewayProfile(profile) {
    const upstreams = join(root, "gateway", "upstreams.d");
    const remotes = join(root, "gateway", "remotes.d");
    clear(upstreams);
    clear(remotes);

    const source = UPSTREAMS[profile];
    if (source === null) return;

    writeFileSync(join(upstreams, "agent.map"), readFileSync(join(root, "gateway", "profiles", source)));
    writeFileSync(join(remotes, "agent-web.map"), readFileSync(join(root, "gateway", "profiles", "agent-web.map")));
}

export function parseProfile(argv, fallback) {
    const index = argv.indexOf("--profile");
    if (index >= 0 && argv[index + 1] !== undefined) return argv[index + 1];
    return fallback;
}
