# OB-7: Webchat Observability Tab

A "Logs" tab in the web interface showing the live log stream and error alerting badge.

---

## OB-7-A: Logs tab exists in the webchat

GIVEN the webchat is open in a browser  
WHEN the user clicks the "Logs" tab  
THEN a log stream view is shown  
AND it connects to `GET /api/logs/stream` via the browser's EventSource API  
AND log records appear as they are emitted, newest at the bottom

---

## OB-7-B: Level filter controls which records are shown

GIVEN the Logs tab is open  
WHEN the user selects "warn" from the level dropdown  
THEN only warn, error, and fatal records are displayed  
AND records at debug or info are hidden (client-side filter on the already-received stream)

---

## OB-7-C: Pause and resume work

GIVEN the Logs tab is open and streaming  
WHEN the user clicks "Pause"  
THEN no new records are appended to the view (but the SSE connection stays open)  
WHEN the user clicks "Resume"  
THEN new records appear again (records received during pause are discarded, not buffered)

---

## OB-7-D: Error/fatal badge is visible from all tabs

GIVEN the webchat is open on any tab (chat, tasks, etc.)  
WHEN an `error` or `fatal` log record is received on the SSE stream  
THEN a red badge with an error count appears on the "Logs" tab label  
AND it is visible regardless of which tab is currently active

---

## OB-7-E: Badge resets when Logs tab is focused

GIVEN the error badge shows a count of N  
WHEN the user clicks the "Logs" tab  
THEN the badge count resets to 0  
AND the badge disappears
