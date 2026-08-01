import { spawnSync } from "node:child_process";
import { applyGatewayProfile, composeArgs, parseStack, projectArgs, stackEnv } from "./stack.mjs";

const target = process.argv[2];
if (target !== "ts" && target !== "python") {
    console.error("교체할 구현체를 적어라: ts 또는 python");
    process.exit(1);
}
const other = target === "ts" ? "python" : "ts";
const stack = parseStack(process.argv);
const env = { ...process.env, ...stackEnv(stack) };

function compose(profile, ...args) {
    return spawnSync(
        "docker",
        ["compose", ...projectArgs(stack), ...composeArgs(profile), ...args],
        { stdio: "inherit", env },
    );
}

// 데이터베이스와 큐는 그대로 두고 에이전트 파드만 내린다. 이력이 구현체를 넘어 이어진다.
const services = ["agent-api", "agent-chat-worker", "agent-jobs-worker", "agent-generate-worker"];
compose(other, "rm", "-sf", ...services);

applyGatewayProfile(target, stack);
const up = compose(target, "up", "-d");

// nginx는 include를 설정을 읽을 때만 훑으므로 선언을 바꾸면 다시 읽혀야 한다.
if (up.status === 0) compose(target, "exec", "-T", "gateway", "nginx", "-s", "reload");

if (up.status === 0) console.log(`구현체가 ${target}로 바뀌었다. 원장과 큐는 그대로다.`);

process.exit(up.status ?? 1);
