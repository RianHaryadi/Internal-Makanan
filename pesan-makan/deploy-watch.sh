#!/usr/bin/env bash
# deploy-watch.sh — digest-pinned deploy watcher for pesan-makan.
#
# Runs from a systemd user timer (pesan-makan-deploy.timer, every 60s) and
# deploys one environment per invocation:  deploy-watch.sh stable
#
# WHAT WAS WRONG (the version this replaces)
# ------------------------------------------
# The old watcher resolved the remote digest with skopeo when skopeo was
# installed and fell back to `podman pull` when it was not — so on every
# host without skopeo it took its "fallback" branch on EVERY tick: a full
# `podman pull ghcr.io/rianharyadi/internal-makanan:stable` — the whole
# image, every layer re-verified — purely to learn the remote digest. On
# the deployment host that was 28 pulls in 30 ticks (~1440 pulls/day) that
# changed nothing: the image ID was identical every time.
#
# It also had no rollback, treated a failed migration as "non-fatal" and
# then recorded the broken image as deployed, never pinned the compose
# file (so the moving tag was what actually ran), and compared digests in
# a space that had to be pinned down carefully.
#
# WHAT THIS SCRIPT DOES
# ----------------------
#  1. Resolves the remote digest from the REGISTRY MANIFEST — no layer is
#     downloaded, and every registry call is bounded by an explicit
#     timeout so a hung registry cannot stall the 60s timer.
#  2. Records and compares the INSTANCE manifest digest: the digest of
#     the manifest for THIS host's platform, i.e. the same value
#     `podman image inspect --format {{.Digest}}` reports and the same
#     value the deploy path uses. The OCI *index* digest (what
#     `podman image ls` prints) is a different value and is never
#     recorded — see "DIGEST SPACES" below.
#  3. Only when the digest actually changed: pulls repo@digest (never
#     the moving tag), pins the compose file to repo:tag@digest,
#     recreates the container, runs the migrations (FATAL), health-checks
#     the app, and only then records the new digest.
#  4. On any failure after the container was touched: re-pins the compose
#     file to the previous digest, pulls that digest if it is not in the
#     local store, recreates the container and restores the recorded
#     digest.
#
# DIGEST SPACES (the subtle part)
# -------------------------------
# A multi-platform tag is an OCI image INDEX. It has:
#   * an index digest      — the digest of the index object itself.
#                           `podman image ls --format {{.Digest}}` prints
#                           this one.
#   * an instance digest   — one per platform entry. THIS is what
#                           `podman image inspect --format {{.Digest}}`
#                           prints, what `podman pull repo@digest` pulls,
#                           and what the running container is backed by.
#
# The two are NOT interchangeable. Recording the index digest and
# comparing it against an instance digest reports "changed" on every tick
# and redeploys forever; recording the index digest and comparing it
# against another index digest claims "up to date" while the compose file
# is still on the moving tag. This script resolves the index down to the
# platform entry for this host and records the instance digest only.
#
# STATE
# -----
#   $STATE_DIR/<env>/deployed-digest   digest currently deployed
#   $STATE_DIR/<env>/previous-digest   digest to roll back to
#   $STATE_DIR/<env>/failed-digest     digest of the last failed deploy
#
# The state root stays ~/.cache/pesan-makan-deploy/ — it is where the
# old watcher kept its state, so the first run of this script finds the
# directory (and the legacy <env>.digest file) instead of silently
# starting from zero. The per-environment subdirectory keeps the two
# digests of one environment together and leaves room for more
# environments without their state colliding.
#
# The legacy $STATE_DIR/<env>.digest file is READ but never trusted: it
# may hold a digest in the other space, and using it for the change
# decision is exactly how a watcher ends up redeploying every minute (or
# believing a stack is up to date when it is not). The state is seeded
# from the RUNNING CONTAINER instead — the only thing that is known to
# be true. See STATE-MIGRATION.md.
#
# Usage: deploy-watch.sh <env>

set -Eeuo pipefail
shopt -s inherit_errexit

# ---------------------------------------------------------------------------
# Configuration — every value can be overridden from the environment, which
# is what the test suite uses to run the script against a fake podman/curl.
# ---------------------------------------------------------------------------

ENV_NAME="${1:-}"
if [[ -z "$ENV_NAME" ]]; then
    echo "usage: $0 <dev|beta|stable>" >&2
    exit 2
fi

# The repository the app image lives in, and the tag of THIS environment.
# One repository carries several tags (stable/beta/dev): the pin and every
# comparison are scoped to the tag, never to the bare repository.
: "${IMAGE_REPO:=ghcr.io/rianharyadi/internal-makanan}"
: "${IMAGE_TAG:=$ENV_NAME}"
IMAGE_REF="${IMAGE_REPO}:${IMAGE_TAG}"

# Layout on the host.
: "${REPO_DIR:=$HOME/pesan-makan/pesan-makan}"
: "${COMPOSE_FILE:=$REPO_DIR/docker-compose.yml}"
: "${MIGRATE_CMD:=$REPO_DIR/run-migrations.sh}"
: "${PROJECT_NAME:=$(basename -- "$REPO_DIR")}"
: "${SERVICE_NAME:=app-$ENV_NAME}"
: "${APP_CONTAINER:=${PROJECT_NAME}-${SERVICE_NAME}-1}"

