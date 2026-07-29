import { spawnSync } from "node:child_process";
import { applyGatewayProfile, composeArgs, parseProfile, readVersions } from "./stack.mjs";

const profile = parseProfile(process.argv, "tracer");
const monitoring = process.argv.includes("--monitoring");
applyGatewayProfile(profile);

// 원샷 컨테이너가 0으로 끝나는 것을 --wait 가 실패로 읽으므로 건강 상태를 직접 기다린다.
const result = spawnSync(
    "docker",
    ["compose", ...composeArgs(profile, monitoring), "up", "-d"],
    { stdio: "inherit", env: { ...process.env, ...readVersions() } },
);

process.exit(result.status ?? 1);

if (result.status === 0) {
    const wait = spawnSync(
        "docker",
        ["compose", ...composeArgs(profile, monitoring), "wait", "migrate", "connect-init", "redpanda-init"],
        { stdio: "ignore", env: { ...process.env, ...readVersions() } },
    );
    if (wait.status !== 0) console.warn("원샷 컨테이너가 정상으로 끝나지 않았다.");
}
