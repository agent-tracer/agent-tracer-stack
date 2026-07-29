import { spawnSync } from "node:child_process";
import { readVersions } from "./stack.mjs";

// 계약이 강제되는 자리는 각 구현체의 스위트뿐이며 여기서는 둘의 결과를 나란히 낸다.
const RUNNERS = [
    { name: "typescript", image: "TRACER_AGENT_TS_IMAGE", command: ["node", "contract/conformance/runner/verify.mjs"] },
    { name: "python", image: "TRACER_AGENT_PYTHON_IMAGE", command: ["python", "contract/conformance/runner/verify.py"] },
];

const versions = readVersions();
let failed = 0;

for (const runner of RUNNERS) {
    const reference = versions[runner.image];
    console.log(`\n=== ${runner.name} · ${reference} ===`);
    const result = spawnSync("docker", ["run", "--rm", reference, ...runner.command], { stdio: "inherit" });
    if (result.status !== 0) failed += 1;
}

console.log(failed === 0 ? "\n두 구현체가 계약을 만족한다" : `\n${failed}개 구현체가 강제 자리에서 어긋난다`);
process.exit(failed === 0 ? 0 : 1);