# State. The root is the one the old watcher used; see the header.
: "${STATE_DIR:=$HOME/.cache/pesan-makan-deploy}"
ENV_STATE_DIR="$STATE_DIR/$ENV_NAME"
DEPLOYED_DIGEST_FILE="$ENV_STATE_DIR/deployed-digest"
PREVIOUS_DIGEST_FILE="$ENV_STATE_DIR/previous-digest"
FAILED_DIGEST_FILE="$ENV_STATE_DIR/failed-digest"
LEGACY_STATE_FILE="$STATE_DIR/${ENV_NAME}.digest"
LOCK_FILE="$STATE_DIR/${ENV_NAME}.lock"

# How the compose file is pinned.
#   tagged -> ghcr.io/.../internal-makanan:stable@sha256:<digest>
#   repo   -> ghcr.io/.../internal-makanan@sha256:<digest>
# "tagged" is the default: it keeps the tag visible in the compose file
# and keeps the pin unambiguously scoped to this environment's tag.
: "${PIN_FORM:=tagged}"

# Health check. The app container has no HEALTHCHECK in the compose file
# (podman inspect shows no health status), so the check is: the container
# is running, and the app answers HTTP on its published port. Any status
# below 500 counts as "the app is serving"; 000 (no answer) and 5xx (the
# app is broken) are failures.
#
# The published host port is per environment — the compose file maps
# stable→3100, beta→3110, dev→3105 — so the default is per environment
# rather than one hardcoded port. APP_PORT overrides it.
case "$ENV_NAME" in
    stable) : "${APP_PORT:=3100}" ;;
    beta)   : "${APP_PORT:=3110}" ;;
    dev)    : "${APP_PORT:=3105}" ;;
    *)      : "${APP_PORT:=3100}" ;;
esac
: "${HEALTH_URL:=http://127.0.0.1:${APP_PORT}/}"
: "${HEALTH_TIMEOUT_S:=90}"
: "${HEALTH_INTERVAL_S:=3}"
: "${HEALTH_PROBE_TIMEOUT_S:=5}"

# Registry lookups are bounded: the timer fires every 60s and a hung
# registry must never hold a run open past the next tick.
: "${REGISTRY_TIMEOUT_S:=20}"
: "${MANIFEST_TIMEOUT_S:=20}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log()     { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${1:-INFO}" "${2:-}"; }
log_err() { log "${1:-ERROR}" "${2:-}" >&2; }

# host_oci_arch — map the host's uname architecture onto the OCI platform
# architecture string used inside image indexes.
host_oci_arch() {
    case "$(uname -m)" in
        x86_64|amd64)         printf 'amd64' ;;
        aarch64|arm64)        printf 'arm64' ;;
        armv7l|armv6l|armv8l) printf 'arm' ;;
        i386|i486|i586|i686)  printf '386' ;;
        *)                    printf '%s' "$(uname -m)" ;;
    esac
}

host_os() {
    printf '%s' "$(uname -s | tr '[:upper:]' '[:lower:]')"
}

# write_state <file> <value> — record a digest.
#
# printf '%s' (no trailing newline) and mode 0644. The subshell form is
# deliberate: with a plain
# `printf ... > FILE 2>/dev/null` bash applies the redirections left to
# right, so when `>` fails bash itself prints "Permission denied" and the
# later 2>/dev/null never gets a chance to suppress it. Inside a subshell
# the whole group is redirected and the shell's own message dies with it.
write_state() {
    local file="$1" value="$2"
    ( printf '%s' "$value" > "$file" ) 2>/dev/null || {
        log_err ERROR "could not write state file $file"
        return 1
    }
    chmod 0644 "$file" 2>/dev/null || true
    return 0
}

read_state() {
    local file="$1" value=""
    [[ -s "$file" ]] && value=$(<"$file")
    printf '%s' "$value"
}

# sed_escape_regex — escape every character of the argument that has a
# special meaning in a POSIX extended regular expression, so the value can
# be interpolated into a sed pattern literally.
#
# The image repository contains dots ("ghcr.io"). An unescaped dot matches
# ANY character, so the pattern would also hit image lines that merely
# look like ours — precisely the over-match the pinning must never do.
# Only [A-Za-z0-9_-] and '/' are left alone: '/' because the sed
# expression uses '#' as its delimiter (the repository path contains
# slashes).
sed_escape_regex() {
    local out="" i c
    for (( i = 0; i < ${#1}; i++ )); do
        c="${1:i:1}"
        case "$c" in
            [a-zA-Z0-9_-]) out+="$c" ;;
            /) out+="$c" ;;
            *) out+="\\$c" ;;
        esac
    done
    printf '%s' "$out"
}

# ---------------------------------------------------------------------------
# Registry access
# ---------------------------------------------------------------------------

# registry_host <repo> — the registry host of an image repository.
registry_host() {
    local repo="$1" first
    first="${repo%%/*}"
    if [[ "$first" == *.* || "$first" == *:* || "$first" == "localhost" ]]; then
        printf '%s' "$first"
    else
        printf 'docker.io'
    fi
}

# registry_repo_path <repo> — the repository path used by the registry
# API ("owner/name"), without the registry host.
registry_repo_path() {
    local repo="$1" host first
    host=$(registry_host "$repo")
    first="${repo%%/*}"
    if [[ "$first" == "$host" ]]; then
        printf '%s' "${repo#*/}"
    else
        printf '%s' "$repo"
    fi
}

