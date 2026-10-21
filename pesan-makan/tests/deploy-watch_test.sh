#!/usr/bin/env bash
# Shell-level regression tests for deploy-watch.sh (pesan-makan deploy
# watcher).
#
# deploy-watch.sh runs on the server from a systemd user timer, so its
# failure modes are invisible in CI unless they are exercised here. These
# tests use a fake `podman` and a fake `curl` on PATH, so no container
# runtime and no network are required.
#
# Defects covered (all of them were real on server-337):
#
#   1. The watcher ran a full `podman pull` of the MOVING TAG on every
#      timer tick, purely to learn the remote digest: 28 `image pull`
#      lines in 30 ticks, ~1440 pulls a day, the same image ID every
#      time. The digest must come from the registry MANIFEST, with no
#      layer downloaded.
#      Covered by test_no_change_does_not_pull,
#      test_digest_comes_from_the_manifest_index,
#      test_single_manifest_image_resolves_without_a_pull and
#      test_changed_digest_pulls_by_digest.
#
#   2. The digest must be compared in ONE space. A multi-platform tag is
#      an OCI INDEX: it has an index digest (what `podman image ls` and
#      `podman image inspect <image-id>` print) and one INSTANCE digest
#      per platform (what `podman image inspect <repo:tag>` prints and
#      what the container is really backed by). Recording the index
#      digest reports a change on every tick; comparing an index digest
#      against a recorded instance digest redeploys forever.
#      Covered by test_compose_is_pinned_to_the_instance_digest_not_the_index,
#      test_legacy_index_digest_state_is_not_trusted,
#      test_container_digest_is_read_in_the_instance_space and
#      test_digest_comes_from_the_manifest_index.
#
#   3. The compose file was never pinned, so the container ran whatever
#      the moving tag pointed at.
#      Covered by test_compose_is_pinned_to_the_instance_digest_not_the_index,
#      test_pinning_is_idempotent,
#      test_pinning_does_not_touch_another_tag_of_the_same_repository and
#      test_pinning_does_not_touch_other_services.
#
#   4. There was no rollback at all: no previous digest, no restore path.
#      Covered by test_failed_migration_is_fatal_and_rolls_back,
#      test_failed_health_check_rolls_back and
#      test_rollback_pulls_the_previous_digest_when_absent_locally.
#
#   5. A failed migration was "non-fatal" AND the digest was then
#      recorded as deployed, so a broken image was stamped as good and
#      never retried.
#      Covered by test_failed_migration_is_fatal_and_rolls_back.
#
#   6. A failed pull had no coverage at all: recording the new digest
#      without its layers would make every later run believe the app was
#      up to date while the container still ran the old image.
#      Covered by test_failed_pull_aborts_without_advancing_the_digest.
#
#   7. The registry lookup was unbounded: a hung registry could hold a
#      run open past the next timer tick.
#      Covered by test_registry_timeout_fails_instead_of_hanging.
#
#   8. The old state file ($STATE_DIR/<env>.digest) may hold a digest
#      from the other space, and the new per-environment state has to be
#      seeded safely.
#      Covered by test_legacy_index_digest_state_is_not_trusted and
#      test_first_run_seeds_state_from_the_running_container.
#
#   9. The health check has to probe the port the ENVIRONMENT is actually
#      published on (stable→3100, beta→3110, dev→3105). A single
#      hardcoded port probes the wrong application.
#      Covered by test_health_check_uses_the_environment_published_port.
#
# Every test is UNCONDITIONAL. A behaviour that is not implemented yet is
# a FAILURE, never a skip: this suite reports green or red, and it must
# never report green for an implementation that lacks the behaviour it
# claims to have.
#
# Usage:  bash deploy-watch_test.sh
# Exit:   0 = all tests pass, 1 = at least one failure.

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_WATCH_SH="${DEPLOY_WATCH_SH:-$SCRIPT_DIR/../deploy-watch.sh}"

PASS=0
FAIL=0
FAILED_NAMES=()

# ---------------------------------------------------------------------------
# Digests.
#
# INSTANCE   the manifest digest of the linux/amd64 platform entry — the
#            value that must be recorded.
# INDEX      the digest of the OCI index object itself — a DIFFERENT
#            value that must never be recorded or pinned.
# DECOY      the arm64 platform entry — must never be selected.
# ATTEST     the buildx attestation entry (unknown/unknown) — must never
#            be selected.
# ---------------------------------------------------------------------------
INSTANCE="sha256:$(printf '1%.0s' $(seq 64))"
NEW_INSTANCE="sha256:$(printf '2%.0s' $(seq 64))"
PREV="sha256:$(printf '3%.0s' $(seq 64))"
INDEX="sha256:$(printf '4%.0s' $(seq 64))"
DECOY="sha256:$(printf '5%.0s' $(seq 64))"
ATTEST="sha256:$(printf '6%.0s' $(seq 64))"

# The repository the sandbox compose file and the script agree on. The
# fixture and the script MUST name the same repository, otherwise the
# pinning can never match and the whole pinning path is untested.
TEST_IMAGE_REPO="ghcr.io/example/makanan"
TEST_IMAGE_TAG="stable"
TEST_APP_CONTAINER="pesan-makan-app-stable-1"
# The image of the unrelated database service: the pinning must never
# touch it.
TEST_DB_IMAGE="docker.io/library/postgres:16-alpine"
# The image of a DIFFERENT tag of the same repository: the pinning must
# never touch it either (one repository carries several tags).
TEST_OTHER_TAG_IMAGE="$TEST_IMAGE_REPO:beta"

