<?php

require_once __DIR__ . "/../plugins/login-servers.php";

// 키가 로그인 화면의 목록에 그대로 보이므로 원장의 이름과 그 몫을 함께 적는다.
return new AdminerLoginServers([
    "tracer — 추적 조회 모델" => ["server" => "tracer-db", "driver" => "pgsql"],
    "agent — 에이전트 실행 원장" => ["server" => "agent-db", "driver" => "pgsql"],
    "runtime — 수집 이벤트 원장" => ["server" => "event-db", "driver" => "pgsql"],
    "temporal — 워크플로 이력" => ["server" => "temporal-db", "driver" => "pgsql"],
]);
