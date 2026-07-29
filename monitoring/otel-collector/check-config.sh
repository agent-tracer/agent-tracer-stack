#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
image=otel/opentelemetry-collector-contrib:0.155.0
langsmith_config="$project_root/infra/otel-collector/langsmith.yaml"

# 외부 exporter 계약과 최소 denylist가 설정 리팩터링 중 빠지는 것을 막는다.
grep -Fq 'Langsmith-Project: ${env:LANGSMITH_PROJECT}' "$langsmith_config"
grep -Fq 'x-api-key: ${env:LANGSMITH_API_KEY}' "$langsmith_config"
for redacted_key in api_key authorization callback_token scope_token user.id gen_ai.prompt gen_ai.completion input.value output.value; do
  grep -Fq "key: $redacted_key" "$langsmith_config"
done

# 테스트 fixture나 문서 placeholder가 아닌 실제 LangSmith key 형태는 저장소에 남길 수 없다.
if rg --hidden --glob '!node_modules/**' --glob '!.git/**' 'lsv2_(pt|sk)_[A-Za-z0-9]{16,}' "$project_root"; then
  echo "repository files contain a LangSmith API key-shaped value" >&2
  exit 1
fi

docker compose -f "$project_root/docker-compose.yml" -f "$project_root/docker-compose.monitoring.yml" config --quiet
OTEL_COLLECTOR_CONFIG=langsmith.yaml \
LANGSMITH_API_KEY=synthetic-test-key \
LANGSMITH_PROJECT=synthetic-smoke \
docker compose -f "$project_root/docker-compose.yml" -f "$project_root/docker-compose.monitoring.yml" config --quiet

docker run --rm \
  -v "$project_root/infra/otel-collector:/etc/otelcol-contrib:ro" \
  "$image" validate --config=/etc/otelcol-contrib/base.yaml

docker run --rm \
  -e LANGSMITH_OTLP_ENDPOINT=https://api.smith.langchain.com/otel \
  -e LANGSMITH_API_KEY=synthetic-test-key \
  -e LANGSMITH_PROJECT=synthetic-smoke \
  -v "$project_root/infra/otel-collector:/etc/otelcol-contrib:ro" \
  "$image" validate --config=/etc/otelcol-contrib/langsmith.yaml