ok()  { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
bad() {
    FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1")
    printf '  FAIL %s\n' "$1"
    [[ $# -gt 1 ]] && printf '       %s\n' "${2:-}"
    return 0
}
# There is deliberately no skip(): a behaviour that is not implemented is a
# failure. A green suite must mean "the behaviour is there".

# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------

new_sandbox() {
    SANDBOX=$(mktemp -d -t "pesan-makan-test-XXXXXX")
    BIN="$SANDBOX/bin"
    HOME_DIR="$SANDBOX/home"
    STATE_DIR="$HOME_DIR/.cache/pesan-makan-deploy"
    REPO_DIR="$SANDBOX/pesan-makan"
    COMPOSE_FILE="$REPO_DIR/docker-compose.yml"

    mkdir -p "$BIN" "$HOME_DIR/.cache" "$STATE_DIR" "$REPO_DIR"

    # The compose file the script rewrites in place. It holds three
    # controls: an unrelated service (the db), another tag of the SAME
    # repository (beta), and the environment's own service (stable).
    cat > "$COMPOSE_FILE" <<EOF
services:
  db-stable:
    image: $TEST_DB_IMAGE
    restart: unless-stopped
  app-beta:
    image: $TEST_OTHER_TAG_IMAGE
    restart: unless-stopped
    ports: ["3110:3000"]
  app-stable:
    image: $TEST_IMAGE_REPO:$TEST_IMAGE_TAG
    restart: unless-stopped
    ports: ["3100:3000"]
EOF

    # The migration script. Its exit code drives the "migration failed"
    # cases.
    cat > "$REPO_DIR/run-migrations.sh" <<'EOF'
#!/usr/bin/env bash
echo "fake migration for ${1:-}"
exit "${MIGRATE_RC:-0}"
EOF
    chmod +x "$REPO_DIR/run-migrations.sh"

    # --- fake podman -------------------------------------------------------
    # Driven by files/vars the test case sets:
    #   PODMAN_CALLS        every argv, one line per call
    #   PODMAN_PULLS       every pull ref, one line per pull
    #   PODMAN_COMPOSE     every compose argv
    #   PODMAN_IMAGES_FILE newline list of locally present digests (bare
    #                      sha256:...) driving the `image inspect`
    #                      presence probes; a successful pull adds to it
    #   PODMAN_LOCAL_DIGEST  instance digest reported for a NAME lookup
    #   PODMAN_DIGEST_BY_ID  digest reported for an image-ID lookup. Real
    #                      podman reports the OCI INDEX digest there, so
    #                      the default mirrors that.
    #   PODMAN_LOCAL_IMAGE_ID image ID of the local image
    #   PODMAN_CONTAINER_IMAGE_NAME image name of the container
    #   PODMAN_CONTAINER_IMAGE_ID   image ID backing the container
    #   PODMAN_MANIFEST_FAIL make `podman manifest inspect` fail
    #   PODMAN_PULL_FAIL   make every pull fail
    #   PODMAN_COMPOSE_RC  exit code of `podman compose`
    #   PODMAN_STATE_<c>   container state: "missing" (default),
    #                      "running-healthy", "running-none", ...
    cat > "$BIN/podman" <<'FAKE_PODMAN'
#!/usr/bin/env bash
set -uo pipefail
printf '%s\n' "$*" >> "${PODMAN_CALLS:-/dev/null}"

digest_present() {
    local d="$1"
    [[ -n "$d" ]] || return 1
    grep -qxF "$d" "${PODMAN_IMAGES_FILE:-/dev/null}" 2>/dev/null
}

cmd="${1:-}"; shift || true

case "$cmd" in
  pull)
      ref="${*: -1}"
      printf '%s\n' "$ref" >> "${PODMAN_PULLS:-/dev/null}"
      if [[ -n "${PODMAN_PULL_FAIL:-}" ]]; then
          echo "Error: unable to pull $ref" >&2
          exit 1
      fi
      if [[ -n "${PULL_FAIL_DIGEST:-}" && "$ref" == *"@${PULL_FAIL_DIGEST}"* ]]; then
          echo "Error: unable to pull $ref" >&2
          exit 1
      fi
      # A successful pull puts the image into the local store.
      if [[ "$ref" == *"@"* ]]; then
          printf '%s\n' "${ref##*@}" >> "${PODMAN_IMAGES_FILE:-/dev/null}"
      fi
      exit 0
      ;;
  tag)
      printf '%s\n' "$*" >> "${PODMAN_TAGS:-/dev/null}"
      exit 0
      ;;
  manifest)
      case "${1:-}" in
        inspect)
            [[ -n "${PODMAN_MANIFEST_FAIL:-}" ]] && exit 1
            cat <<JSON
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.index.v1+json",
  "manifests": [
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "digest": "${FAKE_ATTEST_DIGEST:-}",
      "platform": { "architecture": "unknown", "os": "unknown" }
    },
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "digest": "${FAKE_DECOY_DIGEST:-}",
      "platform": { "architecture": "arm64", "os": "linux" }
    },
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "digest": "${FAKE_INSTANCE_DIGEST:-}",
      "platform": { "architecture": "${FAKE_HOST_ARCH:-amd64}", "os": "linux" }
    }
  ]
}
JSON
            exit 0
            ;;
      esac
      ;;
  image)
      case "${1:-}" in
        inspect)
            shift
            fmt=""; ref=""
            while [[ $# -gt 0 ]]; do
              case "$1" in
                --format|-f) fmt="${2:-}"; shift 2 ;;
                *) ref="$1"; shift ;;
              esac
            done
            if [[ "$ref" == *"@"* ]]; then
                # A digest-pinned reference: it resolves only when the
                # image is in the local store.
                digest_present "${ref##*@}" || exit 1
                if [[ "$fmt" == *"Id"* ]]; then
                    printf '%s\n' "${PODMAN_LOCAL_IMAGE_ID:-fakeimageid}"
                fi
                exit 0
            fi
            if [[ "$fmt" == *"Id"* ]]; then
                # The image ID: the same for every reference to the image.
                printf '%s\n' "${PODMAN_LOCAL_IMAGE_ID:-fakeimageid}"
                exit 0
            fi
            if [[ "$ref" == *:* ]]; then
                # A NAME (repo:tag): real podman reports the INSTANCE
                # manifest digest here.
                printf '%s\n' "${PODMAN_LOCAL_DIGEST:-${FAKE_INSTANCE_DIGEST:-}}"
                exit 0
            fi
            # An image ID without a format: real podman reports the OCI
            # INDEX digest here. The digest of a running container must
            # never be taken from this route.
            printf '%s\n' "${PODMAN_DIGEST_BY_ID:-${FAKE_INDEX_DIGEST:-}}"
            exit 0
            ;;
        ls)
            cat "${PODMAN_IMAGES_FILE:-/dev/null}" 2>/dev/null
            exit 0
            ;;
      esac
      ;;
  inspect)
      c="${*: -1}"
      state_var="PODMAN_STATE_${c//[^A-Za-z0-9_]/_}"
      state="${!state_var:-missing}"
      [[ "$state" == "missing" ]] && exit 1
      case "$*" in
        *"{{.ImageName}}"*) echo "${PODMAN_CONTAINER_IMAGE_NAME:-}"; exit 0 ;;
        *"{{.Image}}"*)     echo "${PODMAN_CONTAINER_IMAGE_ID:-fakeimageid}"; exit 0 ;;
        *".State.Running"*) [[ "$state" == running-* ]] && echo true || echo false; exit 0 ;;
        *"Health.Status"*)  echo "${state#running-}"; exit 0 ;;
      esac
      exit 0
      ;;
  ps)
      printf '%s\n' "${PODMAN_PS_NAMES:-}"
      exit 0
      ;;
  compose)
      printf '%s\n' "$*" >> "${PODMAN_COMPOSE:-/dev/null}"
      exit "${PODMAN_COMPOSE_RC:-0}"
      ;;
  rm)
      printf '%s\n' "$*" >> "${PODMAN_CTR_RM:-/dev/null}"
      exit 0
      ;;
  stop)
      exit 0
      ;;
