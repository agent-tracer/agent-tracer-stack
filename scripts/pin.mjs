import { spawnSync } from "node:child_process";
import { parseStack, readVersions, stackEnv } from "./stack.mjs";

// 이미지는 각 저장소가 만들고 이 저장소는 그것에 스택의 이름을 붙일 뿐이다.
const stack = parseStack(process.argv);
if (stack === null) {
    console.error("이름을 적어라: node scripts/pin.mjs --stack b");
    process.exit(1);
}

const environment = stackEnv(stack);
let failed = 0;

for (const [key, source] of Object.entries(readVersions())) {
    const target = environment[key];
    const tagged = spawnSync("docker", ["tag", source, target], { stdio: "inherit" });
    if (tagged.status !== 0) failed += 1;
    else console.log(`${source} → ${target}`);
}

if (failed > 0) console.error(`${failed}개 이미지가 없다. 만든 뒤 다시 실행한다`);
process.exit(failed === 0 ? 0 : 1);
