# Lock Screen Event Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for this approved change.

**Goal:** Port the approved icon/range preview and create a checked, unmerged PR.
**Architecture:** Extend `lockScreenTarget(data, now)` with the contiguous interval end using its existing actual-time scan. Replace only the rectangular main row; reuse symbols, native stacks, formatting and strip.
**Tech Stack:** Scriptable JS, Node VM tests, existing Python exports and static HTML.
**Spec:** docs/superpowers/specs/2026-11-07-lock-screen-event-range-design.md

## Global Constraints
No dependencies or updater changes. Both endpoints keep AM/PM on the same line. No current-state badge or group. Preserve unknown barriers, warnings, next-day and DST behavior. PR only, no merge.

## Review Focus
Missing coverage must not invent an interval end; midnight continuity must merge equal states. Repeated/skipped DST hours must use actual boundaries. Formatting must not duplicate AM/PM through double formatting. Icon failure must have a readable fallback. Native size/tint need device verification.

### Task 1: Implement and publish the range
**Files:** canonical `../Chernivtsi Electricity.js`, generated `widget.js`, `tests/lock-screen.cjs`, `tests/appearance.cjs`, `tests/tomorrow.cjs`, `README.md`; standalone text and designer exports, `../lock-screen-clean-preview.html`, `../../work/check-clean-preview.cjs`.
**Interfaces:** target keeps `at,time`, adds `state,endAt,endTime` (null end if unknown). The rectangular renderer consumes the range; other families keep their existing model.

- [x] Add assertions for ranges/icons, two AM/PM labels, next-day ends, unknown ends, DST, fallback symbols, and unchanged other families. Run tests: expect new range assertions to fail.
- [x] Implement the target end and native icon/range row. Update documentation and regenerate exports. Browser unknown-end behavior must match native.
- [x] Run syntax and all four repository suites, standalone, browser-preview and designer checks; expect all pass. Commit.
- [ ] Obtain one fresh branch review; fix important issues with regression coverage. Push branch and create PR; verify required CI, leave unmerged.