esac
exit 0
FAKE_PODMAN
    chmod +x "$BIN/podman"

    # --- fake curl ---------------------------------------------------------
    # Dispatches on the URL:
    #   .../token?...      -> a registry token
    #   .../manifests/...  -> a manifest (index or single) plus the
    #                         Docker-Content-Digest header
    #   anything else      -> the health probe
    cat > "$BIN/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -uo pipefail
printf '%s\n' "$*" >> "${CURL_CALLS:-/dev/null}"

url=""; body_out=""; hdr_out=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        -o) body_out="${2:-}"; shift 2 ;;
        -D) hdr_out="${2:-}"; shift 2 ;;
        -w) shift 2 ;;
        -H) shift 2 ;;
        -u) shift 2 ;;
        --max-time) shift 2 ;;
        --connect-timeout) shift 2 ;;
        -fsS|-sS|-s|--silent|--show-error) shift ;;
        -*) shift ;;
        *) url="$1"; shift ;;
    esac
done

# A hung registry.
if [[ -n "${CURL_HANG:-}" ]]; then
    sleep "${CURL_HANG_SLEEP:-600}"
    exit 0
fi

case "$url" in
  *"/token?"*)
      printf '{"token":"fake-registry-token"}\n'
      exit 0
      ;;
  *"/manifests/"*)
      if [[ -n "${CURL_MANIFEST_FAIL:-}" ]]; then
          echo "curl: (22) The requested URL returned error: 401" >&2
          exit 22
      fi
      digest="${FAKE_INDEX_DIGEST:-}"
      if [[ -n "${CURL_SINGLE_MANIFEST:-}" ]]; then
          # A single-manifest tag: the manifest's own digest IS the
          # instance digest and the registry reports it in the header.
          digest="${FAKE_INSTANCE_DIGEST:-}"
      fi
      if [[ -n "$hdr_out" ]]; then
          {
              printf 'HTTP/2 200\r\n'
              printf 'docker-content-digest: %s\r\n' "$digest"
              printf 'content-type: application/vnd.oci.image.index.v1+json\r\n'
              printf '\r\n'
          } > "$hdr_out"
      fi
      if [[ -n "$body_out" ]]; then
          if [[ -n "${CURL_SINGLE_MANIFEST:-}" ]]; then
              printf '%s' '{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json","config":{"digest":"sha256:cfg","size":1},"layers":[]}' > "$body_out"
          else
              cat > "$body_out" <<JSON
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.index.v1+json",
  "manifests": [
    { "digest": "${FAKE_ATTEST_DIGEST:-}",  "platform": { "architecture": "unknown", "os": "unknown" } },
    { "digest": "${FAKE_DECOY_DIGEST:-}",   "platform": { "architecture": "arm64",  "os": "linux" } },
    { "digest": "${FAKE_INSTANCE_DIGEST:-}","platform": { "architecture": "${FAKE_HOST_ARCH:-amd64}", "os": "linux" } }
  ]
}
JSON
          fi
      fi
      exit 0
      ;;
esac

# Health probe: prints the status code.
printf '%s' "${HEALTH_CODE:-200}"
exit "${HEALTH_RC:-0}"
FAKE_CURL
    chmod +x "$BIN/curl"

    export PODMAN_CALLS="$SANDBOX/podman.calls" PODMAN_PULLS="$SANDBOX/podman.pulls"
    export PODMAN_COMPOSE="$SANDBOX/podman.compose" PODMAN_CTR_RM="$SANDBOX/podman.ctrrm"
    export PODMAN_TAGS="$SANDBOX/podman.tags" CURL_CALLS="$SANDBOX/curl.calls"
    export PODMAN_IMAGES_FILE="$SANDBOX/podman.images"
    : > "$PODMAN_CALLS"; : > "$PODMAN_PULLS"; : > "$PODMAN_COMPOSE"
    : > "$PODMAN_CTR_RM"; : > "$PODMAN_TAGS"; : > "$CURL_CALLS"
    : > "$PODMAN_IMAGES_FILE"

    # Reset the per-case knobs so cases cannot leak into each other.
    unset PODMAN_LOCAL_DIGEST PODMAN_DIGEST_BY_ID PODMAN_MANIFEST_FAIL PODMAN_PULL_FAIL \
          PODMAN_COMPOSE_RC PULL_FAIL_DIGEST MIGRATE_RC HEALTH_CODE HEALTH_RC \
          CURL_HANG CURL_HANG_SLEEP CURL_MANIFEST_FAIL CURL_SINGLE_MANIFEST \
          PODMAN_PS_NAMES PODMAN_LOCAL_IMAGE_ID PODMAN_CONTAINER_IMAGE_NAME \
          PODMAN_CONTAINER_IMAGE_ID 2>/dev/null || true

    export FAKE_INSTANCE_DIGEST="$INSTANCE" FAKE_DECOY_DIGEST="$DECOY" \
           FAKE_ATTEST_DIGEST="$ATTEST" FAKE_INDEX_DIGEST="$INDEX" \
           FAKE_HOST_ARCH="amd64"

    # The default world: the stable container is up, running the instance
    # digest, and the image is in the local store.
    printf '%s\n' "$INSTANCE" > "$PODMAN_IMAGES_FILE"
    PODMAN_LOCAL_DIGEST="$INSTANCE"
    PODMAN_DIGEST_BY_ID="$INDEX"
    PODMAN_LOCAL_IMAGE_ID="fakeimageid"
    PODMAN_CONTAINER_IMAGE_NAME="$TEST_IMAGE_REPO:$TEST_IMAGE_TAG"
    PODMAN_CONTAINER_IMAGE_ID="fakeimageid"
    PODMAN_PS_NAMES="$TEST_APP_CONTAINER"
    export PODMAN_LOCAL_DIGEST PODMAN_DIGEST_BY_ID PODMAN_LOCAL_IMAGE_ID \
           PODMAN_CONTAINER_IMAGE_NAME PODMAN_CONTAINER_IMAGE_ID PODMAN_PS_NAMES
    CONTAINER_STATE_VAR="PODMAN_STATE_${TEST_APP_CONTAINER//[^A-Za-z0-9_]/_}"
    export "${CONTAINER_STATE_VAR}=running-none"
}

