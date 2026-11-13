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
# A "disabling profile plugin row" line is its own failure class (the host
# pre-flight gate disabled a plugin over an exact-version conflict — the
# foreign-tower shadowing seen 10-19 and 10-26) even when the boot itself
# would otherwise survive, so it fails the probe explicitly.
boot_smoke() {
  local p="$1" out status
  out=$(timeout 25 dsh --profile "$p" 2>&1)
  status=$?
  if echo "$out" | grep -qi "loader error\|Cannot find module\|ERR_MODULE_NOT_FOUND"; then
    echo "$out" | head -5
    return 1
  fi
  if echo "$out" | grep -qi "disabling profile plugin row"; then
    echo "$out" | grep -i "disabling profile plugin row" | head -3
    return 1
  fi
  if [ "$status" -eq 0 ] || [ "$status" -eq 124 ]; then
    return 0
  fi
  echo "$out" | head -5
  return 1
}

# --- the #3 packaging class: peer auto-install shadowing (static, all pkgs) -
# npm auto-installs HARD peers, resolving them from the stable tower; those
# exact-pinned @deepseek-ai copies then shadow the host closure and the host
# pre-flight gate disables the plugin rows (10-26: cron 0.6.0 red on the
# rc.3 host; 10-19 same class). The fix contract is
# peerDependenciesMeta.optional on every @deepseek-ai peer — llm-proxy 0.7.3
# and tui-pi 2.28.2 shipped it 10-20, cron 0.6.1 on 10-26. This audit sweeps
# EVERY published @aiwayds package because the deep-probe loop below only
# covers four; the list comes live from the registry search API, unioned
# with the built-in baseline so a search outage can only shrink the
# discovery of NEW packages, never drop a known one. Deprecated packages
# are skipped (jev-dispatch predates the contract and points at its
# renamed successor). Any @deepseek-ai peer without optional:true fails.
PEER_AUDIT_BASELINE=(
  "@aiwayds/dsh-agent-dispatch"
  "@aiwayds/dsh-approval-policy"
  "@aiwayds/dsh-ask-router"
  "@aiwayds/dsh-cron"
  "@aiwayds/dsh-dcp"
  "@aiwayds/dsh-feishu"
  "@aiwayds/dsh-jev-core"
  "@aiwayds/dsh-llm-net-retry"
  "@aiwayds/dsh-llm-proxy"
  "@aiwayds/dsh-llm-stats"
  "@aiwayds/dsh-mcp-adapter"
  "@aiwayds/dsh-model-sync"
  "@aiwayds/dsh-profile-switch"
  "@aiwayds/dsh-self-improve"
  "@aiwayds/dsh-subagent-registry"
  "@aiwayds/dsh-topics-memory"
  "@aiwayds/dsh-tui-pi"
  "@aiwayds/dsh-vault"
  "@aiwayds/dsh-web-search-anysearch"
  "@aiwayds/dsh-web-search-tavily"
)

discover_scope_packages() {
  npm search "aiwayds" --json --searchlimit=100 --registry="$REGISTRY" 2>/dev/null \
    | node -e '
        let s = "";
        process.stdin.on("data", (d) => (s += d));
        process.stdin.on("end", () => {
          try {
            const rows = JSON.parse(s);
            for (const r of rows) if (typeof r.name === "string" && r.name.startsWith("@aiwayds/")) console.log(r.name);
          } catch { /* search outage — the union with the baseline below still runs */ }
        });
      '
}

# audit_peer_meta <pkg> — echo OK / SKIP(deprecated) / VIOLATION:...
# npm view collapses a multi-field query to the bare value of the single
# existing field when the others are absent (cron 0.6.0: no deprecated, no
# meta → the JSON IS the peers object), so the parser detects that bare
# shape — top-level keys look like "@scope/name" — and wraps it. The
# deprecation check rides a separate one-field call for the same reason.
# The body runs inside an IIFE because node -e rejects a top-level return.
audit_peer_meta() {
  node -e '
    (() => {
    const { execFileSync } = require("child_process");
    // node -e has no script path in process.argv: argv[1] and argv[2] are the
    // first two args after the -e script itself.
    const pkg = process.argv[1];
    const registry = process.argv[2];
    const view = (fields) => execFileSync("npm",
      ["view", pkg, ...fields, "--json", "--registry", registry],
      { encoding: "utf8", timeout: 45000 });
    let raw;
    try { raw = view(["deprecated"]); } catch { raw = ""; }
    if (raw.trim().startsWith("\"")) {
      console.log("SKIP(deprecated)"); return;
    }
    let parsed;
    try { parsed = JSON.parse(view(["peerDependencies", "peerDependenciesMeta"])); } catch (e) {
      // Two classes land here: a package with no peers at all (field missing,
      // npm exits non-zero) and a registry/network failure. The latter must
      // NOT read as OK — a silent audit is a false green.
      const errText = String((e && e.stderr) || "") + String((e && e.stdout) || "") + String((e && e.message) || "");
      if (/ETIMEDOUT|ENOTFOUND|ECONNRESET|EAI_AGAIN|network/i.test(errText)) {
        console.log("VIOLATION: cannot read package metadata from the registry (npm view failed: " + String((e && e.message) || "").split("\n")[0] + ")");
        return;
      }
      console.log("OK"); return;
    }
    const looksBare = Object.keys(parsed).length > 0
      && Object.keys(parsed).every((k) => k.includes("/"));
    const peers = looksBare ? parsed : (parsed.peerDependencies || {});
    const opt = looksBare ? {} : (parsed.peerDependenciesMeta || {});
    const hard = Object.keys(peers).filter((p) => p.startsWith("@deepseek-ai/") && !(opt[p] && opt[p].optional));
    if (hard.length === 0) { console.log("OK"); return; }
    console.log("VIOLATION: hard @deepseek-ai peers auto-install from the stable tower and shadow the host closure: " + hard.map((p) => p + "@" + peers[p] + " (optional:" + (opt[p] && opt[p].optional ? "true" : "false") + ")").join(", "));
    })();
  ' "$1" "$REGISTRY"
}

