#!/usr/bin/env bash
# In-container entry for the podman install-integration suite. See run.sh
# (host side) for the suite's purpose. One failing assertion fails the run.
#
# Runs inside the podman image AND bare on any Linux with node >=22 plus the
# global dsh CLI (the weekly scheduled workflow takes the bare path; the
# Containerfile is just the purification chamber for the local run).
set -u

# All probe profiles live at $DSH_HOME/profiles/<name>; dsh resolves them
# from DSH_HOME (the dsh home itself, not the user home).
export DSH_HOME="${DSH_HOME:-/work}"
WORK="$DSH_HOME/profiles"

REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"
PASS=0
FAIL=0
DIR="$(cd "$(dirname "$0")" && pwd)"

ok()   { PASS=$((PASS + 1)); echo "  ok  - $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL - $1"; }

note() { printf '==> %s\n' "$1"; }

# resolve_latest <pkg> — echo the published @latest version, fail-loud.
# Versions come from the live registry on every run: a hardcoded pin would
# silently test stale tarballs the moment the next version ships (the exact
# staleness this suite exists to prevent).
resolve_latest() {
  local v
  v=$(npm view "$1" version --registry="$REGISTRY" 2>/dev/null) || {
    fail "cannot resolve $1@latest from $REGISTRY (network/registry problem — NOT classified as a packaging regression)"
    return 1
  }
  if [ -z "$v" ]; then
    fail "empty version for $1@latest"
    return 1
  fi
  echo "$v"
}

# version_ge <version> <floor> — dot-compare for final releases (both sides
# come from @latest/floor literals; prerelease handling lives in run.sh's
# host-version chooser, where it actually matters).
version_ge() {
  node -e '
    const [v, f] = process.argv.slice(1)
    const parts = (s) => s.split(".").map((n) => parseInt(n, 10) || 0)
    const a = parts(v), b = parts(f)
    for (let i = 0; i < 3; i++) {
      if ((a[i] || 0) !== (b[i] || 0)) { process.exit((a[i] || 0) > (b[i] || 0) ? 0 : 1) }
    }
    process.exit(0)
  ' "$1" "$2"
}

# install_published <pkg> <version> <dir> — the consumer path with lifecycle
# scripts ON: a plain npm install of the published version. MODULE_NOT_FOUND
# here is the #2 class, again; anything else (network etc.) is classified
# separately so a registry hiccup does not masquerade as a regression.
install_published() {
  local pkg="$1" ver="$2" dir="$3" status
  mkdir -p "$dir"
  cat > "$dir/package.json" <<EOF
{ "name": "install-probe", "private": true, "dependencies": { "$pkg": "$ver" } }
EOF
  (cd "$dir" && npm install --no-audit --no-fund --loglevel=error --registry="$REGISTRY" >"$dir/install.log" 2>&1)
  status=$?
  if [ "$status" -eq 0 ]; then
    return 0
  fi
  if grep -q "MODULE_NOT_FOUND" "$dir/install.log" 2>/dev/null; then
    fail "$pkg@$ver npm install failed with MODULE_NOT_FOUND — #2-class regression (lifecycle target missing from the tarball)"
  else
    fail "$pkg@$ver npm install failed (exit $status, network/registry class — tail below)"
    tail -3 "$dir/install.log"
  fi
  return 1
}