# run_watch — runs deploy-watch.sh inside the sandbox. Captures rc+output.
run_watch() {
    set +e
    OUT=$(
        PATH="$BIN:$PATH" \
        HOME="$HOME_DIR" \
        STATE_DIR="$STATE_DIR" \
        REPO_DIR="$REPO_DIR" \
        COMPOSE_FILE="$COMPOSE_FILE" \
        PROJECT_NAME="pesan-makan" \
        IMAGE_REPO="$TEST_IMAGE_REPO" \
        IMAGE_TAG="$TEST_IMAGE_TAG" \
        APP_CONTAINER="$TEST_APP_CONTAINER" \
        HEALTH_URL="http://127.0.0.1:3100/" \
        HEALTH_TIMEOUT_S="${HEALTH_TIMEOUT:-4}" \
        HEALTH_INTERVAL_S=1 \
        HEALTH_PROBE_TIMEOUT_S=2 \
        REGISTRY_TIMEOUT_S="${REGISTRY_TIMEOUT:-3}" \
        MANIFEST_TIMEOUT_S="${MANIFEST_TIMEOUT:-3}" \
        bash "$DEPLOY_WATCH_SH" stable 2>&1
    )
    RC=$?
    set -e
}

# seed_state <digest> — write the recorded state of the stable env.
seed_state() {
    mkdir -p "$STATE_DIR/stable"
    printf '%s' "$1" > "$STATE_DIR/stable/deployed-digest"
    chmod 0644 "$STATE_DIR/stable/deployed-digest"
}

# state_digest <name> — the recorded digest ("" when absent).
state_digest() {
    local f="$STATE_DIR/stable/$1"
    [[ -s "$f" ]] || { printf ''; return 0; }
    cat "$f"
}

# compose_image_value <service> — the image VALUE of one service.
compose_image_value() {
    awk -v want="$1" '
        /^[[:space:]]*[A-Za-z0-9_.-]+:[[:space:]]*$/ {
            name = $1
            sub(/:$/, "", name)
            cur = name
            next
        }
        cur == want && /^[[:space:]]*image:[[:space:]]*/ {
            sub(/^[[:space:]]*image:[[:space:]]*/, "")
            sub(/[[:space:]]*$/, "")
            print
            exit
        }
    ' "$COMPOSE_FILE"
}

# any_pull — did the run pull anything at all?
any_pull() { [[ -s "$PODMAN_PULLS" ]]; }

teardown_sandbox() { [[ -n "${SANDBOX:-}" ]] && rm -rf "$SANDBOX"; SANDBOX=""; }

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

test_no_change_does_not_pull() {
    new_sandbox
    seed_state "$INSTANCE"
    run_watch
    local rc="$RC" out="$OUT"
    if [[ "$rc" -ne 0 ]]; then
        bad "no-change does NO pull" "rc=$rc out=$out"; teardown_sandbox; return
    fi
    if any_pull; then
        bad "no-change does NO pull" "pulled: $(tr '\n' ' ' < "$PODMAN_PULLS")"; teardown_sandbox; return
    fi
    if grep -q "image pull" "$PODMAN_CALLS" 2>/dev/null; then
        bad "no-change does NO pull" "podman pull was called"; teardown_sandbox; return
    fi
    if [[ -s "$PODMAN_COMPOSE" ]]; then
        bad "no-change does NO pull" "the container was recreated: $(tr '\n' ' ' < "$PODMAN_COMPOSE")"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$INSTANCE" ]]; then
        bad "no-change does NO pull" "recorded digest changed"; teardown_sandbox; return
    fi
    ok "no-change does NO pull"
    teardown_sandbox
}

test_digest_comes_from_the_manifest_index() {
    new_sandbox
    seed_state "$PREV"
    # The registry publishes an index whose platform entry for this host
    # is the INSTANCE digest; the index digest is a different value.
    run_watch
    local rc="$RC" out="$OUT"
    if [[ "$rc" -ne 0 ]]; then
        bad "digest comes from the manifest (index -> platform instance)" "rc=$rc out=$out"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$INSTANCE" ]]; then
        bad "digest comes from the manifest (index -> platform instance)" \
            "recorded '$(state_digest deployed-digest)', expected the instance digest $INSTANCE"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" == "$INDEX" ]]; then
        bad "digest comes from the manifest (index -> platform instance)" "recorded the INDEX digest"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" == "$DECOY" || "$(state_digest deployed-digest)" == "$ATTEST" ]]; then
        bad "digest comes from the manifest (index -> platform instance)" "recorded a foreign platform entry"; teardown_sandbox; return
    fi
    ok "digest comes from the manifest (index -> platform instance)"
    teardown_sandbox
}