# registry_basic_auth <host> — the "user:password" pair for a registry,
# read from the podman auth file. Empty output when there is none.
registry_basic_auth() {
    local host="$1" file="" cand enc
    if [[ -n "${REGISTRY_AUTH_FILE:-}" && -s "${REGISTRY_AUTH_FILE}" ]]; then
        file="$REGISTRY_AUTH_FILE"
    else
        for cand in "$HOME/.config/containers/auth.json" \
                    "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/containers/auth.json"; do
            if [[ -s "$cand" ]]; then file="$cand"; break; fi
        done
    fi
    [[ -n "$file" ]] || return 1
    enc=$(jq -r --arg h "$host" '(.auths[$h].auth // empty)' "$file" 2>/dev/null) || return 1
    [[ -n "$enc" ]] || return 1
    printf '%s' "$enc" | base64 -d 2>/dev/null | tr -d '\n'
}

# registry_token <host> <repo-path> [basic-auth] — a pull token for the
# repository. Anonymous first for public repositories, basic auth for
# private ones.
registry_token() {
    local host="$1" path="$2" auth="${3:-}" url json token
    url="https://${host}/token?service=${host}&scope=repository:${path}:pull"
    if [[ -n "$auth" ]]; then
        json=$(timeout -k 5 "$REGISTRY_TIMEOUT_S" curl -fsS --max-time "$REGISTRY_TIMEOUT_S" \
                -u "$auth" "$url" 2>/dev/null) || return 1
    else
        json=$(timeout -k 5 "$REGISTRY_TIMEOUT_S" curl -fsS --max-time "$REGISTRY_TIMEOUT_S" \
                "$url" 2>/dev/null) || return 1
    fi
    [[ -n "$json" ]] || return 1
    token=$(printf '%s' "$json" | jq -r '.token // .access_token // empty' 2>/dev/null) || return 1
    [[ -n "$token" ]] || return 1
    printf '%s' "$token"
}

