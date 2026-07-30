import { readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 프로파일이 고르는 compose 파일 목록이며 앞에서 뒤로 겹친다. */
export const PROFILES = {
    tracer: ["tracer.yml"],
    ts: ["tracer.yml", "agent-infra.yml", "agent-ts.yml", "agent-web.yml"],
    python: ["tracer.yml", "agent-infra.yml", "agent-python.yml", "agent-web.yml"],
    compare: ["tracer.yml", "agent-infra.yml", "compare.yml", "agent-web.yml"],
};

/** 계측 오버레이는 프로파일 위에 겹친다. */
const MONITORING = "monitoring.yml";

/** 프로파일마다 게이트웨이가 읽을 상류 선언이 다르다. */
const UPSTREAMS = { tracer: null, ts: "ts.map", python: "python.map", compare: "compare.map" };

/** 프로파일이 게이트웨이에 얹을 상류 선언의 원본이며 에이전트가 없는 프로파일은 null이다. */
export function gatewayUpstreamSource(profile) {
    return UPSTREAMS[profile] ?? null;
}

export function readVersions() {
    const text = readFileSync(join(root, "versions.lock"), "utf8");
    const entries = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) => line.split("="));
    return Object.fromEntries(entries);
}

/** 프로파일과 무관하게 이 저장소가 아는 합성 전부이며 기동이 아니라 정리가 쓴다. */
export function allComposeArgs() {
    const files = [...new Set([...Object.values(PROFILES).flat(), MONITORING])];
    return files.flatMap((file) => ["-f", join(root, "compose", file)]);
}

export function composeArgs(profile, withMonitoring = false) {
    const files = PROFILES[profile];
    if (files === undefined) {
        throw new Error(`알 수 없는 프로파일이다: ${profile}. 쓸 수 있는 것은 ${Object.keys(PROFILES).join(" · ")}`);
    }
    const selected = withMonitoring ? [...files, MONITORING] : files;
    return selected.flatMap((file) => ["-f", join(root, "compose", file)]);
}

const GENERATED = [".map", ".catalog"];

function clear(directory) {
    mkdirSync(directory, { recursive: true });
    for (const name of readdirSync(directory)) {
        if (GENERATED.some((suffix) => name.endsWith(suffix))) rmSync(join(directory, name));
    }
}

function declarationEntries(text) {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .map((line) => line.replace(/;$/, "").split(/\s+/));
}

/** 선언이 이름 붙여 세운 상류이며 목록 창구가 화면에 알려주는 것이 이 이름들이다. */
export function upstreamNames(text) {
    return declarationEntries(text)
        .filter(([key]) => key !== "default")
        .map(([key]) => key);
}

/** 파라미터 없는 요청이 향하는 곳이며 상류가 둘 이상이면 ambiguous 여야 한다. */
export function upstreamFallback(text) {
    const entry = declarationEntries(text).find(([key]) => key === "default");
    return entry?.[1] ?? null;
}

/** 게이트웨이가 목록 창구에서 그대로 돌려주는 본문이며 선언한 이름만 담는다. */
export function upstreamCatalog(text) {
    const items = upstreamNames(text).map((name) => `{"name":"${name}"}`);
    return `default '{"ok":true,"data":{"upstreams":[${items.join(",")}]}}';\n`;
}

/** 게이트웨이가 읽는 선언을 프로파일에 맞춰 다시 쓴다. 에이전트가 없으면 비워 둔다. */
export function applyGatewayProfile(profile) {
    const upstreams = join(root, "gateway", "upstreams.d");
    const remotes = join(root, "gateway", "remotes.d");
    clear(upstreams);
    clear(remotes);

    const source = UPSTREAMS[profile];
    if (source === null) return;

    const declaration = readFileSync(join(root, "gateway", "profiles", source), "utf8");
    writeFileSync(join(upstreams, "agent.map"), declaration);
    writeFileSync(join(upstreams, "agent.catalog"), upstreamCatalog(declaration));
    writeFileSync(join(remotes, "agent-web.map"), readFileSync(join(root, "gateway", "profiles", "agent-web.map")));
}

export function parseProfile(argv, fallback) {
    const index = argv.indexOf("--profile");
    if (index >= 0 && argv[index + 1] !== undefined) return argv[index + 1];
    return fallback;
}