test_container_digest_is_read_in_the_instance_space() {
    new_sandbox
    # The container runs an image that was pulled from an index. Real
    # podman reports the INDEX digest for an image-ID lookup
    # (PODMAN_DIGEST_BY_ID) and the INSTANCE digest for a NAME lookup
    # (PODMAN_LOCAL_DIGEST). The digest of the running container must be
    # taken from the name route: the ID route is the other space and
    # would report "drifted" on every tick.
    run_watch
    local rc="$RC" out="$OUT"
    if [[ "$rc" -ne 0 ]]; then
        bad "the container digest is read in the instance space" "rc=$rc out=$out"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$INSTANCE" ]]; then
        bad "the container digest is read in the instance space" \
            "recorded '$(state_digest deployed-digest)', expected the instance digest $INSTANCE"; teardown_sandbox; return
    fi
    if [[ -s "$PODMAN_COMPOSE" ]]; then
        bad "the container digest is read in the instance space" \
            "the container was recreated although nothing changed"; teardown_sandbox; return
    fi
    ok "the container digest is read in the instance space"
    teardown_sandbox
}

test_compose_is_pinned_to_the_instance_digest_not_the_index() {
    new_sandbox
    seed_state "$PREV"
    run_watch
    local rc="$RC" out="$OUT" value
    if [[ "$rc" -ne 0 ]]; then
        bad "compose is pinned to the INSTANCE digest, not the index digest" "rc=$rc out=$out"; teardown_sandbox; return
    fi
    value=$(compose_image_value app-stable)
    if [[ "$value" != "$TEST_IMAGE_REPO:$TEST_IMAGE_TAG@$INSTANCE" ]]; then
        bad "compose is pinned to the INSTANCE digest, not the index digest" "image line: '$value'"; teardown_sandbox; return
    fi
    if [[ "$value" == *"$INDEX"* ]]; then
        bad "compose is pinned to the INSTANCE digest, not the index digest" "the pin carries the index digest"; teardown_sandbox; return
    fi
    if grep -qF "$INDEX" "$COMPOSE_FILE"; then
        bad "compose is pinned to the INSTANCE digest, not the index digest" "the index digest appears in the compose file"; teardown_sandbox; return
    fi
    ok "compose is pinned to the INSTANCE digest, not the index digest"
    teardown_sandbox
}

test_no_change_tick_pins_the_compose_file() {
    new_sandbox
    # The recorded digest equals the resolved digest -> the NO-CHANGE path.
    # That path must still pin the compose file: an unpinned file means the
    # next `up` would deploy whatever the moving tag points at.
    seed_state "$INSTANCE"
    run_watch
    local rc="$RC" out="$OUT" value
    if [[ "$rc" -ne 0 ]]; then
        bad "no-change tick pins the compose file" "rc=$rc out=$out"; teardown_sandbox; return
    fi
    value=$(compose_image_value app-stable)
    if [[ "$value" != "$TEST_IMAGE_REPO:$TEST_IMAGE_TAG@$INSTANCE" ]]; then
        bad "no-change tick pins the compose file" "image line: '$value'"; teardown_sandbox; return
    fi
    ok "no-change tick pins the compose file"
    teardown_sandbox
}

test_changed_digest_pulls_by_digest_and_repins() {
    new_sandbox
    seed_state "$PREV"
    FAKE_INSTANCE_DIGEST="$NEW_INSTANCE"
    export FAKE_INSTANCE_DIGEST
    run_watch
    local rc="$RC" out="$OUT" value
    if [[ "$rc" -ne 0 ]]; then
        bad "changed digest pulls BY DIGEST and re-pins" "rc=$rc out=$out"; teardown_sandbox; return
    fi
    if ! grep -qF "@$NEW_INSTANCE" "$PODMAN_PULLS"; then
        bad "changed digest pulls BY DIGEST and re-pins" "pulls: $(tr '\n' ' ' < "$PODMAN_PULLS")"; teardown_sandbox; return
    fi
    if grep -qF ":$TEST_IMAGE_TAG" "$PODMAN_PULLS"; then
        bad "changed digest pulls BY DIGEST and re-pins" "the moving tag was pulled: $(tr '\n' ' ' < "$PODMAN_PULLS")"; teardown_sandbox; return
    fi
    value=$(compose_image_value app-stable)
    if [[ "$value" != "$TEST_IMAGE_REPO:$TEST_IMAGE_TAG@$NEW_INSTANCE" ]]; then
        bad "changed digest pulls BY DIGEST and re-pins" "image line: '$value'"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$NEW_INSTANCE" ]]; then
        bad "changed digest pulls BY DIGEST and re-pins" "recorded '$(state_digest deployed-digest)'"; teardown_sandbox; return
    fi
    if [[ "$(state_digest previous-digest)" != "$PREV" ]]; then
        bad "changed digest pulls BY DIGEST and re-pins" "previous-digest is '$(state_digest previous-digest)', expected $PREV"; teardown_sandbox; return
    fi
    ok "changed digest pulls BY DIGEST and re-pins"
    teardown_sandbox
}

test_failed_pull_aborts_without_advancing_the_digest() {
    new_sandbox
    seed_state "$PREV"
    FAKE_INSTANCE_DIGEST="$NEW_INSTANCE"
    export FAKE_INSTANCE_DIGEST
    PULL_FAIL_DIGEST="$NEW_INSTANCE"
    export PULL_FAIL_DIGEST
    run_watch
    local rc="$RC" out="$OUT"
    if [[ "$rc" -eq 0 ]]; then
        bad "failed pull aborts without advancing the recorded digest" "rc=0 out=$out"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$PREV" ]]; then
        bad "failed pull aborts without advancing the recorded digest" "recorded '$(state_digest deployed-digest)', expected the old $PREV"; teardown_sandbox; return
    fi
    if [[ "$(compose_image_value app-stable)" != "$TEST_IMAGE_REPO:$TEST_IMAGE_TAG" ]]; then
        bad "failed pull aborts without advancing the recorded digest" "the compose file was pinned although the pull failed"; teardown_sandbox; return
    fi
    ok "failed pull aborts without advancing the recorded digest"
    teardown_sandbox
}

