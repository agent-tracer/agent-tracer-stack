import { spawnSync } from "node:child_process";
import { applyGatewayProfile, composeArgs, parseProfile, readVersions } from "./stack.mjs";

const profile = parseProfile(process.argv, "tracer");
const monitoring = process.argv.includes("--monitoring");
applyGatewayProfile(profile);

function compose(stdio, ...args) {
    return spawnSync(
        "docker",
        ["compose", ...composeArgs(profile, monitoring), ...args],
        { stdio, env: { ...process.env, ...readVersions() } },
    );
}

// 프로파일이 고르지 않은 컨테이너가 남으면 게이트웨이 뒤에 앞 프로파일의 파드가 그대로 응답한다.
const up = compose("inherit", "up", "-d", "--remove-orphans");

if (up.status === 0) {
    // nginx는 include를 설정을 읽을 때만 훑으므로 선언을 바꾸면 다시 읽혀야 한다.
    compose("ignore", "exec", "-T", "gateway", "nginx", "-s", "reload");

    // 원샷 컨테이너가 0으로 끝나는 것을 --wait 가 실패로 읽으므로 건강 상태를 직접 기다린다.
    const wait = compose("ignore", "wait", "migrate", "connect-init", "redpanda-init");
    if (wait.status !== 0) console.warn("원샷 컨테이너가 정상으로 끝나지 않았다.");
}

process.exit(up.status ?? 1);