# resolve_via_registry <repo> <tag>
#
# Resolve the INSTANCE manifest digest of repo:tag straight from the
# registry API. No layer is downloaded: a manifest is a few kilobytes.
#
# Two shapes exist and both have to work:
#   * an OCI image index (multi-platform tag): the index carries one
#     entry per platform. The entry matching THIS host's platform is the
#     instance manifest digest — the value `podman image inspect` reports
#     and the value the deploy path uses. The index's own digest is a
#     DIFFERENT value and must never be recorded.
#   * a single manifest: the manifest's own digest IS the instance
#     digest, and the registry reports it in the Docker-Content-Digest
#     response header.
#
# Prints "<instance digest> <index digest>" on success (the index digest
# is informational only and may be empty). Exits non-zero when the
# manifest cannot be read — the caller then falls back to the podman
# manifest lookup, and only then to a full pull.
resolve_via_registry() (
    set -u
    local repo="$1" tag="$2" host path url token auth body hdr digest instance index
    command -v curl >/dev/null 2>&1 || exit 1
    command -v jq   >/dev/null 2>&1 || exit 1

    host=$(registry_host "$repo")
    path=$(registry_repo_path "$repo")
    url="https://${host}/v2/${path}/manifests/${tag}"

    body=$(mktemp "${TMPDIR:-/tmp}/pm-manifest.XXXXXX") || exit 1
    hdr=$(mktemp "${TMPDIR:-/tmp}/pm-headers.XXXXXX") || { rm -f "$body"; exit 1; }
    trap 'rm -f "$body" "$hdr"' EXIT

    token=""
    auth=$(registry_basic_auth "$host" || true)
    if [[ -n "$auth" ]]; then
        token=$(registry_token "$host" "$path" "$auth" || true)
    fi
    if [[ -z "$token" ]]; then
        token=$(registry_token "$host" "$path" "" || true)
    fi

    fetch() {
        local -a hdr_args=()
        [[ -n "${1:-}" ]] && hdr_args=(-H "Authorization: Bearer $1")
        timeout -k 5 "$REGISTRY_TIMEOUT_S" curl -fsS --max-time "$REGISTRY_TIMEOUT_S" \
            "${hdr_args[@]}" \
            -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json" \
            -D "$hdr" -o "$body" "$url" 2>/dev/null
    }

    if [[ -n "$token" ]]; then
        fetch "$token" || true
    else
        fetch "" || true
    fi
    if [[ ! -s "$body" ]]; then
        # A private repository may want the credentials directly.
        if [[ -n "$auth" ]]; then
            timeout -k 5 "$REGISTRY_TIMEOUT_S" curl -fsS --max-time "$REGISTRY_TIMEOUT_S" \
                -u "$auth" \
                -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json" \
                -D "$hdr" -o "$body" "$url" 2>/dev/null || true
        fi
    fi

    [[ -s "$body" ]] || exit 1

    index=$(tr -d '\r' < "$hdr" | awk 'tolower($1)=="docker-content-digest:"{print $2}' | tail -n1)

    if jq -e '.manifests' "$body" >/dev/null 2>&1; then
        # An index: resolve it down to this host's platform entry.
        instance=$(jq -r --arg os "$(host_os)" --arg arch "$(host_oci_arch)" '
                    .manifests[]?
                    | select(.platform.os == $os and .platform.architecture == $arch)
                    | .digest' "$body" 2>/dev/null | head -n1) || instance=""
        [[ "$instance" == sha256:* ]] || exit 1
        printf '%s %s' "$instance" "$index"
        exit 0
    fi

    # A single manifest: its own digest is the instance digest.
    digest=$(tr -d '\r' < "$hdr" | awk 'tolower($1)=="docker-content-digest:"{print $2}' | tail -n1)
    [[ "$digest" == sha256:* ]] || exit 1
    printf '%s %s' "$digest" ""
)

# resolve_via_podman_manifest <ref>
#
# Secondary path: ask podman for the manifest instead of the registry API
# (works when curl is missing or the token endpoint is unreachable). Like
# the registry path it downloads no layer. It handles the index shape; for
# a single manifest podman does not expose the manifest's own digest
# without a pull, so this path returns non-zero there and the caller
# falls through to the pull.
resolve_via_podman_manifest() {
    local ref="$1" manifest digest attempt
    command -v jq >/dev/null 2>&1 || return 1
    for attempt in 1 2; do
        manifest=$(timeout -k 5 "$MANIFEST_TIMEOUT_S" podman manifest inspect "$ref" 2>/dev/null) || manifest=""
        if [[ -n "$manifest" ]]; then
            digest=$(printf '%s' "$manifest" | jq -r \
                --arg os "$(host_os)" \
                --arg arch "$(host_oci_arch)" \
                '.manifests[]?
                 | select(.platform.os == $os and .platform.architecture == $arch)
                 | .digest' 2>/dev/null | head -n1) || digest=""
            if [[ "$digest" == sha256:* ]]; then
                printf '%s' "$digest"
                return 0
            fi
        fi
        if (( attempt == 1 )); then sleep 1; fi
    done
    return 1
}

# remote_digest <ref> — resolve the remote INSTANCE digest.
#
# Order: registry manifest (no pull) -> podman manifest (no pull) -> full
# pull (degraded). The pull fallback is the last resort and is announced,
# because it is the exact behaviour this script exists to remove: it
# re-verifies every layer on every tick.
REMOTE_DIGEST=""
REMOTE_INDEX_DIGEST=""
REMOTE_DIGEST_SOURCE=""
REMOTE_DIGEST_FALLBACK=false

remote_digest() {
    local ref="$1" repo tag out digest
    REMOTE_DIGEST=""
    REMOTE_INDEX_DIGEST=""
    REMOTE_DIGEST_SOURCE=""
    REMOTE_DIGEST_FALLBACK=false

    repo="${ref%:*}"
    tag="${ref##*:}"

    out=$(resolve_via_registry "$repo" "$tag" || true)
    if [[ -n "$out" ]]; then
        if [[ "$out" == *" "* ]]; then
            REMOTE_DIGEST="${out%% *}"
            REMOTE_INDEX_DIGEST="${out#* }"
        else
            REMOTE_DIGEST="$out"
        fi
        REMOTE_DIGEST_SOURCE="registry"
        return 0
    fi

    digest=$(resolve_via_podman_manifest "$ref" || true)
    if [[ "$digest" == sha256:* ]]; then
        REMOTE_DIGEST="$digest"
        REMOTE_DIGEST_SOURCE="podman-manifest"
        return 0
    fi

    # Degraded mode: the manifest could not be read. Resolving the digest
    # now costs a full image pull on every tick.
    REMOTE_DIGEST_FALLBACK=true
    if ! podman pull --quiet "$ref" >/dev/null 2>&1; then
        return 1
    fi
    digest=$(podman image inspect --format '{{.Digest}}' "$ref" 2>/dev/null) || digest=""
    [[ -n "$digest" ]] || return 1
    REMOTE_DIGEST="$digest"
    REMOTE_DIGEST_SOURCE="pull-fallback"
    return 0
}

# ---------------------------------------------------------------------------
# Container / image helpers
# ---------------------------------------------------------------------------

# container_state <name> — missing | stopped | healthy | unhealthy |
# no-healthcheck | <raw status>
container_state() {
    local name="$1" running health
    if ! podman inspect "$name" >/dev/null 2>&1; then
        printf 'missing'
        return 0
    fi
    running=$(podman inspect --format '{{.State.Running}}' "$name" 2>/dev/null || printf 'false')
    if [[ "$running" != "true" ]]; then
        printf 'stopped'
        return 0
    fi
    health=$(podman inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || printf 'unknown')
    case "$health" in
        healthy) printf 'healthy' ;;
        starting) printf 'starting' ;;
        none|"") printf 'no-healthcheck' ;;
        *) printf '%s' "$health" ;;
    esac
}

# container_instance_digest <name> — the INSTANCE manifest digest of the
# image a container is actually backed by.
#
# This is the subtle part, and modern podman makes it easy to get wrong.
# The SAME image reports two different digests depending on how it is
# addressed (measured on the deployment host, image
# ghcr.io/rianharyadi/internal-makanan:stable):
#
#   podman image inspect --format {{.Digest}} repo:stable        -> INSTANCE
#   podman image inspect --format {{.Digest}} <image-id>         -> INDEX
#   podman inspect --format {{.ImageDigest}} <container>        -> INDEX
#   podman image ls --format {{.Digest}}                        -> INDEX
#
# The image ID route therefore returns the OCI INDEX digest, which is a
# different digest space from the one this script records: using it
# would report "drifted" on every single tick and recreate the
# container every minute.
#
# So the digest is read from the container's IMAGE NAME:
#   * a digest-pinned name (repo@sha256:...) carries the instance
#     digest verbatim — that is what this script pins;
#   * a tag name is resolved through `podman image inspect`, which
#     reports the instance digest — but only if the tag still points at
#     the container's image (compared by image ID), otherwise the tag has
#     moved and the answer would be about a different image.
container_instance_digest() {
    local ctr="$1" name img_id name_id digest
    name=$(podman inspect --format '{{.ImageName}}' "$ctr" 2>/dev/null) || return 1
    [[ -n "$name" ]] || return 1
    if [[ "$name" == *"@"* ]]; then
        printf '%s' "${name##*@}"
        return 0
    fi
    img_id=$(podman inspect --format '{{.Image}}' "$ctr" 2>/dev/null) || return 1
    name_id=$(podman image inspect --format '{{.Id}}' "$name" 2>/dev/null) || return 1
    if [[ -z "$img_id" || -z "$name_id" || "$img_id" != "$name_id" ]]; then
        # The local tag no longer points at the container's image.
        return 1
    fi
    digest=$(podman image inspect --format '{{.Digest}}' "$name" 2>/dev/null) || return 1
    [[ "$digest" == sha256:* ]] || return 1
    printf '%s' "$digest"
}

