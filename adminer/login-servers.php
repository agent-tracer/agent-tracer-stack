<?php

require_once __DIR__ . "/../plugins/login-servers.php";

return new AdminerLoginServers([
    "tracer-db" => "tracer — 추적 조회 모델",
    "agent-db" => "agent — 에이전트 실행 원장",
    "event-db" => "runtime — 수집 이벤트 원장",
    "temporal-db" => "temporal — 워크플로 이력",
]);
