# Action coverage and limits

| Action | Capture / guide | Verification and limits |
| --- | --- | --- |
| Click / right click | UIA identity + live cursor target | Actual click in target; outcome only if recorded observable state changes match |
| Double click | Timing classification | Currently target interaction acknowledgement, not verified double-click semantics |
| Typing | Event only; no typed text | Guide own input; does not reproduce recorded content |
| Scroll | Container when available, direction, delta, modifiers | Student wheel in target and direction; exact scroll distance is not enforced |
| Drag / rectangle / resize | Relative start, path samples, end, mouse button | Guide animates path; matching start/end and ordered path samples within tolerance |
| Freehand stroke | Sampled path up to 256 points | Approximate geometric guidance, not pixel-perfect drawing or document-content verification |
| Pan | Middle-button drag or held Space when observed | Requires the same resolvable viewport; zoom/pan changes document coordinates |
| Zoom | Ctrl+wheel recorded as scroll plus modifier | Requires modifier/direction; absolute document zoom not synchronized |
| Command shortcut | Ctrl/Alt plus letter or Delete, excluding Lighthouse shortcuts | Key combination in target window; no general keylogger or raw text |
| Tool hotkeys R/V/B, Escape, Delete without modifier | Not yet captured as semantic tool commands | Must resolve whether focus is text or canvas before adding safe support |
| Menus, dialogs, drag across windows | Partial UIA support | Disappearing targets may be unavailable; cross-window drag is rejected |
| Touch, pinch, pressure, stylus tilt | Unsupported | No pointer-device or pressure pipeline |

Paint, Miro and Figma are applications to certify individually, not automatic support claims. The current native fixture covers a named canvas and gestures; Calculator covers real app capture and streamed guidance. Figma/Miro custom canvas accessibility, zoom, pan, toolbar state and document object identity still need dedicated live verification. Target-relative coordinates adapt to viewport size, not to arbitrary document transforms. Never report a drawing is correct solely because its pointer path matched.
