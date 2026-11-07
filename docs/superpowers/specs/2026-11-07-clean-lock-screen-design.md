# Cleaner rectangular Lock Screen widget

## Intent
Answer one glance-level question: how long until planned restoration when power is off, or when the next cutoff starts when power is scheduled on. Preserve the Schedule strip that the user selected. Ukrainian widget copy and system clock formatting remain.

## Approaches
- Keep the published next-change layout: retains status, last check, event clock and countdown, but the user found it too busy.
- Use the cleaner browser study: one primary answer, a short heading and the existing strip. Removes routine status/check text. The user selected this after viewing `outputs/lock-screen-clean-preview.html`, then requested removing the group number as well.

## Selected behavior
- Off or possible-power state: heading `До планового заживлення`; one large remaining duration to the next scheduled on interval. Smaller unit labels may accompany the large numerals.
- On state: heading `Наступне відключення`; one large next-cutoff clock, with no duplicate countdown or day suffix.
- Skip possible-power periods when choosing the main target. Keep them visible as hatching on the strip. Never search past an unknown period to imply a reliable restoration or cutoff.
- Remove the group number from this rectangular widget, including its fallback header. Continue using the configured group to fetch data and open the correct script.
- Remove routine current-status and last-check text from the normal view. Retain an explicit compact warning when data is cached, stale or from the fallback source. Emergency, missing-data and invalid-parameter states remain explicit; do not show a confident countdown without a known target.
- Keep the six-hour strip, current-time marker, monochrome patterns and published next-day periods. Axis labels contain only hours, without AM/PM, +1, -1 or tomorrow. Missing tomorrow data remains unknown. Overnight countdowns retain Kyiv/DST handling.

## Scope and constraints
Update the rectangular accessory renderer and its target selection, Scriptable mock tests, README, canonical standalone script and text copy, and browser/export deliverables. Reuse the existing validated data pipeline and drawing helpers. Keep the Home Screen, circular/inline accessories and updater protocol unchanged.

The preview is a design study, not production code. The implementer may choose native text sizes and spacing to fit the compact accessory while preserving its hierarchy. No additional configuration or dependencies are needed. Physical iPhone fit and system tint require user verification. Refreshes remain controlled by iOS; this is not a continuously running timer.

## Validation and publication
Check target selection in on/off/possible/unknown states, no prediction across missing data, midnight/next-day transitions, DST, 12/24-hour formatting, warning visibility and absence of the displayed group number. Run syntax, updater, appearance, Lock Screen and tomorrow suites, plus affected standalone/browser checks. Publish a pull request after local checks pass and verify its required CI checks. Request explicit approval before merging that new pull request into protected main.

## Approval
The user explicitly approved the cleaner design without the group number or day suffixes and requested implementation and a pull request after checks pass. Merge is not authorized by this request.
