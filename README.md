# Gym Timer

A gym rep timer PWA: hold/swap phases with beeps and voice cues, wake lock to
keep the screen on, and full offline support after first load.

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
Pushing to `main` auto-deploys to GitHub Pages via GitHub Actions.

App icons are generated from `icon.svg` (e.g. `rsvg-convert -w 512 -h 512
icon.svg -o public/icon-512.png`).
