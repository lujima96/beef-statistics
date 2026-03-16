#!/usr/bin/env bash
set -euo pipefail

JAR_PATH="${GH_HOME:-/opt/graphhopper}/graphhopper-web.jar"
GRAPH_CACHE_DIR="${GRAPH_CACHE_DIR:-/data/graph-cache}"
ENCODING_ERROR="Incompatible encoding version"

if [[ ! -f "${JAR_PATH}" ]]; then
    echo "GraphHopper jar not found at ${JAR_PATH}" >&2
    exit 1
fi

JAVA_OPTS="${JAVA_OPTS:--Xms2g -Xmx2g}"

run_graphhopper() {
    java ${JAVA_OPTS} -jar "${JAR_PATH}" "$@"
}

cleanup_cache() {
    if [[ -d "${GRAPH_CACHE_DIR}" ]]; then
        echo "Removing cached graph data at ${GRAPH_CACHE_DIR} to trigger a fresh import..." >&2
        find "${GRAPH_CACHE_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    fi
}

main() {
    local tmp_log
    tmp_log="$(mktemp -t graphhopper-start-XXXX.log)"

    if run_graphhopper "$@" 2>&1 | tee "${tmp_log}"; then
        rm -f "${tmp_log}"
        return 0
    fi

    local exit_code
    exit_code=${PIPESTATUS[0]}

    if grep -q "${ENCODING_ERROR}" "${tmp_log}"; then
        cleanup_cache
        echo "Restarting GraphHopper after clearing graph cache..." >&2
        if run_graphhopper "$@"; then
            rm -f "${tmp_log}"
            return 0
        fi
        exit_code=$?
    fi

    cat "${tmp_log}" >&2
    rm -f "${tmp_log}"
    return "${exit_code}"
}

main "$@"
exit $?
