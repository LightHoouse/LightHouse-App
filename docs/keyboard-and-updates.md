# Keyboard context and version checks

The Windows recorder captures Ctrl/Alt + A-Z shortcuts and Delete, Escape, Tab, Enter, and F1-F12. Modifier keys are retained. Ordinary typing is recorded as a redacted `type` event; typed text is never retained. Input identity comes from Windows UI Automation, and may be blank or ambiguous. It is not necessarily the HTML ID, a source-code variable, or the ID of an object created inside an editor.

Settings shows the running application version. **Periksa update** queries the latest published GitHub release and only offers a numerically newer stable version. Network failures are shown separately from an up-to-date result. **Buka unduhan resmi** opens the project's release page; finish any active recording first. Installation remains manual: download and run the Windows installer. This does not synchronize versions automatically across a classroom and does not install updates silently.
