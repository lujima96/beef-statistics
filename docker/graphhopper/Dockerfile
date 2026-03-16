FROM eclipse-temurin:17-jre

ARG GH_VERSION=10.2
ENV GH_HOME=/opt/graphhopper \
    JAVA_OPTS="-Xms2g -Xmx2g"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    unzip \
    zip \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p "${GH_HOME}" \
    && curl -fsSL \
        "https://github.com/graphhopper/graphhopper/releases/download/${GH_VERSION}/graphhopper-web-${GH_VERSION}.jar" \
        -o "${GH_HOME}/graphhopper-web.jar"

COPY graphhopper/custom-ui /tmp/custom-ui

RUN if [ -d /tmp/custom-ui ]; then \
        cd /tmp/custom-ui && zip -ur "${GH_HOME}/graphhopper-web.jar" com; \
        rm -rf /tmp/custom-ui; \
    fi

COPY docker/graphhopper/run-graphhopper.sh /usr/local/bin/run-graphhopper.sh
RUN chmod +x /usr/local/bin/run-graphhopper.sh

WORKDIR /data
VOLUME ["/data/graph-cache"]

EXPOSE 8989

ENTRYPOINT ["/usr/local/bin/run-graphhopper.sh"]
CMD ["server", "/data/config.yml"]
