# 우리 학교의 내일 — 인구 반영판

Buildless HTML game. `dist/` is the complete static application.

Before playing, select a school to read its municipality's enrollment scenario: observed 2026 enrollment, the regional model target through 2045, a chart and an accessible annual table. This uses the municipality's total target, rather than the sum of surviving schools. The selected school's published starting count identifies the game target; its own forecast, observations and operating-change details remain in the collapsed data area. Browsing is independent of saved progress and does not change it; the explicit game button starts or resumes the school game.

The default view shows a short municipality overview and regional reference chart. School-level forecasts, admissions, regional comparisons, annual tables and methodology remain under “자료·다른 전망 보기”. During play, the annual decision, school scene and Next action stay primary; native disclosures hold grades/budget/support, operating records and detailed indicators. Support is one disclosure away, while costs and pending transfer consequences stay visible. Opening a chart redraws it, and unrelated actions preserve the open secondary areas.

Public creator credit: **경북GBEAILAB정교사**. The shared footer uses the team character artwork; its provenance is recorded in `data/creator-artwork.json`. The offline builder embeds the character image in `game.html`, so no adjacent asset folder is needed to run that file.

Local December 1 demonstration materials are in `docs/DEMO-GUIDE.ko.txt` (three-minute script, extended flow and preparation) and `docs/REGISTRATION-INTRO.ko.txt` (copyable introduction). These files are local drafts; no external status sheet has been edited or submitted.

## Cloudflare Pages

Play: https://gyeongbuk-principal-population.pages.dev/

The Cloudflare project `gyeongbuk-principal-population` publishes the complete `dist/` directory through Direct Upload. In the Cloudflare dashboard, open this existing Pages project, create a production deployment, and upload `dist/` or a ZIP containing its files with `index.html` at the archive root. After authenticating Wrangler, the equivalent command is `npx wrangler pages deploy dist --project-name gyeongbuk-principal-population --branch main`.

Cloudflare updates use this upload step. The GitHub Actions workflow below continues to publish the GitHub Pages mirror when `main` changes. Progress is stored per website address; saves on GitHub Pages, Cloudflare Pages, and the offline edition are separate.

## GitHub Pages mirror

Play: https://ysuk4097.github.io/gyeongbuk-principal-population/

The `Deploy GitHub Pages` workflow verifies population, admissions, organization and retention models, game/save compatibility, and standalone parity, then publishes only `dist/` whenever `main` changes. The repository's Pages publishing source must be set to **GitHub Actions**. All application assets use relative URLs, including when the game is hosted under a repository path.

For a local preview, run `python -m http.server 4173 --directory dist` from the project directory and open http://localhost:4173/. No package installation or build step is required. `game.html` is the matching standalone offline edition: run `node scripts/build-standalone.cjs` after changing `dist/` to regenerate it and its SHA-256 in `BUILD_INFO.json`. Gameplay works offline; opening cited source pages requires an internet connection.

Progress is saved in the current browser. Saves from the original ChatGPT Sites address are separate from saves on GitHub Pages.

The historical starting roster uses the 2026 Schoolinfo public snapshot: 474 Gyeongbuk elementary schools and branches, 101,176 students including separately reported special and itinerant classes. This is not a count of schools still operating on the current date; later verified operating changes are recorded separately. School IDs join the 2024, 2025 and 2026 published statistics. The original prototype's fictional 72/257/720 starting options and uniform annual decline are removed.

All school forecasts after 2026 are **a common-rate teaching scenario**, not official school enrollment plans. Every surviving school in the same municipality uses exactly the same age 6–11 resident-population ratio: `roundHalfUp(school 2026 enrollment × municipality population in year / municipality population in 2026)`. Each school rounds independently. There are no school-specific intake trends, retention estimates, minimum floors or redistributions to surviving schools. One-person rounding differences can be proportionally large for tiny schools. Resident population and enrolled students remain different quantities.

The regional target uses the same formula on the municipality's total observed enrollment. Regional accounting is `target = active-school sum + confirmed-closure excluded share + signed rounding adjustment`. The excluded share sums independently rounded counterfactual shares of closed schools. It is a demand-allocation residual, not confirmed transfers or the same 2026 pupils remaining indefinitely. The rounding adjustment is shown separately rather than allocating extra pupils to selected schools.

