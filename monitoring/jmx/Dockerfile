# Debezium Connect 이미지에 JMX Prometheus 자바 에이전트를 얹는다.
# 패턴 출처: debezium/debezium-examples monitoring/debezium-jmx-exporter.
ARG DEBEZIUM_VERSION
FROM debezium/connect:${DEBEZIUM_VERSION}

ARG JMX_AGENT_VERSION
RUN mkdir -p /kafka/etc && cd /kafka/etc && \
    curl -sfo jmx_prometheus_javaagent.jar \
    "https://repo1.maven.org/maven2/io/prometheus/jmx/jmx_prometheus_javaagent/${JMX_AGENT_VERSION}/jmx_prometheus_javaagent-${JMX_AGENT_VERSION}.jar"

COPY config.yml /kafka/etc/config.yml
