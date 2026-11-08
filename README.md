# 우리 학교의 내일 — 인구 반영판

Buildless HTML game. `dist/` is the complete static application.

Before playing, select a school to read its baseline forecast with no additional game policy effects: the 2026 public enrollment count, the 2027–2045 model trajectory, milestone counts, and an annual table. This uses the existing school forecast, independently of any saved game. Historical observations are shown separately from future estimates. School selection and forecast browsing do not create or change saved progress; the explicit game button starts a new game or resumes the existing one.

## Cloudflare Pages

Play: https://gyeongbuk-principal-population.pages.dev/

The Cloudflare project `gyeongbuk-principal-population` publishes the complete `dist/` directory through Direct Upload. In the Cloudflare dashboard, open this existing Pages project, create a production deployment, and upload `dist/` or a ZIP containing its files with `index.html` at the archive root. After authenticating Wrangler, the equivalent command is `npx wrangler pages deploy dist --project-name gyeongbuk-principal-population --branch main`.

Cloudflare updates use this upload step. The GitHub Actions workflow below continues to publish the GitHub Pages mirror when `main` changes. Progress is stored per website address; saves on GitHub Pages, Cloudflare Pages, and the offline edition are separate.

## GitHub Pages mirror

Play: https://ysuk4097.github.io/gyeongbuk-principal-population/

The `Deploy GitHub Pages` workflow verifies the population model, events, save compatibility, and standalone parity, then publishes only `dist/` whenever `main` changes. The repository's Pages publishing source must be set to **GitHub Actions**. All application assets use relative URLs, including when the game is hosted under a repository path.

For a local preview, run `python -m http.server 4173 --directory dist` from the project directory and open http://localhost:4173/. No package installation or build step is required. `game.html` is the matching standalone offline edition: run `node scripts/build-standalone.cjs` after changing `dist/` to regenerate it and its SHA-256 in `BUILD_INFO.json`. Gameplay works offline; opening cited source pages requires an internet connection.

Progress is saved in the current browser. Saves from the original ChatGPT Sites address are separate from saves on GitHub Pages.

The historical starting roster uses the 2026 Schoolinfo public snapshot: 474 Gyeongbuk elementary schools and branches, 101,176 students including separately reported special and itinerant classes. This is not a count of schools still operating on the current date; later verified operating changes are recorded separately. School IDs join the 2024, 2025 and 2026 published statistics. The original prototype's fictional 72/257/720 starting options and uniform annual decline are removed.

All school forecasts after 2026 are **model outputs**, not official school enrollment plans. For each municipality, the model calibrates the official age 6–11 resident-population trajectory to the actual 2026 enrollment total. The annual target is `round(observed 2026 enrollment × projected residents in year / projected residents in 2026)`. School cohort progression, recent school-entry trends and age-six population ratios shape the allocation. School totals plus the modeled allocation-unknown pool reconcile exactly to the municipality target. That pool represents uncertainty about the receiving school, not actual pupils left without a placement. Resident population and enrolled students remain different quantities.

The municipal source is Gyeongbuk's 2024-12-20 release, covering 2022–2042. It uses 2022 administrative boundaries including Gunwi, so this model excludes Gunwi and uses the current 22 municipalities. The source counts July 1 residents, including qualifying foreign residents, rather than school enrollment or resident-registration counts. For 2043–2045, the model extends each municipality's 2042 level using the province age 6–11 projection ratio relative to 2042; this is an explicit model assumption beyond the municipal source horizon. The province series comes from Statistics Korea's 2024-05-28 report, printed page 59. School-specific placement plans and eup/myeon/dong projections are not incorporated. Source values and definitions are disclosed in the UI and retained in `data/source/`.

`scripts/build_demographics.py` reproduces `dist/schools.js` from the retained public data. `node scripts/verify-population.cjs` checks all school/year totals, municipal reconciliation and neutral, positive and negative policy transitions. `dist/simulation.js` applies fictional policy effects to admissions and transfers while leaving the demographic baseline unchanged. Save keys are versioned so earlier prototype saves are retained without being presented as data-based forecasts.

Validation: 474 schools across 20 years; baseline enrollment reconciles to the calibrated municipal targets; neutral policy reproduces each baseline; beneficial and adverse policy assumptions affect outcomes in the expected directions. Browser verification covers narrow layouts, school selection, the annual comparison table, save/reload, decision effects and the 2045 ending.

A one-year retrospective check uses only 2024–2025 school observations to estimate 2026. `DEMOGRAPHICS.validation` records the matched-ID coverage, error measures and previous-year-count comparator for the current model version. This checks one-year behavior; it does not establish long-term accuracy, a confidence interval, or future school-placement accuracy.

