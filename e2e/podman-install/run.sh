#!/usr/bin/env bash
# Podman install-integration suite for the #2 packaging class (registry#2
# and the three sibling fixes) plus dcp#1's schema default semantics.
#
# Why this exists: every gate these fixes shipped through (npm-ci unit
# chains, tarball installs on the host, boot smokes) missed the original
# breakage because none of them combined [published tarball] x [npm-class
# client with lifecycle scripts] x [real dsh host] in one place. This suite
# is exactly that intersection, in a container.
#
# Coverage: the five plugins listed in entry.sh (at their LIVE @latest, with
# fix-version floors). Not covered: dsh-feishu / dsh-web-search-anysearch
# surfaces (other repos), live-session materialization observability.
#
# Run from the repo root on the macOS host (podman machine must be up):
#   e2e/podman-install/run.sh
# The weekly scheduled workflow (.github/workflows/e2e-install.yml) runs the
# same assertions bare on ubuntu-24.04 (no podman needed on Linux).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$DIR/../.." && pwd)"
IMAGE="localhost/dsh-podman-install:latest"
REGISTRY="https://registry.npmjs.org"

# Host floor is >=0.2.0-rc.2 across the wave; roll latest vs next keeping the
# NEWER. Prerelease-aware comparison via node: sort -V ranks 0.2.0-rc.2 ABOVE
# 0.2.0 (verified), which would silently pick the older rc once a stable
# 0.2.0 ships.
STABLE="$(npm view @deepseek-ai/dsh@latest version --registry="$REGISTRY" 2>/dev/null || true)"
RC="$(npm view @deepseek-ai/dsh@next version --registry="$REGISTRY" 2>/dev/null || true)"
DSH_VERSION=$(STABLE="$STABLE" RC="$RC" node -e '
  const cmp = (x, y) => {
    const parse = (v) => {
      const [core, pre] = v.split("-")
      const c = core.split(".").map(Number)
      while (c.length < 3) c.push(0)
      return { c, pre }
    }
    const A = parse(x), B = parse(y)
    for (let i = 0; i < 3; i++) if (A.c[i] !== B.c[i]) return A.c[i] - B.c[i]
    if ((A.pre === undefined) !== (B.pre === undefined)) return A.pre === undefined ? 1 : -1
    return String(A.pre ?? "").localeCompare(String(B.pre ?? ""))
  }
  const s = process.env.STABLE || "", r = process.env.RC || ""
  if (!s && !r) { console.error("cannot resolve @deepseek-ai/dsh from latest/next — network?"); process.exit(1) }
  console.log(!s ? r : !r ? s : (cmp(s, r) >= 0 ? s : r))
')
echo "==> host dsh for the image: ${DSH_VERSION} (latest=${STABLE:-none}, next=${RC:-none})"

echo "==> building the image"
podman build -f "$DIR/Containerfile" -t "$IMAGE" --build-arg "DSH_VERSION=$DSH_VERSION" "$DIR"

echo "==> running the install-integration suite"
# --replace: a hard-killed earlier run leaves the name behind and would fail
# the next run on a name conflict. No volume on /work — fresh probes per run.
podman run --rm --replace --name dsh-podman-install \
  -v "$DIR:/e2e:ro" \
  "$IMAGE"

echo "==> podman install-integration finished OK"