test_failed_migration_is_fatal_and_rolls_back() {
    new_sandbox
    seed_state "$PREV"
    FAKE_INSTANCE_DIGEST="$NEW_INSTANCE"
    export FAKE_INSTANCE_DIGEST
    MIGRATE_RC=1
    export MIGRATE_RC
    run_watch
    local rc="$RC" out="$OUT" value
    if [[ "$rc" -eq 0 ]]; then
        bad "failed migration is FATAL and rolls back" "rc=0 out=$out"; teardown_sandbox; return
    fi
    value=$(compose_image_value app-stable)
    if [[ "$value" != "$TEST_IMAGE_REPO:$TEST_IMAGE_TAG@$PREV" ]]; then
        bad "failed migration is FATAL and rolls back" "image line after the rollback: '$value' (expected the previous digest $PREV)"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$PREV" ]]; then
        bad "failed migration is FATAL and rolls back" "recorded '$(state_digest deployed-digest)', expected the previous digest $PREV"; teardown_sandbox; return
    fi
    if [[ "$value" == *"$NEW_INSTANCE"* ]]; then
        bad "failed migration is FATAL and rolls back" "the failed build is still pinned"; teardown_sandbox; return
    fi
    ok "failed migration is FATAL and rolls back"
    teardown_sandbox
}

test_failed_health_check_rolls_back() {
    new_sandbox
    seed_state "$PREV"
    FAKE_INSTANCE_DIGEST="$NEW_INSTANCE"
    export FAKE_INSTANCE_DIGEST
    HEALTH_CODE=500
    export HEALTH_CODE
    run_watch
    local rc="$RC" out="$OUT" value
    if [[ "$rc" -eq 0 ]]; then
        bad "failed health check rolls back" "rc=0 out=$out"; teardown_sandbox; return
    fi
    value=$(compose_image_value app-stable)
    if [[ "$value" != "$TEST_IMAGE_REPO:$TEST_IMAGE_TAG@$PREV" ]]; then
        bad "failed health check rolls back" "image line after the rollback: '$value'"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$PREV" ]]; then
        bad "failed health check rolls back" "recorded '$(state_digest deployed-digest)', expected the previous digest $PREV"; teardown_sandbox; return
    fi
    ok "failed health check rolls back"
    teardown_sandbox
}

test_rollback_pulls_the_previous_digest_when_absent_locally() {
    new_sandbox
    seed_state "$PREV"
    # The previous image is NOT in the local store: the rollback has to
    # pull it, otherwise the recreate references an image the host does
    # not have.
    printf '%s\n' "$NEW_INSTANCE" > "$PODMAN_IMAGES_FILE"
    FAKE_INSTANCE_DIGEST="$NEW_INSTANCE"
    export FAKE_INSTANCE_DIGEST
    MIGRATE_RC=1
    export MIGRATE_RC
    run_watch
    local rc="$RC" out="$OUT"
    if [[ "$rc" -eq 0 ]]; then
        bad "rollback pulls the previous digest when it is absent locally" "rc=0 out=$out"; teardown_sandbox; return
    fi
    if ! grep -qF "@$PREV" "$PODMAN_PULLS"; then
        bad "rollback pulls the previous digest when it is absent locally" "pulls: $(tr '\n' ' ' < "$PODMAN_PULLS")"; teardown_sandbox; return
    fi
    if [[ "$(compose_image_value app-stable)" != "$TEST_IMAGE_REPO:$TEST_IMAGE_TAG@$PREV" ]]; then
        bad "rollback pulls the previous digest when it is absent locally" "the compose file was not re-pinned"; teardown_sandbox; return
    fi
    ok "rollback pulls the previous digest when it is absent locally"
    teardown_sandbox
}

test_registry_timeout_fails_instead_of_hanging() {
    new_sandbox
    seed_state "$PREV"
    # Every resolution path is unavailable and the registry hangs.
    CURL_HANG=1 CURL_HANG_SLEEP=600
    PODMAN_MANIFEST_FAIL=1
    PODMAN_PULL_FAIL=1
    export CURL_HANG CURL_HANG_SLEEP PODMAN_MANIFEST_FAIL PODMAN_PULL_FAIL
    local start end elapsed
    start=$(date +%s)
    run_watch
    end=$(date +%s)
    elapsed=$(( end - start ))
    local rc="$RC" out="$OUT"
    if [[ "$elapsed" -gt 45 ]]; then
        bad "registry timeout is a failure, not a hang" "the run took ${elapsed}s (the timer fires every 60s)"; teardown_sandbox; return
    fi
    if [[ "$rc" -eq 0 ]]; then
        bad "registry timeout is a failure, not a hang" "rc=0 out=$out"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$PREV" ]]; then
        bad "registry timeout is a failure, not a hang" "the recorded digest changed"; teardown_sandbox; return
    fi
    ok "registry timeout is a failure, not a hang"
    teardown_sandbox
}

test_single_manifest_image_resolves_without_a_pull() {
    new_sandbox
    seed_state "$PREV"
    # The tag points at a single manifest, not at an index: the manifest's
    # own digest is the instance digest and the registry reports it in the
    # Docker-Content-Digest header.
    CURL_SINGLE_MANIFEST=1
    export CURL_SINGLE_MANIFEST
    run_watch
    local rc="$RC" out="$OUT" value
    if [[ "$rc" -ne 0 ]]; then
        bad "single-manifest image resolves" "rc=$rc out=$out"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$INSTANCE" ]]; then
        bad "single-manifest image resolves" "recorded '$(state_digest deployed-digest)', expected $INSTANCE"; teardown_sandbox; return
    fi
    value=$(compose_image_value app-stable)
    if [[ "$value" != "$TEST_IMAGE_REPO:$TEST_IMAGE_TAG@$INSTANCE" ]]; then
        bad "single-manifest image resolves" "image line: '$value'"; teardown_sandbox; return
    fi
    # The resolution must not have needed a pull of the moving tag.
    if grep -qF ":$TEST_IMAGE_TAG" "$PODMAN_PULLS"; then
        bad "single-manifest image resolves" "the moving tag was pulled: $(tr '\n' ' ' < "$PODMAN_PULLS")"; teardown_sandbox; return
    fi
    ok "single-manifest image resolves"
    teardown_sandbox
}