Future grade counts are illustrative game allocations: the six observed 2026 regular-grade shares rotate annually, then those shares and the special/itinerant share are scaled and rounded within each school to its common-factor total. These are not individual-pupil cohort forecasts or actual admissions. The 2026 grade counts and earlier published observations remain unchanged.

The municipal source is Gyeongbuk's 2024-12-20 release, covering 2022–2042. It uses 2022 administrative boundaries including Gunwi, so this model excludes Gunwi and uses the current 22 municipalities. The source counts July 1 residents, including qualifying foreign residents, rather than school enrollment or resident-registration counts. For 2043–2045, the model extends each municipality's 2042 level using the province age 6–11 projection ratio relative to 2042; this is an explicit model assumption beyond the municipal source horizon. The province series comes from Statistics Korea's 2024-05-28 report, printed page 59. School-specific placement plans and eup/myeon/dong projections are not incorporated. Source values and definitions are disclosed in the UI and retained in `data/source/`.

`scripts/build_demographics.py` reproduces `dist/schools.js` from the retained public data. `node scripts/verify-population.cjs` checks all school/year totals, municipal reconciliation and neutral, positive and negative policy transitions. `dist/simulation.js` applies fictional policy effects to admissions and transfers while leaving the demographic baseline unchanged. Save keys are versioned so earlier prototype saves are retained without being presented as data-based forecasts.

Validation: 474 schools across 20 years; each school follows the shared municipal factor, the regional accounting identity holds, and neutral policy reproduces each reference. Beneficial and adverse game assumptions affect outcomes separately. Browser verification covers narrow layouts, school selection, annual tables, save/reload, decision effects and endings.

A one-year retrospective check applies the 2025→2026 municipal population ratio to 2025 school enrollment only. Across 471 matched schools, mean absolute error is 13.80 pupils, median absolute error 5, and WAPE 6.47%. This simplification has weaker one-year enrollment accuracy than the previous model; it is chosen for a clearer common-rate scenario, not an accuracy claim. `DEMOGRAPHICS.validation` retains coverage and comparator results. This does not establish long-term accuracy, confidence intervals or future school-placement accuracy.

New games store the population model version. Older or untagged saves keep their original year, grades, choices, points, budget and endings; a legacy-model note explains that comparison with the new reference includes a model change and is not a pure policy effect. Past gameplay is not recalculated, and an ended game never resumes automatically.

## Confirmed operating changes

`data/source/school-calendar.json` records verified operating changes with effective dates and source/status distinctions. The 2026 observed roster is retained for historical comparison. Confirmed closures have zero school enrollment from their supplied first-zero forecast year; mid-2026 closure does not rewrite the earlier 2026 public observation. Branch conversions, affiliations and renames do not themselves remove students. Closure shares are excluded from active-school totals and shown separately without inventing receiving-school assignments.

The calendar includes only changes supported by the checked sources. Later unconfirmed schools are assumed to remain; the model does not predict the complete set of future closures. When game progression reaches a confirmed closure, a separate calendar ending records the last game student count and transfer/placement status before setting the closed school's visible count to zero. Older counterfactual saves retain their full original grades, points and journal in a snapshot; their current year is preserved and the corrected visible timeline is zero from the closure year. These are game records, not claims about actual historical student transfers.

The collapsed explanation shows the selected municipality's source-projected minimum and 2042 recovery. A rebound in the official population assumptions is neither guaranteed nor replaced with forced decline. The common-rate scenario does not separately forecast small-school closure from cohort structure. Confirmed calendar changes and game events remain separate rules.

A zero no-intervention estimate does not itself establish administrative closure. While game enrollment remains positive, policy effects can recruit hypothetical pupils under the disclosed simulation coefficients even when reference intake is zero. The game now automatically ends school operation when its rounded combined enrollment reaches zero, including separately counted special/itinerant pupils. One pupil, or an empty first grade alone, does not trigger this rule. The zero-enrollment ending is a user-requested game rule, not a legal closure criterion. Confirmed official calendar endings take priority.

