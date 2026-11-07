# Lock Screen event range

The user approved `outputs/lock-screen-clean-preview.html`: one event icon followed by an equally weighted start – end range on one line, with AM/PM beside both times in 12-hour mode. Keep the six-hour strip and plain hour axis. Remove the countdown, normal heading, current-status icon, group number and routine check time.

The selected approach replaces a countdown that only changed at refresh with clock times. A current-status icon was tried and explicitly rejected. Possible-power periods remain patterned on the strip: while off/possible, target the next planned on interval; while on, target the next off interval.

Reuse validated today/tomorrow data and actual Kyiv boundaries for DST. Never predict across unknown data. If a target starts but its end is not known before missing coverage, show `—` for the end with a compact `кінець невідомий` warning; do not invent a switch at midnight. Retain cached/stale/reserve warnings and explicit error/emergency states.

Use native SF Symbols and text, preserving the calibrated 150pt accessory width. Physical typography/tint require iPhone verification. Keep Home Screen, inline/circular accessories and the updater unchanged. Synchronize standalone/export files and the browser preview. The user authorized implementation and PR creation after checks, not merging this new PR.