test_legacy_index_digest_state_is_not_trusted() {
    new_sandbox
    # The legacy state file of the old watcher holds the OCI INDEX digest
    # — a different digest space than the instance digest this script
    # records. It must not drive the change decision: the script would
    # redeploy on every tick.
    mkdir -p "$STATE_DIR"
    printf '%s' "$INDEX" > "$STATE_DIR/stable.digest"
    run_watch
    local rc="$RC" out="$OUT"
    if [[ "$rc" -ne 0 ]]; then
        bad "legacy INDEX-digest state is not trusted" "rc=$rc out=$out"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$INSTANCE" ]]; then
        bad "legacy INDEX-digest state is not trusted" "recorded '$(state_digest deployed-digest)', expected the running instance digest $INSTANCE"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" == "$INDEX" ]]; then
        bad "legacy INDEX-digest state is not trusted" "the index digest was adopted"; teardown_sandbox; return
    fi
    # The legacy file must be left alone: the migration is an operator
    # step, not something a timer tick does behind their back.
    if [[ "$(cat "$STATE_DIR/stable.digest")" != "$INDEX" ]]; then
        bad "legacy INDEX-digest state is not trusted" "the legacy file was modified"; teardown_sandbox; return
    fi
    ok "legacy INDEX-digest state is not trusted"
    teardown_sandbox
}

test_first_run_seeds_state_from_the_running_container() {
    new_sandbox
    # No state at all: the running container is the only source of truth.
    run_watch
    local rc="$RC" out="$OUT"
    if [[ "$rc" -ne 0 ]]; then
        bad "first run seeds the state from the running container" "rc=$rc out=$out"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$INSTANCE" ]]; then
        bad "first run seeds the state from the running container" "recorded '$(state_digest deployed-digest)'"; teardown_sandbox; return
    fi
    if any_pull; then
        bad "first run seeds the state from the running container" "pulled: $(tr '\n' ' ' < "$PODMAN_PULLS")"; teardown_sandbox; return
    fi
    ok "first run seeds the state from the running container"
    teardown_sandbox
}

test_pinning_is_idempotent() {
    new_sandbox
    seed_state "$PREV"
    run_watch
    local first
    first=$(cat "$COMPOSE_FILE")
    run_watch
    if [[ "$(cat "$COMPOSE_FILE")" != "$first" ]]; then
        bad "pinning is idempotent" "the compose file changed on the second run"; teardown_sandbox; return
    fi
    ok "pinning is idempotent"
    teardown_sandbox
}

test_pinning_does_not_touch_another_tag_of_the_same_repository() {
    new_sandbox
    seed_state "$PREV"
    run_watch
    local value
    value=$(compose_image_value app-beta)
    if [[ "$value" != "$TEST_OTHER_TAG_IMAGE" ]]; then
        bad "pinning does not touch another tag of the same repository" "the beta image line became '$value'"; teardown_sandbox; return
    fi
    ok "pinning does not touch another tag of the same repository"
    teardown_sandbox
}

test_pinning_does_not_touch_other_services() {
    new_sandbox
    seed_state "$PREV"
    run_watch
    local value
    value=$(compose_image_value db-stable)
    if [[ "$value" != "$TEST_DB_IMAGE" ]]; then
        bad "pinning does not touch other services" "the db image line became '$value'"; teardown_sandbox; return
    fi
    ok "pinning does not touch other services"
    teardown_sandbox
}