## Confirmed operating changes

`data/source/school-calendar.json` records verified operating changes with effective dates and source/status distinctions. The 2026 observed roster is retained for historical comparison. Confirmed closures have zero school enrollment from their supplied first-zero forecast year; mid-2026 closure does not rewrite the earlier 2026 public observation. Branch conversions, affiliations and renames do not themselves remove students. Only verified receiving-school assignments route pupils to a named school; otherwise projected cohorts remain in the municipality's explicitly labeled allocation-unknown pool and age forward.

The calendar includes only changes supported by the checked sources. Later unconfirmed schools are assumed to remain; the model does not predict the complete set of future closures. When game progression reaches a confirmed closure, a separate calendar ending records the last game student count and transfer/placement status before setting the closed school's visible count to zero. Older counterfactual saves retain their full original grades, points and journal in a snapshot; their current year is preserved and the corrected visible timeline is zero from the closure year. These are game records, not claims about actual historical student transfers.

The collapsed recovery explanation shows the selected municipality's source-projected minimum and 2042 recovery. A rebound in the official population assumptions must not be presented as guaranteed, or replaced with forced decline. The primary school model continues recent relative intake-share trends as an explicit assumption. A read-only 2030/2035/2045 comparison shows fixed intake shares under the same calendar and corrected cohort structure. Neither assumption is established as more accurate over 20 years; gameplay uses the primary model. The former artificial mean-cohort contribution to entry weight and permanent special-student share floor are removed.

A zero no-intervention estimate does not itself establish administrative closure. Positive game-policy effects can recruit hypothetical pupils under the disclosed simulation coefficients and retain policy-created cohorts even when reference intake is zero. This does not add a floor to the neutral forecast. A confirmed calendar closure still ends school operation through the explicit graduation/placement record.

Run `node scripts/verify-lifecycle.cjs` for calendar eligibility, midyear timing, unchanged observations, legacy snapshots, zero school trajectories and idempotent transfer records.

## Events and choice evidence

The expanded edition has 19 distinct annual decisions (2026–2044), with three choices each, followed by the existing 2045 ending. The original eight events retain their choices and game effects. Stable event IDs preserve the current event in older v3 saves, including already selected choices after 2033; new journal entries retain the selected event and option. Existing school progress is kept.

Each choice discloses one of three evidence levels in Korean: a reported case, indirect evidence, or no confirmed direct evidence. Optional details link the source title, publisher, date, findings, and limitations. The catalogue in `dist/evidence.js` contains official program information, school case reports, and research checked on 2026-11-08. Reported enrollment changes concern particular schools and often several simultaneous interventions; they do not establish that one choice caused enrollment growth. Research on learning, care, or bullying supports only those outcomes, unless a source also measures enrollment. Source relevance and limits are specified separately for every choice in `dist/events.js`.

All point changes, admissions percentages, and transfer coefficients remain **game assumptions**, not estimates measured in those sources. Organization choices do not alter the demographic baseline.

Run `node scripts/verify-events.cjs` to check all 57 choices and source references, three complete playthroughs, finite transitions, legacy saves, all 474 baseline previews, and preview storage isolation. Run `node scripts/build-standalone.cjs --check` to verify the offline edition matches the web files.

## Class organization and fictional consolidation

An additional organization review responds to modeled zero enrollment, missing incoming grades, empty grades, combined-grade candidates and class-capacity concerns. It is separate from the annual policy choice. The verified 2026 Gyeongbuk combined-grade reference is at most three students in each of two grades and at most five students together; nonadjacent grades can be paired. Proposed groups are simulated arrangements, not actual classroom assignments. Combining grades never removes students or changes the demographic baseline.

`dist/organization-policy.js` records the official rules, sources and limits checked on 2026-11-08. Current addresses contain only municipality names, so the game cannot identify dong versus eup/myeon or confirm previous-year class counts; capacity reviews show this uncertainty. Applying the 2026 reference to later model years is a scenario, not a verified future rule.

There is no automatic school-closure student threshold. Players may start a fictional consultation, prepare student placement/transport/support in a later year, and explicitly approve a merger or closure scenario in a further year. These stages simplify real consultation and education-office procedures; they do not schedule the closure of the named real school. Such an ending preserves the last student counts and school record. Existing saves receive default organization state without resetting their annual decisions.

Run `node scripts/verify-organization.cjs` for policy boundaries, integer allocation, nonadjacent/disjoint grouping, state idempotence and consultation/ending gates. The application verifier also covers organization integration and save compatibility.
