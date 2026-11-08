# Widget layout rules

- Keep native text and native stacks. Leave the outer content stack width automatic; use explicit bounds for drawings and their aligned labels.
- The Home Screen layout targets the medium widget. Lock Screen families retain their separate layouts.
- Screen profiles estimate drawing dimensions in points, not pixels. They are not a live measurement of the widget container.
- Keep the existing font sizes and text-fitting limits. Below 350 points, reduce top/bottom padding by 4 points and time-range gaps from 8 to 4 before shrinking text.
- Use `timelineX` for all Home Screen timeline positions: colored spans, ticks, marker, and native hour labels. The bar extends to the full width; midnight tick centers remain inset.
- Keep warnings visible and leave the schedule, colors, and glass reflections unchanged.

## Verification

Run the workflow checks. Appearance tests cover iPhone 16 and 16 Pro Max screen profiles, both clock formats, schedule states, clear evenings, cached/stale/community notices, and label-to-tick geometry.

Before claiming visual parity, compare actual iPhone screenshots with the browser preview. Include long AM/PM ranges and warning text in both themes. Record iOS/Scriptable versions and Home Screen settings. Display Zoom and large icons still need device calibration; passing mocked layout tests does not establish pixel-perfect rendering.