# seed_profile <dir> <bundle> [patch-yml]
# Minimal dsh profile: empty root config, the bundle in dsh.profile.bundles,
# optionally an id-targeted config patch (the #1 reporter's bypass shape).
seed_profile() {
  local dir="$1" bundle="$2" patch="${3:-}"
  printf '# profile root — composed from bundles\n[]\n' > "$dir/cordis.yml"
  printf '# no extra patch layer\n[]\n' > "$dir/cordis.patch.yml"
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$dir/package.json', 'utf8'));
    pkg.dsh = { profile: { bundles: ['@deepseek-ai/dsh-base', '$bundle'] } };
    fs.writeFileSync('$dir/package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  if [ -n "$patch" ]; then
    cp "$patch" "$dir/cordis.patch.yml"
  fi
}

# boot_smoke <profile-name>
# Real boot: silent survival to the timeout = healthy; a fast death WITHOUT
# a loader error is unexpected; any loader error text = broken plugin tree.
boot_smoke() {
  local p="$1" out status
  out=$(timeout 25 dsh --profile "$p" 2>&1)
  status=$?
  if echo "$out" | grep -qi "loader error\|Cannot find module\|ERR_MODULE_NOT_FOUND"; then
    echo "$out" | head -5
    return 1
  fi
  if [ "$status" -eq 0 ] || [ "$status" -eq 124 ]; then
    return 0
  fi
  echo "$out" | head -5
  return 1
}

# --- the #2 packaging class: one probe per fixed plugin, versions live ------
# Floors = the versions that carried the fix; a resolved latest below its
# floor means the registry answered with something stale — treat as an error,
# not a pass.
PACKAGES=(
  "@aiwayds/dsh-subagent-registry:0.13.1"
  "@aiwayds/dsh-cron:0.5.1"
  "@aiwayds/dsh-llm-proxy:0.7.1"
  "@aiwayds/dsh-profile-switch:0.3.1"
)

for entry in "${PACKAGES[@]}"; do
  pkg="${entry%%:*}"
  floor="${entry##*:}"
  name="${pkg#*/}"
  ver="$(resolve_latest "$pkg")" || continue
  if version_ge "$ver" "$floor"; then
    note "$pkg@$ver (floor $floor) — npm lifecycle install (the #2 crash step)"
  else
    fail "$pkg resolved $ver, below the fix floor $floor — registry answered stale"
    continue
  fi

  P="$WORK/$name"
  if install_published "$pkg" "$ver" "$P"; then
    ok "npm install with lifecycle scripts exited 0"
  fi
  if [ ! -e "$P/node_modules/$pkg/node_modules/@deepseek-ai" ]; then
    ok "closure linker stood down in the consumer tree"
  else
    fail "linker materialized @deepseek-ai inside the consumer package"
  fi
  seed_profile "$P" "$pkg"
  if dsh --profile "$name" --dump-config 2>/dev/null | grep -q "$name"; then
    ok "dump-config composes the plugin"
  else
    fail "dump-config does not contain the plugin"
  fi
  if boot_smoke "$name"; then ok "real-host boot clean"; else fail "real-host boot"; fi
done

# --- dsh-dcp: schema default (#1) under the real host -----------------------
# Versions live like the loop above; the floor is the fix version.
DCP_FLOOR="0.13.1"
dcp_ver="$(resolve_latest "@aiwayds/dsh-dcp")" || dcp_ver=""
if [ -n "$dcp_ver" ]; then
  if version_ge "$dcp_ver" "$DCP_FLOOR"; then
    note "@aiwayds/dsh-dcp@$dcp_ver (floor $DCP_FLOOR) — npm lifecycle install + config semantics (#1)"
  else
    fail "@aiwayds/dsh-dcp resolved $dcp_ver, below the fix floor $DCP_FLOOR"
    dcp_ver=""
  fi
fi

if [ -n "$dcp_ver" ]; then
  P="$WORK/dcp"
  if install_published "@aiwayds/dsh-dcp" "$dcp_ver" "$P"; then
    ok "npm install with lifecycle scripts exited 0"
  fi
  seed_profile "$P" "@aiwayds/dsh-dcp"
  DUMP="$(dsh --profile dcp --dump-config 2>/dev/null || true)"
  if echo "$DUMP" | grep -q "dsh-dcp"; then
    ok "dump-config composes the plugin"
  else
    fail "dump-config does not contain the plugin"
  fi
  # The schema default itself: dump-config shows the composed patch layer only
  # — the materialized result is not observable from outside the engine
  # process (the host materializes plugin config through the plugin's own
  # schema when cordis applies the entry at boot; the outcome only shows up
  # in what the engine holds at runtime). So assert on the INSTALLED copy —
  # the exact artifact the host will load — carrying the shared default
  # constant, and cover the dynamic side through the explicit-empty profile
  # below (real patch layer, real resolver) plus the unit suite.
  if grep -q "export const PROTECTED_TOOLS" "$P/node_modules/@aiwayds/dsh-dcp/lib/config.js" \
     && grep -q 'default(\[...PROTECTED_TOOLS\])' "$P/node_modules/@aiwayds/dsh-dcp/lib/index.js"; then
    ok "installed copy carries the shared protectedTools schema default (#1)"
  else
    fail "installed dcp lacks the schema default (#1 regression)"
  fi
  # Explicit-empty semantics: the reporter's own patch shape must keep [].
  P2="$WORK/dcp-empty"
  install_published "@aiwayds/dsh-dcp" "$dcp_ver" "$P2" || fail "explicit-empty profile install failed"
  seed_profile "$P2" "@aiwayds/dsh-dcp" "$DIR/dcp-empty-patch.yml"
  DUMP2="$(dsh --profile dcp-empty --dump-config 2>/dev/null || true)"
  if echo "$DUMP2" | grep -qE "protectedTools.*\[\]"; then
    ok "explicit protectedTools: [] stays empty through the real patch layer (protect-nothing preserved)"
  else
    fail "explicit [] was overridden (semantics lost)"
  fi
  if boot_smoke dcp; then ok "real-host boot clean"; else fail "real-host boot"; fi
fi

echo ""
note "podman-install integration: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