# container_runs_digest <digest> — is the container backed by exactly the
# image of that digest?
#
# Compared by IMAGE ID, not by digest: the image ID identifies the image
# content, while the digest identifies a name in a registry. A digest
# from the wrong space (OCI index vs instance manifest) resolves to the
# same image, so the image ID is the comparison that cannot be fooled by
# a digest-space confusion.
container_runs_digest() {
    local digest="$1" want have
    [[ -n "$digest" ]] || return 1
    want=$(podman image inspect --format '{{.Id}}' "${IMAGE_REPO}@${digest}" 2>/dev/null) || return 1
    [[ -n "$want" ]] || return 1
    have=$(podman inspect --format '{{.Image}}' "$APP_CONTAINER" 2>/dev/null) || return 1
    [[ -n "$have" ]] || return 1
    [[ "$want" == "$have" ]]
}

# image_present <digest> — is repo@digest already in the local store?
image_present() {
    local digest="$1"
    [[ -n "$digest" ]] || return 1
    podman image inspect "${IMAGE_REPO}@${digest}" >/dev/null 2>&1
}

# resolve_app_container — the container that serves this environment.
resolve_app_container() {
    local name
    if podman inspect "$APP_CONTAINER" >/dev/null 2>&1; then
        printf '%s' "$APP_CONTAINER"
        return 0
    fi
    name=$(podman ps -a --format '{{.Names}}' 2>/dev/null \
           | grep -E "app-${ENV_NAME}(-[0-9]+)?$" | head -n1 || true)
    if [[ -n "$name" ]]; then
        printf '%s' "$name"
        return 0
    fi
    printf '%s' "$APP_CONTAINER"
}

# ---------------------------------------------------------------------------
# Compose pinning
# ---------------------------------------------------------------------------

# pin_string <digest> — the exact image value the compose file must carry.
pin_string() {
    local digest="$1"
    case "$PIN_FORM" in
        repo) printf '%s@%s' "$IMAGE_REPO" "$digest" ;;
        *)    printf '%s:%s@%s' "$IMAGE_REPO" "$IMAGE_TAG" "$digest" ;;
    esac
}

# compose_pin_pattern — the sed pattern that matches THIS environment's
# image line, and nothing else.
#
# The value on the `image:` line is one of
#   <repo>:<tag>              (the shape the repo's compose file uses)
#   <repo>:<tag>@sha256:...   (already pinned, tag scoped)
#   <repo>@sha256:...         (already pinned, repo scoped)
#   <repo>                    (bare repository)
#
# The tag is part of the match: one repository carries several tags
# (stable/beta/dev) and the pin of one environment must never rewrite the
# image line of another. The pattern is anchored at the end of the line,
# so `repo:beta` cannot match `repo:stable`, and a repository whose name
# merely starts with ours cannot match either.
#
# The alternatives are spelled out instead of using optional groups on
# purpose: POSIX ERE has no non-capturing groups, so an optional group
# would shift the numbering of the backreferences and the rewrite would
# append the new pin to the old digest instead of replacing it. The
# pattern therefore has exactly three groups: the indentation, the image
# value and the trailing whitespace.
compose_pin_pattern() {
    local repo tag
    repo=$(sed_escape_regex "$IMAGE_REPO")
    tag=$(sed_escape_regex "$IMAGE_TAG")
    printf '%s' '^([[:space:]]*image:[[:space:]]*)' \
        "(" \
        "${repo}:${tag}@sha256:[0-9a-f]{64}" "|" \
        "${repo}@sha256:[0-9a-f]{64}" "|" \
        "${repo}:${tag}" "|" \
        "${repo}" \
        ")" \
        '([[:space:]]*)$'
}

