# agent-tracer-stack

추적 스택과 에이전트 서비스를 함께 띄우는 배포 합성이다. 서비스 구성, 게이트웨이 상류 선언,
저장소별 이미지 태그 고정, 구현 교체 절차를 소유한다. 이미지는 각 저장소가 만들고 여기서는
`versions.lock`이 그 태그를 가리킨다.

추적 스택은 이 저장소 없이도 단독으로 뜬다. 여기가 필요한 것은 에이전트 서비스를 함께 띄울
때다. 에이전트 구현은 둘 중 하나만 올라가며, 교체해도 데이터베이스와 큐는 그대로 남는다.

```
node scripts/up.mjs --profile tracer      추적 스택만. 에이전트 경로는 501
node scripts/up.mjs --profile ts          TypeScript 구현체를 함께
node scripts/up.mjs --profile python      Python 구현체를 함께
node scripts/switch.mjs python            원장과 큐를 그대로 두고 구현체만 교체
node scripts/doctor.mjs --profile ts      이미지와 합성과 상류 선언을 검사
node scripts/conformance.mjs              두 구현체의 적합성 스위트를 나란히 실행
node scripts/down.mjs                     프로파일과 무관하게 전부 내린다. 데이터는 남는다
node scripts/down.mjs --volumes           볼륨까지 지운다
```

`--monitoring`을 더하면 계측 오버레이가 함께 뜨고 대시보드가 `127.0.0.1:3000`에 열린다.
게이트웨이는 `127.0.0.1:3847` 하나이며 브라우저는 그 포트만 본다.

`127.0.0.1:8081`이 네 원장을 같은 자격(`root` / `root`)으로 열고 로그인 화면의 목록에서
서버를 고른다. 뒤의 둘은 에이전트를 함께 띄우는 프로파일에서만 닿는다.

```
tracer-db    tracer     추적 조회 모델
event-db     runtime    수집 이벤트 원장
agent-db     agent      에이전트 실행 원장
temporal-db  temporal   워크플로 이력
```
