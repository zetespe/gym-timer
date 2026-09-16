# Gym Timer + Log

A gym PWA that works fully offline after first load:

- **Log** — your training plan and every session, stored only on the phone.
  Sets are prefilled from last time so a repeat is one tap; a quick-log box
  parses typed or dictated lines like “goblet 16 8 8 7 felt easy”; a rest
  countdown beeps after each ticked set; a next-weight suggestion follows the
  double-progression rule (top of the range → up, below the bottom twice →
  down). Backups go wherever you choose via the share sheet or a save dialog.
  Nothing is ever uploaded; the repo ships no plan and no personal data.
- **Timer** — the original hold/swap rep timer with beeps and voice cues, wake
  lock, pocket mode. Timed exercises in a session open it preset and write the
  result back.

Talking to Claude (dictating a session, asking for a plan, analysis) works by
copy/paste from the Backup tab; the format is in `docs/CLAUDE-PROTOCOL.md`.

**Live app:** https://zetespe.github.io/gym-timer/

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