# compose_is_pinned_to <digest> — does the compose file already carry THIS
# digest for THIS environment's tag?
#
# Used to avoid rewriting the file on every no-op tick, and to decide whether
# the file has to be pinned at all.
#
# Only the PINNED shapes count. compose_pin_pattern() also lists the UNPINNED
# shapes (repo:tag, repo) so that pin_compose_image() can rewrite them, but
# they must NOT satisfy this check: an unpinned file means the next `up` would
# deploy whatever the moving tag points at, which is exactly what the pinning
# exists to prevent. (Reusing compose_pin_pattern() here made an UNPINNED file
# look pinned, so the no-change path never pinned anything.)
#
# The digest is part of the match, so a file pinned to a DIFFERENT digest is
# reported as not pinned and is re-pinned to the right one.
compose_is_pinned_to() {
    local digest="$1" repo tag
    [[ -f "$COMPOSE_FILE" ]] || return 1
    [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
    repo=$(sed_escape_regex "$IMAGE_REPO")
    tag=$(sed_escape_regex "$IMAGE_TAG")
    grep -qE "^[[:space:]]*image:[[:space:]]*(${repo}:${tag}|${repo})@${digest}[[:space:]]*$" "$COMPOSE_FILE"
}

# pin_compose_image <digest> — pin the image line of THIS environment to
# the digest, so the container that runs is immutable.
#
# Idempotent: pinning the same digest twice leaves the file byte
# identical. Re-pinnable: pinning a different digest rewrites the same
# line. The indentation and the whitespace around the value are kept.
#
# Returns non-zero when no matching image line exists — the caller treats
# that as FATAL, because a compose file that could not be pinned would
# run the moving tag, which is exactly the failure this pinning exists to
# prevent.
pin_compose_image() {
    local digest="$1" pattern replacement pin
    if [[ ! "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
        log_err ERROR "refusing to pin a non-sha256 digest: '${digest}'"
        return 1
    fi
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_err ERROR "compose file $COMPOSE_FILE not found — cannot pin it"
        return 1
    fi

    pattern=$(compose_pin_pattern)
    pin=$(pin_string "$digest")
    replacement="\\1${pin}\\3"

    sed -i -E "s#${pattern}#${replacement}#" "$COMPOSE_FILE"

    if ! sed -nE "s#${pattern}#\1PINNED#p" "$COMPOSE_FILE" | grep -q 'PINNED'; then
        log_err ERROR "could not pin $COMPOSE_FILE to $pin — no image line for ${IMAGE_REPO}:${IMAGE_TAG} found"
        return 1
    fi
    log INFO "compose file pinned to $pin"
    return 0
}

# compose_up — recreate the app container of this environment.
#
# --no-deps: the database is not touched. Its data volume keeps living
# exactly as it is; only the app container is replaced.
compose_up() {
    local service="$SERVICE_NAME"
    if [[ -n "${DEPLOY_LOG:-}" ]]; then
        ( cd "$REPO_DIR" && podman compose --project-name "$PROJECT_NAME" -f "$COMPOSE_FILE" \
            up -d --no-deps "$service" ) >>"$DEPLOY_LOG" 2>&1
    else
        ( cd "$REPO_DIR" && podman compose --project-name "$PROJECT_NAME" -f "$COMPOSE_FILE" \
            up -d --no-deps "$service" )
    fi
}

# recreate_container — replace the app container with the currently pinned
# image.
recreate_container() {
    podman rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true
    compose_up
}

# retag_local_tag <digest> — point the local moving tag at the image that
# is really running, so `podman images` does not lie. Best effort.
retag_local_tag() {
    local digest="$1"
    podman tag "${IMAGE_REPO}@${digest}" "$IMAGE_REF" >/dev/null 2>&1 || \
        log WARN "could not point the local tag ${IMAGE_REF} at ${digest}"
    return 0
}

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

# http_probe <url> — the HTTP status code the app answers with, or 000.
http_probe() {
    local url="$1" code
    code=$(timeout -k 5 "$HEALTH_PROBE_TIMEOUT_S" curl -s -o /dev/null -w '%{http_code}' \
           --max-time "$HEALTH_PROBE_TIMEOUT_S" "$url" 2>/dev/null) || code="000"
    printf '%s' "${code:-000}"
}

# health_check — bounded wait until the app is serving.
#
# The app container has no HEALTHCHECK in the compose file, so the check
# is: the container is running, and the published port answers HTTP. Any
# status below 500 means the app is serving (a 404 from a router without
# a /health route still proves the server is up); 000 and 5xx are
# failures.
health_check() {
    local deadline=$(( $(date +%s) + HEALTH_TIMEOUT_S )) state code
    while :; do
        state=$(container_state "$APP_CONTAINER")
        if [[ "$state" == "healthy" || "$state" == "no-healthcheck" ]]; then
            code=$(http_probe "$HEALTH_URL")
            if [[ "$code" != "000" && "$code" != 5* && -n "$code" ]]; then
                log INFO "health check ok: container=$state http=$code"
                return 0
            fi
        else
            code="-"
        fi
        if (( $(date +%s) >= deadline )); then
            log_err ERROR "health check failed after ${HEALTH_TIMEOUT_S}s (container=$state http=$code) — $HEALTH_URL"
            return 1
        fi
        sleep "$HEALTH_INTERVAL_S"
    done
}

# ---------------------------------------------------------------------------
# Migrations
# ---------------------------------------------------------------------------

# run_migrations — run the environment's migrations.
#
# The old watcher treated a failure here as "non-fatal" and then recorded
# the broken image as deployed, so a failed migration was never retried
# and the broken build stayed in production. A failure here is FATAL: the
# deploy is rolled back and nothing is recorded.
run_migrations() {
    local script="$MIGRATE_CMD"
    if [[ ! -x "$script" ]]; then
        log WARN "migration script $script is missing or not executable — skipping"
        return 0
    fi
    log INFO "running migrations: $script $ENV_NAME"
    if [[ -n "${DEPLOY_LOG:-}" ]]; then
        if ( cd "$REPO_DIR" && "$script" "$ENV_NAME" ) >>"$DEPLOY_LOG" 2>&1; then
            return 0
        fi
    else
        if ( cd "$REPO_DIR" && "$script" "$ENV_NAME" ); then
            return 0
        fi
    fi
    return 1
}

# ---------------------------------------------------------------------------
# Rollback
# ---------------------------------------------------------------------------

# restore_previous — roll back to the digest recorded in previous-digest.
#
# The rollback is a full path, not a state-file edit: the previous image
# is made available locally, the compose file is re-pointed at it, the
# container is recreated, and the recorded digest is restored. A rollback
# that only rewrote the state file would leave the failed build running
# while the state claimed the old digest was back.
restore_previous() {
    local prev
    if [[ ! -s "$PREVIOUS_DIGEST_FILE" ]]; then
        log_err ERROR "rollback requested but no previous digest is recorded ($PREVIOUS_DIGEST_FILE)"
        return 1
    fi
    prev=$(<"$PREVIOUS_DIGEST_FILE")
    if [[ ! "$prev" =~ ^sha256:[0-9a-f]{64}$ ]]; then
        log_err ERROR "rollback requested but the recorded previous digest is not a sha256 digest: '$prev'"
        return 1
    fi

    log INFO "rolling back to $prev"

    # The previous image may be absent locally (pruned, cache cleared, or
    # never pulled). It must be pulled BEFORE the compose file references
    # it, otherwise the recreate fails and the rollback itself leaves the
    # stack down.
    if image_present "$prev"; then
        log INFO "previous image already present locally: $prev"
    elif podman pull --quiet "${IMAGE_REPO}@${prev}" >/dev/null 2>&1; then
        log INFO "pulled previous image for rollback: $prev"
    else
        log_err ERROR "rollback pull failed for $prev"
        write_state "$FAILED_DIGEST_FILE" "${REMOTE_DIGEST:-}" || true
        return 1
    fi

    if ! pin_compose_image "$prev"; then
        log_err ERROR "rollback could not re-pin the compose file to $prev"
        return 1
    fi

    if ! recreate_container; then
        log_err ERROR "rollback recreate failed"
        write_state "$FAILED_DIGEST_FILE" "${REMOTE_DIGEST:-}" || true
        return 1
    fi

    write_state "$DEPLOYED_DIGEST_FILE" "$prev" || return 1
    retag_local_tag "$prev"
    log INFO "rollback ok: now running $prev"
    return 0
}

# ---------------------------------------------------------------------------
# State bootstrap
# ---------------------------------------------------------------------------

# bootstrap_state — seed the state of this environment.
#
# The RUNNING CONTAINER is the only trustworthy source of "what is
# deployed": it is the thing that is serving right now. The legacy state
# file ($STATE_DIR/<env>.digest) is read for reporting only — it may hold
# a digest from the other space (OCI index vs instance manifest), and
# using it for the change decision is how a watcher redeploys every
# minute, or believes a stack is up to date when it is not.
bootstrap_state() {
    local running legacy
    running=$(container_instance_digest "$APP_CONTAINER" || true)
    legacy=""
    [[ -s "$LEGACY_STATE_FILE" ]] && legacy=$(<"$LEGACY_STATE_FILE")

    if [[ -n "$legacy" ]]; then
        log INFO "legacy state file $LEGACY_STATE_FILE found (${legacy:0:19}...) — it is NOT used for the change decision"
    fi

    if [[ -n "$running" ]]; then
        log INFO "running container $APP_CONTAINER is on $running — seeding deployed-digest from it"
        if [[ -n "$legacy" && "$legacy" != "$running" ]]; then
            log WARN "legacy digest (${legacy:0:19}...) differs from the running instance digest (${running:0:19}...) — the legacy file is in a different digest space (OCI index vs instance manifest) or stale, and was ignored"
        fi
        write_state "$DEPLOYED_DIGEST_FILE" "$running" || return 1
        DEPLOYED_DIGEST="$running"
        return 0
    fi

    log WARN "no running container $APP_CONTAINER and no recorded digest — treating this as a first deploy"
    DEPLOYED_DIGEST=""
    return 0
}

# legacy_previous_candidate — the legacy digest, but only when it
# provably refers to the image the running container is backed by.
#
# Used as the rollback target for a first deploy, never as the deployed
# digest: the legacy value may live in the other digest space, and
# recording it would report a change on every tick.
legacy_previous_candidate() {
    local legacy=""
    [[ -s "$LEGACY_STATE_FILE" ]] || return 1
    legacy=$(<"$LEGACY_STATE_FILE")
    [[ "$legacy" == sha256:* ]] || return 1
    container_runs_digest "$legacy" || return 1
    printf '%s' "$legacy"
}

# reconcile <digest> — make the stack match the recorded digest.
#
# The recorded digest says what SHOULD be running; it says nothing about
# whether it is running. A crashed or removed container would otherwise
# be reported as "no change" forever while the app stays down. The image
# is only pulled when it is genuinely absent from the local store.
reconcile() {
    local digest="$1" state
    state=$(container_state "$APP_CONTAINER")
    if [[ "$state" == "healthy" || "$state" == "no-healthcheck" ]]; then
        if container_runs_digest "$digest"; then
            return 0
        fi
        log WARN "container $APP_CONTAINER is not the image of the recorded digest $digest — recreating it from the recorded digest"
    else
        log WARN "container $APP_CONTAINER is '$state' — recreating it from the recorded digest $digest"
    fi

    if ! image_present "$digest"; then
        log INFO "recorded digest $digest is not in the local store — pulling it"
        if ! podman pull --quiet "${IMAGE_REPO}@${digest}" >/dev/null 2>&1; then
            log_err ERROR "failed to pull the recorded digest $digest for the reconcile"
            return 1
        fi
    fi

    pin_compose_image "$digest" || return 1
    if ! recreate_container; then
        log_err ERROR "reconcile failed for $APP_CONTAINER"
        return 1
    fi
    log INFO "reconcile ok: $digest"
    return 0
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    local deployed previous

    mkdir -p "$ENV_STATE_DIR"

    # Only one run at a time: the timer fires every 60s and a deploy can
    # take longer than that.
    if command -v flock >/dev/null 2>&1; then
        exec 9>"$LOCK_FILE"
        if ! flock -n 9; then
            log INFO "another deploy watcher run is in progress — exiting"
            exit 0
        fi
    fi

    APP_CONTAINER=$(resolve_app_container)

    log INFO "checking registry for ${IMAGE_REF}"

    if ! remote_digest "$IMAGE_REF"; then
        log_err ERROR "failed to resolve the remote digest for ${IMAGE_REF}"
        exit 1
    fi
    if [[ "$REMOTE_DIGEST" != sha256:* ]]; then
        log_err ERROR "remote digest for ${IMAGE_REF} is not a sha256 digest: '${REMOTE_DIGEST:-<empty>}'"
        exit 1
    fi
    if [[ "$REMOTE_DIGEST_FALLBACK" == "true" ]]; then
        log_err ERROR "manifest lookup unavailable — resolved by a FULL IMAGE PULL, which happens on every tick. Install jq and check registry access."
    else
        log INFO "remote digest $REMOTE_DIGEST (source: $REMOTE_DIGEST_SOURCE)"
        if [[ -n "$REMOTE_INDEX_DIGEST" && "$REMOTE_INDEX_DIGEST" != "$REMOTE_DIGEST" ]]; then
            log INFO "tag resolves to OCI index $REMOTE_INDEX_DIGEST; the instance digest for $(host_os)/$(host_oci_arch) is $REMOTE_DIGEST (the index digest is never recorded)"
        fi
    fi

    deployed=$(read_state "$DEPLOYED_DIGEST_FILE")
    if [[ -z "$deployed" ]]; then
        bootstrap_state || exit 1
        deployed="$DEPLOYED_DIGEST"
    fi

    if [[ -n "$deployed" && "$deployed" == "$REMOTE_DIGEST" ]]; then
        log INFO "no change (deployed=$deployed)"
        # The compose file must stay pinned: an unpinned compose file
        # means the next `up` would deploy whatever the moving tag points
        # at. Pinning is idempotent, and the file is only rewritten when
        # it is not pinned yet.
        if ! compose_is_pinned_to "$REMOTE_DIGEST"; then
            if ! pin_compose_image "$REMOTE_DIGEST"; then
                log_err ERROR "the compose file is not pinned to the deployed digest and could not be pinned"
                exit 1
            fi
        fi
        reconcile "$REMOTE_DIGEST" || exit 1
        exit 0
    fi

    log INFO "digest changed: ${deployed:-<none>} -> $REMOTE_DIGEST"

    # The previous digest is what a rollback restores. Prefer the recorded
    # one; fall back to what is actually running, and finally to the
    # legacy file — but only when it provably refers to the running
    # image.
    previous="$deployed"
    if [[ -z "$previous" ]]; then
        previous=$(container_instance_digest "$APP_CONTAINER" || true)
    fi
    if [[ -z "$previous" ]]; then
        previous=$(legacy_previous_candidate || true)
        if [[ -n "$previous" ]]; then
            log INFO "using the legacy digest $previous as the rollback target (it refers to the running image)"
        fi
    fi
    if [[ -n "$previous" ]]; then
        write_state "$PREVIOUS_DIGEST_FILE" "$previous" || exit 1
    fi

    # 1. Make the new image available locally — by DIGEST, never by the
    #    moving tag (the tag can be re-pushed between the lookup and the
    #    pull, and deploying a digest that was not verified is worse than
    #    doing nothing).
    if image_present "$REMOTE_DIGEST"; then
        log INFO "layers for $REMOTE_DIGEST are already present locally"
    else
        log INFO "pulling ${IMAGE_REPO}@${REMOTE_DIGEST}"
        if ! podman pull --quiet "${IMAGE_REPO}@${REMOTE_DIGEST}" >/dev/null 2>&1; then
            log_err ERROR "failed to pull ${IMAGE_REPO}@${REMOTE_DIGEST} — aborting, the recorded digest is unchanged"
            write_state "$FAILED_DIGEST_FILE" "$REMOTE_DIGEST" || true
            exit 1
        fi
    fi

    # 2. Pin the compose file BEFORE the container is recreated. A failed
    #    pin is fatal: it would mean the container keeps running the
    #    moving tag.
    if ! pin_compose_image "$REMOTE_DIGEST"; then
        log_err ERROR "aborting: the compose file could not be pinned to $REMOTE_DIGEST"
        exit 1
    fi

    # 3. Recreate the container on the pinned digest.
    if ! recreate_container; then
        log_err ERROR "container recreate failed — rolling back"
        restore_previous || true
        exit 1
    fi

    # 4. Migrations. FATAL: a failed migration is not a deploy.
    if ! run_migrations; then
        log_err ERROR "migration step failed — rolling back to ${previous:-<none>}"
        restore_previous || true
        exit 1
    fi

    # 5. Verify the deploy before recording it.
    if ! health_check; then
        log_err ERROR "deploy verification failed — rolling back to ${previous:-<none>}"
        restore_previous || true
        exit 1
    fi

    # 6. Record the deploy.
    write_state "$DEPLOYED_DIGEST_FILE" "$REMOTE_DIGEST" || exit 1
    retag_local_tag "$REMOTE_DIGEST"
    rm -f "$FAILED_DIGEST_FILE" 2>/dev/null || true
    log INFO "deploy complete -> $REMOTE_DIGEST"
    exit 0
}

main "$@"
