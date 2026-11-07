# Cleaner Lock Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan in the current session.

**Goal:** Ship the approved calmer rectangular accessory in a checked, unmerged PR.
**Architecture:** Extend the existing schedule model with a planned target while preserving immediate-next behavior for other accessories; reuse strip drawing and validated data.
**Tech Stack:** Scriptable JavaScript, Node VM tests, static HTML preview, Python export builders.
**Spec:** docs/superpowers/specs/2026-11-07-clean-lock-screen-design.md

## Global Constraints
Keep Home Screen, inline/circular accessories, updater API and data validation unchanged. No dependencies. No main merge. Physical iPhone appearance remains unverified.

## Review Focus
Check unknown barriers, cached/stale warnings, midnight/DST elapsed time, group removal versus configured group preservation, and compact layout height. Mock tests cannot verify iOS font metrics or tint.

### Task 1: Apply and verify the approved design
**Files:** canonical `../Chernivtsi Electricity.js`, generated `widget.js`, `tests/lock-screen.cjs`, `tests/appearance.cjs`, `tests/tomorrow.cjs`, `README.md`; workspace preview `../lock-screen-clean-preview.html`, `../../work/check-clean-preview.cjs`, standalone text and designer exports.
**Interfaces:** `lockScreenSchedule` adds `target`, retains `next`; rectangular renderer consumes `target`; other families retain `next`.

- [ ] Update tests for planned restoration, absent group/check/status, plain hours, next cutoff, unknown barriers, midnight and DST. Run them against old code. Expected: new layout/target assertions fail.
- [ ] Add target search and replace rectangular hierarchy. Use elapsed Kyiv timestamps for countdown. Keep quality warnings visible. Update browser study and README; rebuild release and designer exports.
- [ ] Run syntax, updater, appearance, Lock Screen, tomorrow, standalone, clean-preview and designer checks. Expected: all pass; no changes to other families.
- [ ] Commit implementation; obtain one fresh whole-branch review and address important findings with regression tests.
- [ ] Push feature branch, create PR, verify required CI. Expected: checks pass; PR stays open.
