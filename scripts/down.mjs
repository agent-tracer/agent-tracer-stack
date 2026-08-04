import { spawnSync } from "node:child_process";
import { allComposeArgs, parseProfile, parseStack, projectArgs, teardownEnv } from "./stack.mjs";
import { loadRunner } from "./profile.runner.mjs";

// 어느 프로파일로 띄웠든 합성 전부를 걷어야 프로파일 밖의 파드와 볼륨이 남지 않는다.
const purge = process.argv.includes("--volumes");
const stack = parseStack(process.argv);

// 자기 실행체로 띄운 프로파일은 컨테이너가 아니라 그 실행체가 세운 것을 걷는다.
const runner = await loadRunner(parseProfile(process.argv, "tracer"));
if (runner !== null) process.exit(runner.down(purge));

const result = spawnSync(
    "docker",
    ["compose", ...projectArgs(stack), ...allComposeArgs(), "down", "--remove-orphans", ...(purge ? ["--volumes"] : [])],
    { stdio: "inherit", env: { ...process.env, ...teardownEnv(stack) } },
);

process.exit(result.status ?? 1);
