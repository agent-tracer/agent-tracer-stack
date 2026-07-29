import { spawnSync } from "node:child_process";
import { applyGatewayProfile, composeArgs, parseProfile, readVersions } from "./stack.mjs";

const profile = parseProfile(process.argv, "tracer");
applyGatewayProfile(profile);

const result = spawnSync(
    "docker",
    ["compose", ...composeArgs(profile), "up", "-d", "--wait"],
    { stdio: "inherit", env: { ...process.env, ...readVersions() } },
);

process.exit(result.status ?? 1);
