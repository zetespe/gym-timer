# Contributing to Gymmy

Thanks for your interest! Gymmy is a small, privacy-first workout app
maintained by one person who actually trains with it. Contributions are
welcome under the rules below.

## Ground rules

1. **Open an issue first.** Describe the bug or the idea before writing code —
   it may already be on the [backlog](BACKLOG.md), out of scope, or solvable
   in a simpler way. Small typo/doc fixes can skip this.
2. **All changes come in as pull requests.** Nobody merges to `main` except
   the maintainer — `main` auto-deploys to the live app, so every PR is
   reviewed and tested before it ships.
3. **Keep it simple and privacy-first.** No servers, no accounts, no
   analytics, no external calls. Everything stays on the user's device.
   PRs that add tracking or network dependencies will be declined.
4. **Match the codebase.** Plain React + Vite, no new frameworks or heavy
   dependencies without prior discussion. Run `npm run lint`, `npm test`
   and `npm run build` before opening the PR; add tests for logic changes
   (see `src/log/model.test.js`).
5. **Test on a phone.** Gymmy's primary target is a phone at a gym. If your
   change touches the UI, check it at phone width.

## Licensing of contributions

The project is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md): free for personal and
other noncommercial use, while commercial use requires a separate license
from the maintainer.

By submitting a contribution you agree that:

- your contribution is your own work and you have the right to submit it;
- you license your contribution to the project under the same PolyForm
  Noncommercial 1.0.0 terms; and
- you grant the maintainer (zetespe) a perpetual, worldwide, royalty-free
  right to relicense your contribution as part of the project, including in
  commercial licenses of the project.

That last point is what keeps commercial licensing possible with many
contributors — if you're not comfortable with it, please don't submit code
(issues and bug reports are still very welcome).

## Commercial use

Want to use Gymmy or a derivative commercially? That requires a separate
agreement — open an issue or contact [@zetespe](https://github.com/zetespe)
on GitHub.