The preview marks the first arithmetic-reference zero year without modifying the population trajectory or regional accounting. A later regional rebound can round the reference upward again; this is not a prediction of an actually closed school reopening. An ended game remains ended. Automatic endings preserve the journal, metrics and positive historical points. Existing zero-enrollment saves gain the same ending on resume without rewriting earlier progress; repeated loads do not add duplicate records. Only an explicit new-game reset can restart an ended run.

## Peer context and support responses

A separate game event can arise after an applied combined-grade arrangement, a year-to-year drop of at least 20% and two pupils, or a regular grade with one or two pupils. Happiness of 75 or more suppresses this extra event; ordinary graduation and demographic change continue. These cutoffs are game assumptions. The event forecasts at most one additional regular-pupil transfer, or two for the pronounced-drop condition, bounded by pupils that can actually be removed while preserving special/itinerant students.

Joint curriculum support costs 12 points and adds six happiness points with no extra transfer. Peer exchange costs six points and adds three happiness points, with half the forecast transfer count rounded down. Monitoring costs nothing and applies the disclosed count. Advancing with an unresolved event uses that same monitoring response, announced in the panel and next-year hint; ignoring it cannot avoid the consequence. The official closure calendar is checked first. Responses and grade-specific losses are recorded once, the current-year chart point is updated, and a resulting total of zero immediately invokes the automatic game ending. A full intervening year separates events.

`dist/retention-evidence.js` distinguishes a descriptive school case about friends, transfers and satisfied families from Scottish research reporting learning benefits in mixed-grade classes. Neither measures the game's transfer counts or satisfaction cutoff; combined classes are not assigned an unconditional real-world penalty. No gender counts or household moves are inferred. Neutral population forecasts and regional targets remain unchanged.

Run `node scripts/verify-retention.cjs` to verify conditions, responses, cooldown, save idempotence and exact grade/special-pupil accounting across all retained school forecast states.

Current first-through-sixth-grade counts and separately counted special/itinerant pupils are available in “학년·예산·지원” and sum exactly to the displayed enrollment total.

## Learning through regional and budget tradeoffs

The pre-game regional comparison separates observed 2026 school enrollment, future calibrated enrollment goals and projected resident population. Comparing the selected municipality with another municipality or the current 22-municipality province aggregate illustrates different trajectories without treating projected share changes as measured migration. The collapsed context uses verified sources, including the recent national birth rebound and the lag before new births enter school cohorts. A principal's recruitment can redistribute pupils between schools without increasing regional births.

Paid annual choices and peer-support responses require enough available game points. If every original annual choice is unaffordable, a zero-cost no-new-project decision allows progression without direct student or metric effects. Optional institutional support adds exactly 24 points for a recorded learning, transport or shared-curriculum intention, at most three times and at least three years apart. The purpose is not an enforced spending restriction; the points, limits and timing are game assumptions rather than actual grant eligibility or KRW. Support does not itself add students or improve satisfaction. The existing annual 250-point cap can absorb part of a high balance; ledger entries record the actual signed change, including that adjustment.

`dist/learning.js` tracks policy spending/inflows, peer-support spending, the annual net allocation and grants with unique transaction IDs. New games start their ledger in 2026; older saves anchor it at their current year and balance, explicitly leaving prior financial history unknown. No prior expenditure is inferred from old decisions. Every ending compares the same-year no-additional-policy baseline with the game state, wellbeing and recorded resources, then offers open reflection on access, cooperation and opportunity costs. It does not grade larger schools as inherently better or attribute simulated enrollment differences causally to grants.

Run `node scripts/verify-learning.cjs` for pure support and ledger invariants. Application checks cover affordability, the no-project fallback, actual balance reconciliation, legacy anchors and reports for normal, zero-enrollment, manual and official-calendar endings.

## Published admissions and separate admission forecasts

