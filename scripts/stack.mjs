import { readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 나란히 세울 수 있는 스택의 이름과 그 스택이 공개 포트에 더하는 값이다. */
const STACKS = { b: 100 };

/** 이름을 적지 않은 호출이 쓰는 프로젝트이며 포트와 태그가 선언된 기본값 그대로다. */
const PROJECT = "agent-tracer";

/** 스택 이름은 선언된 것만 받는다. 프로젝트 이름이 컨테이너 이름의 접두가 되므로 기동에서야 드러나면 늦다. */
export function parseStack(argv) {
    const index = argv.indexOf("--stack");
    if (index < 0) return null;
    const name = argv[index + 1];
    if (name === undefined || !Object.hasOwn(STACKS, name)) {
        throw new Error(`--stack 이 받는 이름은 ${Object.keys(STACKS).join(" · ")} 뿐이다`);
    }
    return name;
}

export function stackProject(stack) {
    return stack === null ? PROJECT : `${PROJECT}-${stack}`;
}

/** 프로젝트 이름은 -f 로 고른 합성의 name 선언을 이기므로 스택을 가르는 자리가 여기 하나다. */
export function projectArgs(stack) {
    return ["-p", stackProject(stack)];
}

/** 게이트웨이가 읽는 선언의 자리이며 스택마다 갈려야 나란히 선 스택이 서로의 상류를 덮지 않는다. */
export function gatewayDeclarations(stack) {
    return join(root, "gateway", "stacks", stackProject(stack));
}

/** 프로메테우스가 읽는 대상 목록의 자리이며 게이트웨이 선언과 같은 이유로 스택마다 갈린다. */
export function scrapeDeclarations(stack) {
    return join(root, "monitoring", "stacks", stackProject(stack), "targets");
}

const PUBLISHED_PORT = /\$\{([A-Z0-9_]+_PUBLISHED_PORT):-(?:([\d.]+):)?(\d+)\}/g;

/** 공개 포트의 기본값은 compose 선언이 갖는다. 스택은 그 값을 옮길 뿐 컨테이너 안쪽 포트는 두고 간다. */
export function publishedPorts() {
    const directory = join(root, "compose");
    const found = new Map();
    for (const file of readdirSync(directory)) {
        if (!file.endsWith(".yml")) continue;
        const text = readFileSync(join(directory, file), "utf8");
        for (const [, variable, address, port] of text.matchAll(PUBLISHED_PORT)) {
            found.set(variable, { address: address ?? null, port: Number(port) });
        }
    }
    return found;
}

const REQUIRED_VARIABLE = /\$\{([A-Z0-9_]+):\?/g;

/** 기동이 값을 요구하는 변수의 이름이며 선언한 자리는 compose 하나다. */
export function requiredVariablesIn(text) {
    return [...text.matchAll(REQUIRED_VARIABLE)].map(([, variable]) => variable);
}

export function requiredVariables() {
    const directory = join(root, "compose");
    const found = new Set();
    for (const file of readdirSync(directory)) {
        if (!file.endsWith(".yml")) continue;
        for (const variable of requiredVariablesIn(readFileSync(join(directory, file), "utf8"))) {
            found.add(variable);
        }
    }
    return found;
}

/** 내리는 길은 합성이 해석되기만 하면 되므로 기동이 요구하는 값을 요구하지 않는다. */
export const TEARDOWN_PLACEHOLDER = "unused-on-teardown";

export function teardownEnv(stack, required = requiredVariables()) {
    const filled = [...required].map((variable) => [
        variable,
        process.env[variable] ?? TEARDOWN_PLACEHOLDER,
    ]);
    return { ...stackEnv(stack), ...Object.fromEntries(filled) };
}

/** compose 가 받는 값 전부이며 이미지 태그와 공개 포트와 선언 자리를 스택 하나가 함께 옮긴다. */
export function stackEnv(stack) {
    const versions = readVersions();
    const declarations = {
        GATEWAY_DECLARATIONS: gatewayDeclarations(stack),
        PROMETHEUS_TARGETS: scrapeDeclarations(stack),
    };
    if (stack === null) return { ...versions, ...declarations };

    const offset = STACKS[stack];
    const images = Object.entries(versions).map(([key, reference]) => [key, `${reference}-${stack}`]);
    const ports = [...publishedPorts()].map(([key, { address, port }]) => [
        key,
        address === null ? `${port + offset}` : `${address}:${port + offset}`,
    ]);
    return { ...Object.fromEntries(images), ...Object.fromEntries(ports), ...declarations };
}

/** 프로파일이 고르는 compose 파일 목록이며 앞에서 뒤로 겹친다. */
export const PROFILES = {
    tracer: ["tracer.yml"],
    ts: ["tracer.yml", "agent-infra.yml", "agent-ts.yml", "agent-web.yml"],
    python: ["tracer.yml", "agent-infra.yml", "agent-python.yml", "agent-web.yml"],
    compare: ["tracer.yml", "agent-infra.yml", "compare.yml", "agent-web.yml"],
};

/** 계측 오버레이는 프로파일 위에 겹치며 에이전트 조각은 그 축이 있는 프로파일에만 겹친다. */
const MONITORING = "monitoring.yml";
const AGENT_MONITORING = "monitoring-agent.yml";

/** 감시가 에이전트 축의 파드와 데이터베이스를 함께 보는 프로파일이다. */
const MONITORS_AGENT = new Set(["ts", "python", "compare"]);

function monitoringFiles(profile) {
    return MONITORS_AGENT.has(profile) ? [MONITORING, AGENT_MONITORING] : [MONITORING];
}

/** 사용자 구독 자격으로 TypeScript 축을 실행하는 오버레이이며 파드 이름이 프로파일마다 다르다. */
const LOCAL = { ts: "local-ts.yml", compare: "local-compare.yml" };

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
    const files = [...new Set([...Object.values(PROFILES).flat(), MONITORING, AGENT_MONITORING, ...Object.values(LOCAL)])];
    return files.flatMap((file) => ["-f", join(root, "compose", file)]);
}

/** 사용자 자격으로 실행할 수 있는 프로파일의 오버레이를 낸다. */
export function localOverlay(profile) {
    const file = LOCAL[profile];
    if (file === undefined) {
        throw new Error(
            `--local 은 ${Object.keys(LOCAL).join(" 과 ")} 에만 쓴다. ${profile} 에는 TypeScript 축이 없다`,
        );
    }
    return file;
}

export function composeArgs(profile, withMonitoring = false, withLocal = false) {
    const files = PROFILES[profile];
    if (files === undefined) {
        throw new Error(`알 수 없는 프로파일이다: ${profile}. 쓸 수 있는 것은 ${Object.keys(PROFILES).join(" · ")}`);
    }
    // 계측은 마지막에 겹쳐야 자격 오버레이가 지운 값을 되살리지 않는다.
    const selected = [...files, ...(withLocal ? [localOverlay(profile)] : []), ...(withMonitoring ? monitoringFiles(profile) : [])];
    return selected.flatMap((file) => ["-f", join(root, "compose", file)]);
}

const GENERATED = [".map", ".catalog", ".json"];

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
export function applyGatewayProfile(profile, stack = null) {
    const upstreams = join(gatewayDeclarations(stack), "upstreams.d");
    const remotes = join(gatewayDeclarations(stack), "remotes.d");
    clear(upstreams);
    clear(remotes);

    const source = UPSTREAMS[profile];
    if (source === null) return;

    const declaration = readFileSync(join(root, "gateway", "profiles", source), "utf8");
    writeFileSync(join(upstreams, "agent.map"), declaration);
    writeFileSync(join(upstreams, "agent.catalog"), upstreamCatalog(declaration));
    writeFileSync(join(remotes, "agent-web.map"), readFileSync(join(root, "gateway", "profiles", "agent-web.map")));
}

/** 워커 SDK 의 지표 창구를 여는 파드이며 축의 라벨은 워커가 직접 싣는다. */
const SDK_WORKERS = {
    tracer: [],
    ts: ["agent-chat-worker", "agent-jobs-worker", "agent-generate-worker"],
    python: ["agent-chat-worker", "agent-jobs-worker", "agent-generate-worker"],
    compare: [
        "agent-chat-worker-ts",
        "agent-jobs-worker-ts",
        "agent-generate-worker-ts",
        "agent-chat-worker-python",
        "agent-jobs-worker-python",
        "agent-generate-worker-python",
    ],
};

const SDK_METRICS_PORT = 9466;

/** 프로파일이 세우는 파드만 대상이 된다. 없는 파드를 부르면 경보가 늘 울려 아무도 보지 않는다. */
export function scrapeTargets(profile) {
    if (PROFILES[profile] === undefined) {
        throw new Error(`알 수 없는 프로파일이다: ${profile}. 쓸 수 있는 것은 ${Object.keys(PROFILES).join(" · ")}`);
    }
    const agent = MONITORS_AGENT.has(profile);
    return {
        "temporal-sdk": SDK_WORKERS[profile].map((service) => ({
            targets: [`${service}:${SDK_METRICS_PORT}`],
            labels: { service },
        })),
        temporal: agent ? [{ targets: ["temporal:9090"] }] : [],
        postgres: [
            { targets: ["postgres-exporter-event:9187"], labels: { database: "runtime" } },
            { targets: ["postgres-exporter-tracer:9187"], labels: { database: "tracer" } },
            ...(agent ? [{ targets: ["postgres-exporter-temporal:9187"], labels: { database: "temporal" } }] : []),
        ],
        "sql-exporter": [
            { targets: ["sql-exporter:9399"], labels: { database: "runtime" } },
            ...(agent ? [{ targets: ["sql-exporter-agent:9399"], labels: { database: "agent" } }] : []),
        ],
    };
}

const SERVICE_DECLARATION = /^ {2}([a-z][a-z0-9-]*):$/gm;

/** 프로파일과 계측 오버레이가 함께 세우는 파드의 이름이며 대상은 이 안에서만 나온다. */
export function composeServices(profile) {
    const files = [...PROFILES[profile], ...monitoringFiles(profile)];
    const found = new Set();
    for (const file of files) {
        const text = readFileSync(join(root, "compose", file), "utf8");
        const services = text.slice(text.indexOf("\nservices:"));
        for (const [, name] of services.matchAll(SERVICE_DECLARATION)) found.add(name);
    }
    return found;
}

/** 프로메테우스가 읽는 대상 목록을 프로파일에 맞춰 다시 쓴다. 대상이 없는 잡은 빈 목록을 갖는다. */
export function applyMonitoringProfile(profile, stack = null) {
    const directory = scrapeDeclarations(stack);
    clear(directory);
    for (const [job, targets] of Object.entries(scrapeTargets(profile))) {
        writeFileSync(join(directory, `${job}.json`), `${JSON.stringify(targets, null, 2)}\n`);
    }
}

export function parseProfile(argv, fallback) {
    const index = argv.indexOf("--profile");
    if (index >= 0 && argv[index + 1] !== undefined) return argv[index + 1];
    return fallback;
}
