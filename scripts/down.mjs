import { spawnSync } from "node:child_process";
import { allComposeArgs, parseStack, projectArgs, stackEnv } from "./stack.mjs";

// 어느 프로파일로 띄웠든 합성 전부를 걷어야 프로파일 밖의 파드와 볼륨이 남지 않는다.
const purge = process.argv.includes("--volumes");
const stack = parseStack(process.argv);

const result = spawnSync(
    "docker",
    ["compose", ...projectArgs(stack), ...allComposeArgs(), "down", "--remove-orphans", ...(purge ? ["--volumes"] : [])],
    { stdio: "inherit", env: { ...process.env, ...stackEnv(stack) } },
);

process.exit(result.status ?? 1);
