import assert from "node:assert/strict";
import test from "node:test";
import {
    allComposeArgs,
    composeArgs,
    composeServices,
    gatewayDeclarations,
    parseStack,
    projectArgs,
    PROFILES,
    publishedPorts,
    requiredVariables,
    scrapeDeclarations,
    scrapeTargets,
    requiredVariablesIn,
    stackEnv,
    teardownEnv,
    TEARDOWN_PLACEHOLDER,
    stackProject,
    upstreamCatalog,
    upstreamFallback,
    upstreamNames,
} from "./stack.mjs";

const composeFiles = (...args) =>
    composeArgs(...args)
        .filter((value) => value !== "-f")
        .map((value) => value.split("/").at(-1));

const COMPARE = `# 주석은 선언이 아니다\nts      http://agent-api-ts:3904;\npython  http://agent-api-python:8800;\ndefault ambiguous;\n`;
const SINGLE = `ts      http://agent-api:3904;\ndefault http://agent-api:3904;\n`;

test("상류 선언에서 이름만 읽는다", () => {
    assert.deepEqual(upstreamNames(COMPARE), ["ts", "python"]);
    assert.deepEqual(upstreamNames(SINGLE), ["ts"]);
});

test("파라미터 없는 요청이 향하는 곳을 읽는다", () => {
    assert.equal(upstreamFallback(COMPARE), "ambiguous");
    assert.equal(upstreamFallback(SINGLE), "http://agent-api:3904");
});

test("목록 창구의 본문이 선언한 이름을 순서대로 담는다", () => {
    assert.equal(
        upstreamCatalog(COMPARE),
        `default '{"ok":true,"data":{"upstreams":[{"name":"ts"},{"name":"python"}]}}';\n`,
    );
    assert.equal(
        upstreamCatalog(SINGLE),
        `default '{"ok":true,"data":{"upstreams":[{"name":"ts"}]}}';\n`,
    );
});

test("사용자 자격 오버레이가 프로파일마다 다른 파드 이름을 덮는다", () => {
    assert.deepEqual(composeFiles("ts", false, true).at(-1), "local-ts.yml");
    assert.deepEqual(composeFiles("compare", false, true).at(-1), "local-compare.yml");
});

test("자격을 쓸 수 없는 프로파일에서 --local 을 거절한다", () => {
    assert.throws(() => composeArgs("tracer", false, true), /--local/);
    assert.throws(() => composeArgs("python", false, true), /--local/);
});

test("계측을 자격 오버레이보다 뒤에 겹친다", () => {
    assert.deepEqual(composeFiles("compare", true, true).slice(-3), [
        "local-compare.yml", "monitoring.yml", "monitoring-agent.yml",
    ]);
});

test("에이전트 축이 없는 프로파일에는 에이전트 감시를 겹치지 않는다", () => {
    assert.deepEqual(composeFiles("tracer", true).slice(-1), ["monitoring.yml"]);
    assert.equal(composeFiles("tracer", true).includes("monitoring-agent.yml"), false);
});

test("에이전트 축이 있는 프로파일에는 에이전트 감시를 함께 겹친다", () => {
    for (const profile of ["ts", "python", "compare"]) {
        assert.deepEqual(composeFiles(profile, true).slice(-2), ["monitoring.yml", "monitoring-agent.yml"]);
    }
});

test("--local 을 주지 않으면 합성이 그대로다", () => {
    assert.deepEqual(composeFiles("compare", false, false), composeFiles("compare"));
    assert.equal(composeFiles("ts").includes("local-ts.yml"), false);
});

test("이름을 적지 않으면 프로젝트와 포트와 태그가 선언 그대로다", () => {
    const stack = parseStack(["node", "scripts/up.mjs", "--profile", "tracer"]);
    assert.equal(stack, null);
    assert.deepEqual(projectArgs(stack), ["-p", "agent-tracer"]);
    const env = stackEnv(stack);
    assert.equal(env.AGENT_TRACER_GATEWAY_IMAGE, "agent-tracer/gateway:latest");
    assert.equal(env.GATEWAY_PUBLISHED_PORT, undefined);
});

test("스택 이름이 프로젝트를 옮긴다", () => {
    const stack = parseStack(["node", "scripts/up.mjs", "--stack", "b"]);
    assert.equal(stack, "b");
    assert.equal(stackProject(stack), "agent-tracer-b");
    assert.deepEqual(projectArgs(stack), ["-p", "agent-tracer-b"]);
});

test("선언되지 않은 스택 이름을 거절한다", () => {
    for (const name of ["c", "B", "agent tracer", "../b", undefined]) {
        assert.throws(() => parseStack(["node", "scripts/up.mjs", "--stack", name]), /--stack/);
    }
});

test("스택이 공개 포트를 오프셋만큼 옮기고 바인드 주소를 지킨다", () => {
    const env = stackEnv("b");
    assert.equal(env.GATEWAY_PUBLISHED_PORT, "127.0.0.1:3947");
    assert.equal(env.EVENT_DB_PUBLISHED_PORT, "5532");
    assert.equal(env.TEMPORAL_PUBLISHED_PORT, "7333");
    assert.equal(env.GRAFANA_PUBLISHED_PORT, "127.0.0.1:3100");
});

test("공개 포트를 여는 선언 전부가 스택을 따라 옮겨진다", () => {
    const env = stackEnv("b");
    for (const variable of publishedPorts().keys()) {
        assert.equal(typeof env[variable], "string", `${variable}가 옮겨지지 않았다`);
    }
    assert.equal(publishedPorts().has("GATEWAY_PUBLISHED_PORT"), true);
});

