# Widget layout rules

- Keep native text and native stacks. Leave the outer content stack width automatic; use explicit bounds for drawings and their aligned labels.
- The small Home Screen widget uses the profile's widget height for both axes. Today's 24-hour schedule ring fills the square and contains the current status, event title, time range, and city with group number. Midnight is at the top and a solid hand marks the current Kyiv time in white on dark glass and dark ink on light glass. The medium Home Screen and Lock Screen families have separate layouts.
- Screen profiles estimate drawing dimensions in points, not pixels. They are not a live measurement of the widget container.
- For medium, below 350 points reduce top/bottom padding by 4 points and time-range gaps from 8 to 4 before shrinking text. Small uses one centered line each for the title and the range, with smaller type for longer localized ranges.
- Use `timelineX` for the medium timeline's colored spans, ticks, and marker geometry. Hour labels use an unconstrained native row with flexible gaps. The bar extends to the full width with midnight ticks inset. The small dial shares one angular scale for the colored arcs and the hand.
- Keep warnings visible and leave the schedule, colors, and glass reflections unchanged.

## Verification

Run the workflow checks. Appearance tests cover iPhone 16 and 16 Pro Max screen profiles, both clock formats, schedule states, clear evenings, cached/stale/community notices, and an unconstrained native label row.

Before claiming visual parity, compare actual iPhone screenshots with the browser preview. Include long AM/PM ranges and warning text in both themes. Record iOS/Scriptable versions and Home Screen settings. Display Zoom and large icons still need device calibration; passing mocked layout tests does not establish pixel-perfect rendering.
