# 우리 학교의 내일 — 인구 반영판

Buildless HTML game. `dist/` is the complete static application.

## GitHub Pages

Play: https://ysuk4097.github.io/gyeongbuk-principal-population/

The `Deploy GitHub Pages` workflow verifies the population model and publishes only `dist/` whenever `main` changes. The repository's Pages publishing source must be set to **GitHub Actions**. All application assets use relative URLs, including when the game is hosted under a repository path.

For a local preview, run `python -m http.server 4173 --directory dist` from the project directory and open http://localhost:4173/. No package installation or build step is required. `game.html` remains the original standalone offline edition.

Progress is saved in the current browser. Saves from the original ChatGPT Sites address are separate from saves on GitHub Pages.

The current roster and starting enrollment use the 2026 Schoolinfo public dataset: 474 Gyeongbuk elementary schools and branches, 101,176 students including separately reported special and itinerant classes. School IDs join the 2024, 2025 and 2026 published statistics. The original prototype's fictional 72/257/720 starting options and uniform annual decline are removed.

All school forecasts after 2026 are **model outputs**, not official school enrollment plans. They combine each school's observed grade cohorts, recent cohort progression, regional enrollment share changes and the official Gyeongbuk age 6–11 medium population projection. The province series uses the published rounded thousands in Statistics Korea's 2024-05-28 report, printed page 59. Municipal official projection tables and school-specific medium-term placement plans have not been incorporated. Source values and definitions are disclosed in the UI and retained in `data/source/`.

`scripts/build_demographics.py` reproduces `dist/schools.js` from the retained public data. `node scripts/verify-population.cjs` checks all school/year totals, provincial reconciliation and neutral, positive and negative policy transitions. `dist/simulation.js` applies fictional policy effects to admissions and transfers while leaving the demographic baseline unchanged. Save keys are versioned so earlier prototype saves are retained without being presented as data-based forecasts.

Validation: 474 schools across 20 years; baseline enrollment reconciles to the selected province population ratios; neutral policy reproduces each baseline; beneficial and adverse policy assumptions affect outcomes in the expected directions. Browser verification covers narrow layouts, school selection, the annual comparison table, save/reload, decision effects and the 2045 ending.