test("스택이 이미지 태그를 갈라 빌드가 서로를 덮지 않는다", () => {
    const env = stackEnv("b");
    assert.equal(env.AGENT_TRACER_GATEWAY_IMAGE, "agent-tracer/gateway:latest-b");
    assert.equal(env.TRACER_AGENT_PYTHON_IMAGE, "tracer-agent-python:latest-b");
});

test("게이트웨이 선언이 스택마다 다른 자리에 놓인다", () => {
    assert.equal(gatewayDeclarations(null).endsWith("gateway/stacks/agent-tracer"), true);
    assert.equal(gatewayDeclarations("b").endsWith("gateway/stacks/agent-tracer-b"), true);
    assert.equal(stackEnv("b").GATEWAY_DECLARATIONS, gatewayDeclarations("b"));
});

test("기동이 값을 요구하는 변수를 합성 선언에서 읽는다", () => {
    const declaration = `      GF_SECURITY_ADMIN_PASSWORD: \${GRAFANA_ADMIN_PASSWORD:?암호를 배포가 정한다}\n      PORT: \${SOME_PORT:-3000}\n`;
    assert.deepEqual(requiredVariablesIn(declaration), ["GRAFANA_ADMIN_PASSWORD"]);
    assert.deepEqual(requiredVariablesIn("이 선언에는 요구가 없다"), []);
});

test("내리는 길이 기동의 요구를 그대로 받지 않는다", () => {
    const environment = teardownEnv(null);
    for (const variable of requiredVariables()) {
        assert.equal(
            typeof environment[variable] === "string" && environment[variable].length > 0,
            true,
            `${variable}가 채워지지 않아 내리는 길이 막힌다`,
        );
    }
});

test("내리는 길이 요구된 변수의 자리를 채운다", () => {
    const environment = teardownEnv(null, ["GRAFANA_ADMIN_PASSWORD"]);
    assert.equal(environment.GRAFANA_ADMIN_PASSWORD, TEARDOWN_PLACEHOLDER);
    assert.equal(environment.AGENT_TRACER_GATEWAY_IMAGE, "agent-tracer/gateway:latest");
});

test("내리는 길이 배포가 준 값을 자리표시자로 덮지 않는다", () => {
    process.env.GRAFANA_ADMIN_PASSWORD = "배포가 준 값";
    try {
        assert.equal(teardownEnv(null, ["GRAFANA_ADMIN_PASSWORD"]).GRAFANA_ADMIN_PASSWORD, "배포가 준 값");
    } finally {
        delete process.env.GRAFANA_ADMIN_PASSWORD;
    }
});

test("정리가 자격 오버레이까지 아는 합성을 쓴다", () => {
    const files = allComposeArgs().map((value) => value.split("/").at(-1));
    assert.equal(files.includes("local-ts.yml"), true);
    assert.equal(files.includes("local-compare.yml"), true);
});

test("추적 축만 세운 프로파일은 에이전트 대상을 부르지 않는다", () => {
    const targets = scrapeTargets("tracer");
    assert.deepEqual(targets["temporal-sdk"], []);
    assert.deepEqual(targets.temporal, []);
    assert.deepEqual(targets.postgres.map((entry) => entry.labels.database), ["runtime", "tracer"]);
    assert.deepEqual(targets["sql-exporter"].map((entry) => entry.labels.database), ["runtime"]);
});

test("에이전트 축이 선 프로파일이 그 축의 대상을 함께 부른다", () => {
    for (const profile of ["ts", "python", "compare"]) {
        const targets = scrapeTargets(profile);
        assert.deepEqual(targets.temporal, [{ targets: ["temporal:9090"] }]);
        assert.equal(targets.postgres.length, 3);
        assert.equal(targets["sql-exporter"].length, 2);
    }
});

test("워커 지표 창구는 그것을 여는 축의 파드만 부른다", () => {
    assert.deepEqual(
        scrapeTargets("ts")["temporal-sdk"].map((entry) => entry.labels.service),
        ["agent-chat-worker", "agent-jobs-worker", "agent-generate-worker"],
    );
    assert.deepEqual(
        scrapeTargets("compare")["temporal-sdk"].map((entry) => entry.labels.service),
        ["agent-chat-worker-ts", "agent-jobs-worker-ts", "agent-generate-worker-ts"],
    );
    assert.deepEqual(scrapeTargets("python")["temporal-sdk"], []);
});

test("스크레이프 대상이 모두 그 프로파일이 세우는 파드다", () => {
    for (const profile of Object.keys(PROFILES)) {
        const services = composeServices(profile);
        for (const [job, entries] of Object.entries(scrapeTargets(profile))) {
            for (const entry of entries) {
                for (const target of entry.targets) {
                    const [host] = target.split(":");
                    assert.equal(services.has(host), true, `${profile}의 ${job}이 없는 파드 ${host}를 부른다`);
                }
            }
        }
    }
});

test("대상 목록이 스택마다 다른 자리에 놓인다", () => {
    assert.equal(scrapeDeclarations(null).endsWith("monitoring/stacks/agent-tracer/targets"), true);
    assert.equal(scrapeDeclarations("b").endsWith("monitoring/stacks/agent-tracer-b/targets"), true);
    assert.equal(stackEnv("b").PROMETHEUS_TARGETS, scrapeDeclarations("b"));
});

test("선언되지 않은 프로파일의 대상을 만들지 않는다", () => {
    assert.throws(() => scrapeTargets("없는프로파일"), /알 수 없는 프로파일/);
});
