# Findings: signal-cli-rest-api receipts endpoint spec

## Key Findings

- **The `timestamp` field in `POST /v1/receipts/{number}` expects milliseconds (Unix ms), NOT seconds.**
- The `Receipt` struct in `api.go` defines `Timestamp` as `int64` with no conversion — it is passed **directly** to signal-cli's `-t` flag as-is.
- signal-cli's `DateUtils.formatTimestamp(long timestamp)` calls `new Date(timestamp)`, which in Java takes **milliseconds** — confirming the internal representation is Unix ms.
- signal-cli's `JsonMessageEnvelope` and `JsonDataMessage` both carry `long timestamp` fields that represent the message timestamp in milliseconds (as emitted by the Signal protocol).
- The `SendReceipt` function in `client.go` does **no unit conversion** — it passes the timestamp integer directly to `signal-cli sendReceipt -t <timestamp>`.
- The swagger spec (`swagger.yaml`) documents `timestamp` as `type: integer` with no description or example value, so it provides no explicit unit annotation.
- **Conclusion: Our current code `Math.floor(msg.timestamp / 1000)` is WRONG.** We should send `msg.timestamp` directly (milliseconds), because `msg.timestamp` is already in Unix ms and signal-cli expects ms.

## Supporting Evidence

### 1. `Receipt` struct in `src/api/api.go` (line 114–118)
```go
type Receipt struct {
    Recipient   string `json:"recipient"`
    ReceiptType string `json:"receipt_type" enums:"read,viewed"`
    Timestamp   int64  `json:"timestamp"`
}
```
No conversion, no comment about units.

### 2. `SendReceipt` handler in `src/api/api.go` (line 1982–2024)
```go
err = a.signalClient.SendReceipt(number, req.Recipient, req.ReceiptType, req.Timestamp)
```
The `req.Timestamp` from the JSON body is passed directly to `signalClient.SendReceipt`.

### 3. `SendReceipt` in `src/client/client.go` (line 2248–2284)
```go
func (s *SignalClient) SendReceipt(number string, recipient string, receipt_type string, timestamp int64) error {
    // ...
    // CLI mode:
    cmd = append(cmd, []string{"-t", strconv.FormatInt(timestamp, 10)}...)
    // JSON-RPC mode:
    request.Timestamp = timestamp  // field: "target-timestamp"
```
The timestamp is passed as-is to `signal-cli sendReceipt -t`. No `/1000` or `*1000` conversion.

### 4. `DateUtils.java` in signal-cli confirms ms representation
```java
public static String formatTimestamp(long timestamp) {
    var date = new Date(timestamp);  // Java Date(long) takes milliseconds
    ...
}
```
Signal-cli interprets all internal timestamps as **milliseconds** when formatting. This is the same representation used throughout the Signal protocol.

### 5. signal-cli man page / `SendReceiptCommand.java`
The `-t / --target-timestamp` argument is documented as:
> "Specify the timestamp of the messages for which a receipt should be sent."
No unit specified in the man page, but the Java internals confirm it is Unix ms.

### 6. Swagger spec (`src/docs/swagger.yaml`)
```yaml
api.Receipt:
  properties:
    receipt_type:
      enum: [read, viewed]
      type: string
    recipient:
      type: string
    timestamp:
      type: integer
  required: [receipt_type, recipient, timestamp]
```
`type: integer`, no `format`, no `example` — no explicit unit annotation.

## Implications for Our Code

| Current code | Correct code |
|---|---|
| `Math.floor(msg.timestamp / 1000)` (seconds) | `msg.timestamp` (milliseconds) |

`msg.timestamp` on `IncomingMessage` is already Unix milliseconds. Dividing by 1000 converts it to seconds, which signal-cli would interpret as a timestamp in January 1970 — causing the receipt to silently fail or be ignored.

## Sources

- **signal-cli-rest-api `api.go`**: https://raw.githubusercontent.com/bbernhard/signal-cli-rest-api/master/src/api/api.go
- **signal-cli-rest-api `client.go`**: https://raw.githubusercontent.com/bbernhard/signal-cli-rest-api/master/src/client/client.go
- **signal-cli-rest-api `swagger.yaml`**: https://raw.githubusercontent.com/bbernhard/signal-cli-rest-api/master/src/docs/swagger.yaml
- **signal-cli `SendReceiptCommand.java`**: https://raw.githubusercontent.com/AsamK/signal-cli/master/src/main/java/org/asamk/signal/commands/SendReceiptCommand.java
- **signal-cli `DateUtils.java`**: https://raw.githubusercontent.com/AsamK/signal-cli/master/src/main/java/org/asamk/signal/util/DateUtils.java
- **signal-cli `MessageEnvelope.java`**: https://raw.githubusercontent.com/AsamK/signal-cli/master/lib/src/main/java/org/asamk/signal/manager/api/MessageEnvelope.java
- **signal-cli-rest-api GitHub repo**: https://github.com/bbernhard/signal-cli-rest-api
