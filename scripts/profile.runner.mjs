// 합성 대신 자기 실행체를 갖는 프로파일의 자리이며, 기동과 진단과 종료가 도커를 부르기 전에 여기서 갈라진다.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** 실행체 모듈이 사는 디렉터리이며 파일 이름이 곧 프로파일 이름이다. */
export const RUNNER_DIR = join(here, "profiles");

// 프로파일 이름이 경로로 새지 않도록 파일 이름에 쓸 수 있는 글자만 받는다.
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** 프로파일이 자기 실행체를 가지면 그 파일 경로를 내고 아니면 null 을 낸다. */
export function runnerPath(profile, exists = existsSync) {
    if (typeof profile !== "string" || !NAME_PATTERN.test(profile)) return null;
    const file = join(RUNNER_DIR, `${profile}.mjs`);
    return exists(file) ? file : null;
}

/**
 * 실행체를 가진 프로파일이면 그 모듈을 낸다.
 * 모듈은 up() 과 down(purge) 과 doctor(report) 를 갖고 종료 코드를 돌려준다.
 */
export async function loadRunner(profile) {
    const file = runnerPath(profile);
    return file === null ? null : import(pathToFileURL(file).href);
}
