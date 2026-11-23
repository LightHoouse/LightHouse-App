# Extended desktop trial, 2026-11-23

Target: packaged v0.2.2 with deployed backend and real AI streaming. Native Windows test applications only.

Initial asymmetric demonstration: 120 injected interactions produced 132 events, all uploaded. Three pause cycles froze capture and elapsed time. Mongo checks passed for contiguous sequence, unique event IDs, event count, two processes, and redacted typed values. The first question (open project) resolved its exact native control and streamed 11 deltas. The second question (add data) returned an AI error/no matching step. In this demonstration that control was recorded only in the other process. This cross-application case is not proven reliable and must not be represented as passing.

A follow-up balances demonstrations so each named control occurs in both processes. This isolates same-application retrieval from the unresolved cross-application case. Results are recorded separately; it does not erase the original failure.

Balanced v0.2.2 trial: all six named questions resolved exact native control coordinates, and two later answer requests streamed successfully (one deliberately missing target). Membership survived student restart; Ask-disabled requests were rejected; a second recording contained five events with sequence restarting at 1 while the first remained unchanged. The final group-close check failed at the chat reopening assertion, so the entire long scenario is not marked passed. A later source rerun was interrupted by a missing native fixture control during recording.

## Real application verification

Windows Calculator source test passed with five recorded controls (Clear, 7, Plus, 8, Equals), 23 provider deltas, visible intermediate streamed text, mouse-following chat, and the companion at the exact Equals target. It remained after 11 seconds, ignored a click on another button, and returned after the target was clicked. No task-completion inference is made from that click. A subsequent packaged run was interrupted by pointer movement during the no-pointer-movement assertion and is not marked passed.

Native desktop tests share the user's desktop; changing focus, minimizing windows, or moving the mouse during a run can invalidate input/position assertions. Do not hide these failures or equate fixture results with universal application support.
