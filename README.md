# Gymmy

Gymmy is a gym PWA (repo `gym-timer`) that works fully offline after first load:

- **Log** — your training plan and every session, stored only on the phone.
  Sets are prefilled from last time so a repeat is one tap; a quick-log box
  parses typed or dictated lines like “goblet 16 8 8 7 felt easy”; a rest
  countdown beeps after each ticked set; a next-weight suggestion follows the
  double-progression rule (top of the range → up, below the bottom twice →
  down). Backups go wherever you choose via the share sheet or a save dialog.
  Training data is never uploaded; the repo ships no plan and no personal data.
- **Timer** — the original hold/swap rep timer with beeps and voice cues, wake
  lock, pocket mode. Timed exercises in a session open it preset and write the
  result back.

Talking to an AI assistant (dictating a session, asking for a plan, analysis) works by
copy/paste from the Backup tab; the format is in `docs/AI-PROTOCOL.md`.

**Live app:** https://zetespe.github.io/gym-timer/
**About page:** https://zetespe.github.io/gym-timer/about/

## Privacy and what is counted

Everything a user records stays in their phone's local storage. To know
whether anyone uses Gymmy, two anonymous counts go to
[GoatCounter](https://www.goatcounter.com) (no cookies, no personal data),
dashboard at https://gymmy.goatcounter.com:

- **Page views** of the About page (`public/about/`).
- **App use** from `src/log/usage.js`: each phone sends at most one
  `app/day` event per day, `app/week` per ISO week, `app/month/new` or
  `app/month/returning` per month, and `app/install` once ever. Events are
  sent with GoatCounter sessions off (`ns=1`), so a period's total is the
  number of different phones in it and hits are never linked; no identifier
  is sent. Users can switch this off in Plan → Settings; "Erase everything"
  keeps that choice. The first month after this shipped counts every
  existing phone as an install.

Like any web request, a count reaches GoatCounter with the phone's IP
address and browser headers. GoatCounter doesn't store the IP. It keeps
each count as a separate record with its time, browser and OS version,
screen width (About page only) and country (plus region for a few
countries), but with no ID and no session, so records aren't linked to
each other; the dashboard shows totals. Which of these are collected, and
how long records are kept (forever by default), is set in the GoatCounter
site settings.

## Install on your phone

- **iOS (Safari):** open the URL → Share → Add to Home Screen.
- **Android (Chrome):** open the URL → ⋮ menu → Add to Home screen (or the
  Install prompt).

## Development

```sh
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
```

Built with Vite + React and [vite-plugin-pwa](https://vite-pwa-org.netlify.app/).
Log code lives in `src/log/` (`store.js` versioned storage + migrations,
`model.js` pure helpers and the progression rule, one file per tab).
Pushing to `main` auto-deploys to GitHub Pages via GitHub Actions.

App icons are generated from `icon.svg` (e.g. `rsvg-convert -w 512 -h 512
icon.svg -o public/icon-512.png`).

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md) — free to use, copy, modify and
share for personal and other noncommercial purposes. **Commercial use
requires a separate paid license** — open an issue or contact
[@zetespe](https://github.com/zetespe). Contributions are welcome; see
[CONTRIBUTING.md](CONTRIBUTING.md).

Required Notice: Copyright zetespe (https://github.com/zetespe/gym-timer)
