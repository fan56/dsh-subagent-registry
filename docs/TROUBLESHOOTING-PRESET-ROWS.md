# Troubleshooting: agent-preset support rows (issue #9)

Since 0.19.1 this bundle no longer declares its two agent-preset **service**
rows statically in `cordis.patch.yml`:

| row id | role |
| --- | --- |
| `agent-preset-registry` | the preset registry service (`default: native`) |
| `subagent-model-selection-settings` | the host-scope model-selection service |

The plugin mounts both at runtime on the profile's include tree
(`src/preset-mount.ts`), and only when the tree does not already carry the
same ids. The two **preset** rows (`preset-native`, `preset-codemode`) stay
in the static patch but carry a `disabled` guard that turns them off on any
profile whose started bundles include `@deepseek-ai/dsh-web-app`.

This split exists because of issue #9: on a profile that also selects
`@deepseek-ai/dsh-web-app` (which declares rows with the same ids and
names), a static same-id insert from a later patch layer silently replaces
the earlier row wholesale. That both flipped the web profile's default
preset from `standard` to `native` (dropping the base tools) and wedged
`dsh plugin remove` into a permanent `bundle-in-use` failure — the manager
matches its in-use check against the bundle patch file's declared rows, and
the web-app's live rows matched them forever.

## What "normal" looks like after 0.19.1

On a healthy profile the two service rows are **absent** from static
composition output. This is expected, not a regression:

```sh
dsh --profile <name> --dump-config | grep -E 'agent-preset-registry|subagent-model-selection-settings'
# (no output on a profile whose root config has no journal residue — normal)
```

Likewise, the plugin manager's bundle view (`dsh plugin` operations, the
Plugins page) no longer lists those two rows under this package's
contributions. The bundle-in-use check therefore compares only the rows the
patch really declares (`dsh-subagent-registry`, `preset-native`,
`preset-codemode`), which is exactly why removal no longer deadlocks on
web/desktop profiles.

What you should still see in the static dump:

- the main row `- id: dsh-subagent-registry`;
- both guarded preset rows `- id: preset-native` / `- id: preset-codemode`,
  each carrying
  `disabled: !!js "ctx.get('profileContext')?.startedBundles?.includes('@deepseek-ai/dsh-web-app') ?? false"`.

## Confirming the runtime mount succeeded

The dump only proves composition, never mounting. Use one of the channels
below.

### Any profile: settings namespaces

The rows mount on the include tree precisely so the settings surface can
address them (namespace = entry id). After one successful boot, the two
namespaces exist:

- `agent-preset-registry` — volatile field `selectedDefault` (writes read
  back through `settings.describe` / the settings UI);
- `subagent-model-selection-settings` — volatile fields `enabled`,
  `allowedModels`.

If either namespace is missing from the settings surface while
`preset-native`/`preset-codemode` are composed, the mount did not run —
check the boot log for
`dsh-subagent-registry: failed to mount preset support row`.

### Any profile: journal probe (raw signal)

The include tree journals runtime creates into the profile root config.
Boot the profile, stop it abruptly (SIGKILL / hard kill while running), then:

```sh
grep -E 'id: (agent-preset-registry|subagent-model-selection-settings)' ~/.dsh/profiles/<name>/cordis.yml
```

Both ids present = the mount executed and persisted. After a **clean**
shutdown the teardown removes them again, so an empty file after a clean
exit proves nothing either way. Stranded rows are safe: their module names
resolve through the host closure, and the next boot adopts them instead of
mounting duplicates (the mount is idempotent by id).

### Web profile: runtime HTTP API

Boot with an explicit port and grab the printed token URL:

```sh
dsh --profile <name> --no-open --port 8799
# stdout carries: http://127.0.0.1:8799/?token=<launch-token>
```

Exchange the token for an API operator cookie, then call the remote
methods (zero LLM traffic — these are plain host RPCs):

```sh
curl -sS -c /tmp/dsh-cookies.txt "http://127.0.0.1:8799/connect?token=<launch-token>&interactions=none" -o /dev/null
curl -sS -b /tmp/dsh-cookies.txt -H 'content-type: application/json' \
  -d '{"type":"client-request","rpcId":"probe-1","method":"agentPresets/list","payload":{"args":[]}}' \
  http://127.0.0.1:8799/api/agentPresets/list
```

Expected on a web profile (guard active):

- `agentPresets/list` returns the web-app's own roster
  (`standard` / `ptc` / `minimal`, default `standard`) with **no**
  `native` / `codemode` entries;
- `settings/describe` carries exactly one `agent-preset-registry` entry,
  owned by the web-app's row.

Expected on a tui/headless-shaped profile (guard inactive): the list
contains `native` (default) and `codemode`, and both settings namespaces
resolve to the runtime-mounted rows.

## Recovering a profile wedged by 0.19.0 or older

Symptom: `dsh plugin --profile <name> remove @aiwayds/dsh-subagent-registry`
fails forever with `bundle-in-use` (or `stop-profile` first, then
`bundle-in-use`), while the profile also runs `@deepseek-ai/dsh-web-app`.
Older versions declared the two colliding service rows in their patch file,
so the check matches the web-app's live rows and can never pass. Upgrading
the package alone does not unwedge an already-selected profile — remove the
bundle by hand first:

1. **Stop the profile** (no session running; the desktop app fully quit).
2. **Edit the bundle selection** in `~/.dsh/profiles/<name>/package.json`:
   remove `"@aiwayds/dsh-subagent-registry"` from `dsh.profile.bundles`,
   and remove its entry from `dependencies`.
3. **Reconcile the install** from the profile directory:

   ```sh
   dsh plugin --profile <name> install
   ```

4. **Prune leftovers from the root config** `~/.dsh/profiles/<name>/cordis.yml`:
   delete any entry whose `name` is `@aiwayds/dsh-subagent-registry`
   (ids `dsh-subagent-registry`, `preset-native`, `preset-codemode`) — these
   belong to the patch layer you just dropped. Entries named
   `@deepseek-ai/dsh-agent-preset-registry` /
   `@deepseek-ai/dsh-tool-subagent/model-selection-settings` belong to the
   web-app: **keep** them on a web profile, keep them on a tui profile only
   if you still want the preset layer without this bundle.
5. **Verify** the tree is clean:

   ```sh
   dsh --profile <name> --dump-config | grep dsh-subagent-registry
   # no output
   ```

6. Reinstall the fixed version when ready:

   ```sh
   dsh plugin --profile <name> add @aiwayds/dsh-subagent-registry@0.19.1
   ```

   Reinstalling is idempotent: on a web profile the runtime mount sees the
   web-app's rows and skips; on a tui/headless profile it mounts its own.