note "peer-meta audit — every published @aiwayds package (the #3 class: hard peers shadow the host closure)"
SEARCHED="$(discover_scope_packages | sort -u)"
PEER_PACKAGES="$( { printf '%s\n' "${PEER_AUDIT_BASELINE[@]}"; [ -n "$SEARCHED" ] && printf '%s\n' "$SEARCHED"; } | sort -u )"
AUDIT_TOTAL=0
AUDIT_SKIP=0
AUDIT_BAD=0
while IFS= read -r pkg; do
  [ -n "$pkg" ] || continue
  AUDIT_TOTAL=$((AUDIT_TOTAL + 1))
  verdict="$(audit_peer_meta "$pkg")"
  case "$verdict" in
    OK) : ;;
    SKIP*) AUDIT_SKIP=$((AUDIT_SKIP + 1)); ;;
    VIOLATION*)
      AUDIT_BAD=$((AUDIT_BAD + 1))
      fail "peer audit: $pkg — $(printf '%s' "$verdict" | sed 's/^VIOLATION: //')"
      ;;
    *)
      # An empty/unknown verdict means the auditor itself crashed — that must
      # never read as a pass, or the sweep dies into a false green.
      AUDIT_BAD=$((AUDIT_BAD + 1))
      fail "peer audit: $pkg — unreadable verdict (auditor crashed), package unverified"
      ;;
  esac
done <<EOF
$PEER_PACKAGES
EOF
if [ "$AUDIT_BAD" -eq 0 ]; then
  ok "peer audit: $AUDIT_TOTAL packages swept ($AUDIT_SKIP deprecated skipped), zero hard @deepseek-ai peers"
else
  fail "peer audit: $AUDIT_BAD of $AUDIT_TOTAL packages violate the optional-peer contract (see the FAIL lines above)"
fi

# --- the #2/#10 packaging class: one probe per fixed plugin, versions live ---
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

  # #10: pnpm 11 (strictDepBuilds) fails an install whose dependency carries
  # an unapproved preinstall/install/postinstall, and the host plugin manager
  # rolls the update back (ERR_PNPM_IGNORED_BUILDS). The published manifest of
  # this plugin must therefore carry none of the three keys. `prepare` is
  # carried but never executed for a registry dependency, so it is not gated.
  if [ "$pkg" = "@aiwayds/dsh-subagent-registry" ]; then
    if ! scripts_json="$(npm view "$pkg@$ver" scripts --json --registry="$REGISTRY" 2>/dev/null)"; then
      fail "cannot read $pkg@$ver scripts from $REGISTRY (network/registry problem — NOT classified as a packaging regression)"
    elif echo "$scripts_json" | grep -Eq '^[[:space:]]*"(preinstall|install|postinstall)"[[:space:]]*:'; then
      fail "$pkg@$ver published manifest carries an install lifecycle hook — pnpm 11 strictDepBuilds raises ERR_PNPM_IGNORED_BUILDS and the plugin manager rolls the update back (#10)"
    else
      ok "$pkg@$ver published manifest carries no preinstall/install/postinstall hook (#10)"
    fi
  fi

  P="$WORK/$name"
  if install_published "$pkg" "$ver" "$P"; then
    ok "npm install with lifecycle scripts exited 0"
  fi
  if [ ! -e "$P/node_modules/$pkg/node_modules/@deepseek-ai" ] && [ ! -d "$P/node_modules/@deepseek-ai" ]; then
    ok "closure linker stood down; consumer tree carries no @deepseek-ai tower (nested + top level)"
  else
    fail "@deepseek-ai materialized in the consumer tree (nested: $( [ -e "$P/node_modules/$pkg/node_modules/@deepseek-ai" ] && echo yes || echo no), top-level: $( [ -d "$P/node_modules/@deepseek-ai" ] && echo yes || echo no)) — foreign-tower shadowing, the 10-19/10-26 class"
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