`dist/admissions.js` contains code-matched Schoolinfo admissions observations for 2024–2026 and a separate reference series through 2045. Published admissions count actual entrants at admission day, whereas the grade-one enrollment snapshot is another statistic with a different reference period. Their difference alone does not establish that pupils transferred or why the values differ. Unknown historical records remain missing rather than zero.

The interface labels the observed value as “2026년 공시 입학생” and future values as modeled admissions. Future gross admissions use `roundHalfUp(2026 actual admissions × municipality age-six population ratio)`, independently for every school; confirmed closures are zero. All schools in the same municipality share this admissions factor, which differs from the age 6–11 factor used for total enrollment. Zero observed admissions stay zero, with no floor or school-specific trend extrapolation. Regional targets, active-school totals, excluded closure shares and signed rounding differences are reconciled separately. This reference does not replace enrolled-grade forecasts, player enrollment or gameplay transitions. The “1학년 재학생” count uses the current game allocation and is not pure admissions.

Admissions holdout uses 2025 observations only: 470 matched schools, mean absolute error 5.17 pupils, median 3 and WAPE 18.70%. These one-year results do not establish long-term accuracy. Sources, assumptions, coverage and validation remain in `ADMISSIONS`.

`python scripts/build_admissions.py` regenerates the separate series from retained public tables. `node scripts/verify-admissions.cjs` checks the observations against those tables, all 22 annual points per school, missing history, confirmed closures and municipal target reconciliation.

Run `node scripts/verify-lifecycle.cjs` for calendar eligibility, midyear timing, unchanged observations, legacy snapshots, zero school trajectories and idempotent transfer records.

## Events and choice evidence

The expanded edition has 19 distinct annual decisions (2026–2044), with three choices each, followed by the existing 2045 ending. The original eight events retain their choices and game effects. Stable event IDs preserve the current event in older v3 saves, including already selected choices after 2033; new journal entries retain the selected event and option. Existing school progress is kept.

Each choice discloses one of three evidence levels in Korean: a reported case, indirect evidence, or no confirmed direct evidence. Optional details link the source title, publisher, date, findings, and limitations. The catalogue in `dist/evidence.js` contains official program information, school case reports, and research checked on 2026-11-08. Reported enrollment changes concern particular schools and often several simultaneous interventions; they do not establish that one choice caused enrollment growth. Research on learning, care, or bullying supports only those outcomes, unless a source also measures enrollment. Source relevance and limits are specified separately for every choice in `dist/events.js`.

All point changes, admissions percentages, and transfer coefficients remain **game assumptions**, not estimates measured in those sources. Organization choices do not alter the demographic baseline.

Run `node scripts/verify-events.cjs` to check all 57 choices and source references, three complete playthroughs, finite transitions, legacy saves, all 474 baseline previews, and preview storage isolation. Run `node scripts/build-standalone.cjs --check` to verify the offline edition matches the web files.

## Class organization and fictional consolidation

An additional organization review responds to modeled zero enrollment, missing incoming grades, empty grades, combined-grade candidates and class-capacity concerns. It is separate from the annual policy choice. The verified 2026 Gyeongbuk combined-grade reference is at most three students in each of two grades and at most five students together; nonadjacent grades can be paired. Proposed groups are simulated arrangements, not actual classroom assignments. Combining grades never removes students or changes the demographic baseline.

`dist/organization-policy.js` records the official rules, sources and limits checked on 2026-11-08. Current addresses contain only municipality names, so the game cannot identify dong versus eup/myeon or confirm previous-year class counts; capacity reviews show this uncertainty. Applying the 2026 reference to later model years is a scenario, not a verified future rule.

The verified policy sources do not establish an automatic legal school-closure threshold. Separately from the game's automatic zero-enrollment rule, players may start a fictional consultation, prepare student placement/transport/support in a later year, and explicitly approve a merger or closure scenario in a further year. These stages simplify real consultation and education-office procedures; they do not schedule the closure of the named real school. Such an ending preserves the last student counts and school record. Existing saves receive default organization state without resetting their annual decisions.

Run `node scripts/verify-organization.cjs` for policy boundaries, integer allocation, nonadjacent/disjoint grouping, state idempotence and consultation/ending gates. The application verifier also covers organization integration and save compatibility.
