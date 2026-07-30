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
node scripts/up.mjs --profile compare     두 구현체를 나란히. ?backend= 가 축을 고른다
node scripts/switch.mjs python            원장과 큐를 그대로 두고 구현체만 교체
node scripts/doctor.mjs --profile ts      이미지와 합성과 상류 선언을 검사
  --skip-images                           이미지를 만들지 않는 자리에서 나머지만 검사
node scripts/conformance.mjs              두 구현체의 적합성 스위트를 나란히 실행
node scripts/down.mjs                     프로파일과 무관하게 전부 내린다. 데이터는 남는다
node scripts/down.mjs --volumes           볼륨까지 지운다
```

`compare`는 두 접수구를 함께 세우고 게이트웨이가 `?backend=ts` · `?backend=python`으로 가른다.
파라미터가 없으면 `ts`가 받는다. 큐 접두사가 축마다 달라 같은 실행을 두 번 집지 않으며
원장은 하나라 두 축의 결과가 한 화면에 함께 쌓인다.

**진행 중인 턴을 남긴 채 이 배치로 들어가지 않는다.** 두 대화 워커가 같은 원장을 보므로
부팅 복구가 활성 턴을 두 번 되살린다.

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
