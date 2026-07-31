import assert from "node:assert/strict";
import test from "node:test";
import { allComposeArgs, composeArgs, upstreamCatalog, upstreamFallback, upstreamNames } from "./stack.mjs";

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
    assert.deepEqual(composeFiles("compare", true, true).slice(-2), ["local-compare.yml", "monitoring.yml"]);
});

test("--local 을 주지 않으면 합성이 그대로다", () => {
    assert.deepEqual(composeFiles("compare", false, false), composeFiles("compare"));
    assert.equal(composeFiles("ts").includes("local-ts.yml"), false);
});

test("정리가 자격 오버레이까지 아는 합성을 쓴다", () => {
    const files = allComposeArgs().map((value) => value.split("/").at(-1));
    assert.equal(files.includes("local-ts.yml"), true);
    assert.equal(files.includes("local-compare.yml"), true);
});