test_state_files_are_0644_without_a_trailing_newline() {
    new_sandbox
    seed_state "$PREV"
    FAKE_INSTANCE_DIGEST="$NEW_INSTANCE"
    export FAKE_INSTANCE_DIGEST
    run_watch
    local f mode size value
    f="$STATE_DIR/stable/deployed-digest"
    if [[ ! -f "$f" ]]; then
        bad "state files are 0644 and have no trailing newline" "the file is missing"; teardown_sandbox; return
    fi
    mode=$(stat -c '%a' "$f")
    if [[ "$mode" != "644" ]]; then
        bad "state files are 0644 and have no trailing newline" "mode is $mode"; teardown_sandbox; return
    fi
    size=$(stat -c '%s' "$f")
    value=$(cat "$f")
    if [[ "$size" -ne ${#value} ]]; then
        bad "state files are 0644 and have no trailing newline" "the file is $size bytes but the value is ${#value} (a trailing newline?)"; teardown_sandbox; return
    fi
    ok "state files are 0644 and have no trailing newline"
    teardown_sandbox
}

test_deploy_records_the_new_digest_only_after_success() {
    new_sandbox
    seed_state "$PREV"
    FAKE_INSTANCE_DIGEST="$NEW_INSTANCE"
    export FAKE_INSTANCE_DIGEST
    run_watch
    local rc="$RC" out="$OUT"
    if [[ "$rc" -ne 0 ]]; then
        bad "deploy records the new digest only after success" "rc=$rc out=$out"; teardown_sandbox; return
    fi
    if [[ "$(state_digest deployed-digest)" != "$NEW_INSTANCE" ]]; then
        bad "deploy records the new digest only after success" "recorded '$(state_digest deployed-digest)'"; teardown_sandbox; return
    fi
    if [[ "$(state_digest previous-digest)" != "$PREV" ]]; then
        bad "deploy records the new digest only after success" "previous-digest is '$(state_digest previous-digest)'"; teardown_sandbox; return
    fi
    if ! grep -qE "[[:space:]]app-stable\$" "$PODMAN_COMPOSE"; then
        bad "deploy records the new digest only after success" "the app service was never recreated"; teardown_sandbox; return
    fi
    ok "deploy records the new digest only after success"
    teardown_sandbox
}

test_deploy_waits_for_the_health_check() {
    new_sandbox
    seed_state "$PREV"
    FAKE_INSTANCE_DIGEST="$NEW_INSTANCE"
    export FAKE_INSTANCE_DIGEST
    run_watch
    if ! grep -qE "127\.0\.0\.1:3100" "$CURL_CALLS"; then
        bad "the deploy verifies the app before recording success" "the health endpoint was never probed"; teardown_sandbox; return
    fi
    ok "the deploy verifies the app before recording success"
    teardown_sandbox
}

test_caller_propagates_the_failure() {
    new_sandbox
    # The caller must not swallow the failure: the systemd unit has to
    # fail so the journal shows it.
    local script="$SANDBOX/deploy-watch-all.sh"
    cat > "$script" <<EOF
#!/usr/bin/env bash
set -uo pipefail
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
rc=0
for ENV in \${DEPLOY_ENVS:-stable}; do
    if ! "\$SCRIPT_DIR/deploy-watch.sh" "\$ENV"; then
        echo "[\$ENV] deploy-watch failed" >&2
        rc=1
    fi
done
exit "\$rc"
EOF
    chmod +x "$script"
    cp "$DEPLOY_WATCH_SH" "$SANDBOX/deploy-watch.sh"
    chmod +x "$SANDBOX/deploy-watch.sh"
    set +e
    OUT=$(PATH="$BIN:$PATH" HOME="$HOME_DIR" STATE_DIR="$STATE_DIR" \
          DEPLOY_ENVS=stable bash "$script" 2>&1)
    local rc=$?
    set -e
    if [[ "$rc" -eq 0 ]]; then
        bad "the caller propagates a failed deploy" "rc=0 out=$OUT"; teardown_sandbox; return
    fi
    ok "the caller propagates a failed deploy"
    teardown_sandbox
}

# The published host port differs per environment: the compose file maps
# stable→3100, beta→3110, dev→3105. A single hardcoded port would probe
# the WRONG application — on beta it would answer on the stable port and
# report the stable app as the beta one.
test_health_check_uses_the_environment_published_port() {
    new_sandbox
    local beta_ctr="pesan-makan-app-beta-1"

    # The beta world: its own container, running the beta tag.
    PODMAN_PS_NAMES="$beta_ctr"
    PODMAN_CONTAINER_IMAGE_NAME="$TEST_IMAGE_REPO:beta"
    export PODMAN_PS_NAMES PODMAN_CONTAINER_IMAGE_NAME
    export "PODMAN_STATE_${beta_ctr//[^A-Za-z0-9_]/_}=running-none"

    # A DIFFERENT recorded digest, so the run takes the deploy path and
    # reaches the health check.
    mkdir -p "$STATE_DIR/beta"
    printf '%s' "$PREV" > "$STATE_DIR/beta/deployed-digest"
    chmod 0644 "$STATE_DIR/beta/deployed-digest"

    # HEALTH_URL is deliberately NOT set: the script's own per-environment
    # default has to be the one that is used.
    set +e
    OUT=$(
        PATH="$BIN:$PATH" \
        HOME="$HOME_DIR" \
        STATE_DIR="$STATE_DIR" \
        REPO_DIR="$REPO_DIR" \
        COMPOSE_FILE="$COMPOSE_FILE" \
        PROJECT_NAME="pesan-makan" \
        IMAGE_REPO="$TEST_IMAGE_REPO" \
        IMAGE_TAG="beta" \
        APP_CONTAINER="$beta_ctr" \
        HEALTH_TIMEOUT_S=4 \
        HEALTH_INTERVAL_S=1 \
        HEALTH_PROBE_TIMEOUT_S=2 \
        REGISTRY_TIMEOUT_S=3 \
        MANIFEST_TIMEOUT_S=3 \
        bash "$DEPLOY_WATCH_SH" beta 2>&1
    )
    RC=$?
    set -e

    if [[ "$RC" -ne 0 ]]; then
        bad "the health check uses the environment's published port" "rc=$RC out=$OUT"; teardown_sandbox; return
    fi
    if ! grep -q '127\.0\.0\.1:3110' "$CURL_CALLS"; then
        bad "the health check uses the environment's published port" "the beta port 3110 was never probed: $(tr '\n' ' ' < "$CURL_CALLS")"; teardown_sandbox; return
    fi
    if grep -q '127\.0\.0\.1:3100' "$CURL_CALLS"; then
        bad "the health check uses the environment's published port" "the stable port 3100 was probed for the beta environment"; teardown_sandbox; return
    fi
    local value
    value=$(compose_image_value app-beta)
    if [[ "$value" != "$TEST_IMAGE_REPO:beta@$INSTANCE" ]]; then
        bad "the health check uses the environment's published port" "app-beta image line: '$value'"; teardown_sandbox; return
    fi
    ok "the health check uses the environment's published port"
    teardown_sandbox
}

# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

run_all() {
    test_no_change_does_not_pull
    test_digest_comes_from_the_manifest_index
    test_container_digest_is_read_in_the_instance_space
    test_compose_is_pinned_to_the_instance_digest_not_the_index
    test_no_change_tick_pins_the_compose_file
    test_changed_digest_pulls_by_digest_and_repins
    test_failed_pull_aborts_without_advancing_the_digest
    test_failed_migration_is_fatal_and_rolls_back
    test_failed_health_check_rolls_back
    test_rollback_pulls_the_previous_digest_when_absent_locally
    test_registry_timeout_fails_instead_of_hanging
    test_single_manifest_image_resolves_without_a_pull
    test_legacy_index_digest_state_is_not_trusted
    test_first_run_seeds_state_from_the_running_container
    test_pinning_is_idempotent
    test_pinning_does_not_touch_another_tag_of_the_same_repository
    test_pinning_does_not_touch_other_services
    test_state_files_are_0644_without_a_trailing_newline
    test_deploy_records_the_new_digest_only_after_success
    test_deploy_waits_for_the_health_check
    test_caller_propagates_the_failure
    test_health_check_uses_the_environment_published_port
}

printf '\n== deploy-watch.sh test suite ==\n'
run_all
printf '\n-- %d passed, %d failed --\n' "$PASS" "$FAIL"

if (( FAIL > 0 )); then
    printf 'failed tests:\n'
    for n in "${FAILED_NAMES[@]}"; do printf '  - %s\n' "$n"; done
    exit 1
fi
exit 0
