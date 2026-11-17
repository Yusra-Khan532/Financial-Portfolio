#!/usr/bin/env bash
# Tests deploy.sh's pull_prebuilt (the image GitHub builds, .github/workflows/platform-image.yml) with a fake docker and a real git checkout: no docker,
# no network. The function is taken from deploy.sh as it is.  Run:  bash deploy/aws/test-prebuilt-image.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
fails=0
ok() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1: expected [$2], got [$3]"; fails=$((fails + 1)); fi; }

SRC="$T/src"; git init -q "$SRC"; git -C "$SRC" -c user.email=t@t -c user.name=t commit -q --allow-empty -m one
FULL="$(git -C "$SRC" rev-parse HEAD)"; SHORT="$(git -C "$SRC" rev-parse --short=7 HEAD)"
mkdir -p "$T/bin"
cat > "$T/bin/docker" <<FAKE
#!/usr/bin/env bash
echo "\$*" >> "$T/calls"
case "\$1" in
  pull) [ "\${FAKE_PULL:-ok}" = ok ] ;;
  image) echo "\${FAKE_LABEL:-$SHORT}" ;;
  tag|rmi) exit 0 ;;
esac
FAKE
chmod +x "$T/bin/docker"; export PATH="$T/bin:$PATH"

IMAGE=finlit-app ENV_FILE="$T/env"; : > "$ENV_FILE"
info() { :; }
envval() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-; }
eval "$(sed -n '/^PREBUILT_REPO_DEFAULT=/,/^}/p' "$HERE/deploy.sh")"
sleep() { :; }
calls() { [ -f "$T/calls" ] && tr '\n' ';' < "$T/calls" | sed 's/;$//'; rm -f "$T/calls"; }

pull_prebuilt "$FULL"; r=$?
ok "the image GitHub built for this commit is used: no build here" "0" "$r"
ok "  pulled by the full commit, named finlit-app:current, the extra name removed" \
   "pull -q ghcr.io/yusra-khan532/finlit-app:$FULL;image inspect -f {{index .Config.Labels \"finlit.commit\"}} ghcr.io/yusra-khan532/finlit-app:$FULL;tag ghcr.io/yusra-khan532/finlit-app:$FULL finlit-app:current;rmi ghcr.io/yusra-khan532/finlit-app:$FULL" "$(calls)"

FAKE_LABEL=abcdef0 pull_prebuilt "$FULL"; r=$?
ok "an image labelled with another commit is not used (the server builds)" "1" "$r"; calls >/dev/null

PREBUILT_WAIT_SECONDS=60 FAKE_PULL=no pull_prebuilt "$FULL"; r=$?
ok "no image after the wait: the server builds it itself, as before" "1" "$r"
ok "  it asked again while waiting (every 30 seconds)" "3" "$(calls | tr ';' '\n' | grep -c '^pull')"

echo "FINLIT_PULL_IMAGE=0" > "$ENV_FILE"
pull_prebuilt "$FULL"; r=$?
ok "switched off in the env file: no download at all" "1:" "$r:$(calls)"

echo "FINLIT_IMAGE_REPO=example.org/x/finlit-app" > "$ENV_FILE"
pull_prebuilt "$FULL" >/dev/null; calls | grep -q "pull -q example.org/x/finlit-app:$FULL"; ok "another image name can be set in the env file" "0" "$?"

[ "$fails" -eq 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
