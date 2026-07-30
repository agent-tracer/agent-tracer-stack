import assert from "node:assert/strict";
import test from "node:test";
import { upstreamCatalog, upstreamFallback, upstreamNames } from "./stack.mjs";

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
