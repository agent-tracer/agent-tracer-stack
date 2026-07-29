import { spawnSync } from "node:child_process";
import { composeArgs, parseProfile, readVersions } from "./stack.mjs";

const profile = parseProfile(process.argv, "tracer");
const monitoring = process.argv.includes("--monitoring");
const keepData = !process.argv.includes("--purge");

const result = spawnSync(
    "docker",
    ["compose", ...composeArgs(profile, monitoring), "down", ...(keepData ? [] : ["-v"])],
    { stdio: "inherit", env: { ...process.env, ...readVersions() } },
);

process.exit(result.status ?? 1);
