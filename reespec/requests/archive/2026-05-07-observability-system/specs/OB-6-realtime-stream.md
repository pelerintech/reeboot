# OB-6: Real-Time Log Stream

SSE endpoint and CLI command for live log tailing.

---

## OB-6-A: SSE endpoint streams log records

GIVEN the server is running  
WHEN a client connects to `GET /api/logs/stream`  
THEN the connection is upgraded to SSE (text/event-stream)  
AND every subsequent log record (from pino) is sent as an SSE event with NDJSON data  
AND every subsequent audit event (from emitEvent) is sent as an SSE event  
AND the connection stays open until the client disconnects

---

## OB-6-B: Level filter is respected

GIVEN a client connects to `GET /api/logs/stream?level=warn`  
WHEN a `debug` log record is emitted  
THEN the debug record is NOT sent to this client  
WHEN a `warn` log record is emitted  
THEN the warn record IS sent to this client

---

## OB-6-C: Multiple concurrent SSE clients are supported

GIVEN two clients are connected to `/api/logs/stream`  
WHEN a log record is emitted  
THEN both clients receive the record  
WHEN one client disconnects  
THEN the other client continues to receive records without error

---

## OB-6-D: reeboot logs --follow connects to the stream

GIVEN the reeboot server is running  
WHEN `reeboot logs --follow` is executed in the terminal  
THEN it connects to `/api/logs/stream`  
AND prints each record in a human-readable format (pino-pretty style)  
AND exits cleanly on Ctrl-C

---

## OB-6-E: reeboot logs --follow falls back to file

GIVEN the reeboot server is NOT running  
WHEN `reeboot logs --follow` is executed  
THEN it tails the most recent log file in `~/.reeboot/logs/`  
AND prints a notice: "Server not running — tailing log file: <path>"
