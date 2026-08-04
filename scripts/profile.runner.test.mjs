import assert from "node:assert/strict";
import { basename, dirname } from "node:path";
import { describe, it } from "node:test";
import { RUNNER_DIR, runnerPath } from "./profile.runner.mjs";

describe("프로파일 실행체 해석", () => {
    it("실행체 파일이 있으면 그 경로를 낸다", () => {
        const found = runnerPath("sqlite", (file) => basename(file) === "sqlite.mjs");

        assert.equal(basename(found), "sqlite.mjs");
        assert.equal(dirname(found), RUNNER_DIR);
    });

    it("실행체가 없는 프로파일은 합성으로 넘긴다", () => {
        assert.equal(runnerPath("tracer", () => false), null);
        assert.equal(runnerPath("compare", () => false), null);
    });

    it("이름이 경로로 새면 받지 않는다", () => {
        assert.equal(runnerPath("../stack", () => true), null);
        assert.equal(runnerPath("a/b", () => true), null);
        assert.equal(runnerPath("", () => true), null);
        assert.equal(runnerPath("-dash", () => true), null);
    });

    it("문자열이 아닌 이름도 받지 않는다", () => {
        assert.equal(runnerPath(undefined, () => true), null);
        assert.equal(runnerPath(null, () => true), null);
    });
});
