# Contributing

Thanks for wanting to contribute. One rule up front:

**Human-authored pull requests targeting `main` must be raised through [`no-mistakes`](https://github.com/kunchenguid/no-mistakes).**
We require this to reduce the maintainer's burden of reviewing and merging contributions.

`no-mistakes` puts a local git proxy in front of your real remote. Pushing through it runs an AI-driven review/test/lint pipeline in an isolated worktree, forwards the push upstream only after every check passes, and opens a clean PR automatically.

A GitHub Actions check (`Require no-mistakes`) runs on PRs targeting `main` and requires the deterministic signature and structured pipeline attestation that no-mistakes writes, with the required pipeline steps completed. Release and dependency automation is exempt so it keeps working, but regular contributor PRs without valid no-mistakes evidence will not be reviewed or merged.

## Workflow

1. Fork the repo and clone your fork.
2. Create a branch and make your changes.
3. Initialize the gate in the repo once: `no-mistakes init`.
4. Commit your changes.
5. Push through the gate instead of pushing to `origin`:

   ```sh
   git push no-mistakes
   ```

6. Run `no-mistakes` to attach to the pipeline, watch findings, and auto-fix or review as needed.
7. Once the pipeline passes, it forwards the push upstream and opens the PR for you.

See the [no-mistakes quick start](https://kunchenguid.github.io/no-mistakes/start-here/quick-start/) for the full first-run walkthrough.

## Repo conventions

- Node 24+, raw ESM JavaScript (no bundler, no transpiler, no TypeScript). See `CLAUDE.md` for architecture notes and agent instructions.
- Tests live in `test/*.test.js` and run via the built-in `node:test` runner.
- Run `npm run lint` and `npm test` before pushing. The pipeline will run them again, but a fast local pass saves rounds.

## Questions

Open an issue, or talk to me on [Discord](https://discord.gg/Wsy2NpnZDu).
