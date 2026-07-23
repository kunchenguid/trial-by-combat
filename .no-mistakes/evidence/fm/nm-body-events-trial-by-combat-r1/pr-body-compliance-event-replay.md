# PR body compliance event replay

Validated target commit `26ce78681ec3deabafa2dcedc31095a93c341216` against base
`d8085ed0b0d814cb33a1395db9df0eddde711a55`.

## End-user event sequence

The workflow concurrency expression was evaluated for three consecutive PR body
events and the two retained head-change events:

```text
opened signed          group=no-mistakes-required-42-91001
edited unsigned        group=no-mistakes-required-42-91002
edited signed replay   group=no-mistakes-required-42-91003
synchronize            group=no-mistakes-required-42-head-change
reopened               group=no-mistakes-required-42-head-change
grouping result: body events immutable; head-change events coalesced
```

Each body event has its own immutable run-id group, so none can replace another
pending body check. Synchronize and reopened retain the shared `head-change`
group and therefore remain coalesced.

The workflow's exact fixed-string signature test produced a terminal result for
each body version:

```text
opened signed          terminal=success
edited unsigned        terminal=failure
edited signed replay   terminal=success
```

## Syntax and preserved invariants

Ruby Psych parsed the workflow successfully:

```text
YAML syntax: valid
```

A focused base-to-target comparison confirmed:

```text
preserved: trigger
preserved: permissions
preserved: cancel
preserved: stableCheck
preserved: signature
preserved: noCheckout
preserved: noSecrets
preserved: pullRequestNotTarget
scope: only intended workflow semantics changed
```

This preserves `pull_request` fork isolation, `contents: read`, no checkout or
secret access, the stable check name and signature marker, and
`cancel-in-progress: true`.

## Remote status

At validation time, GitHub reported no PR and no workflow runs for
`fm/nm-body-events-trial-by-combat-r1`. The required shipped PR and green
repository CI therefore cannot yet be evidenced by this local validation.
