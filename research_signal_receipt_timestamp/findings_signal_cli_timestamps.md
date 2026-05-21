# Findings: signal-cli timestamp format

## Key Findings

1. **All timestamps in signal-cli are Unix milliseconds (ms), not seconds.**
   Signal uses `System.currentTimeMillis()` (Java) throughout, which returns milliseconds since the Unix epoch.

2. **`sendReceipt` `-t` / `--target-timestamp` expects milliseconds.**
   The argument is typed as `long` in Java and passed directly to `SignalServiceReceiptMessage` as the list of target message timestamps. The REST API wrapper passes it as `int64` without conversion. Example from GitHub issue #1570: `1724264957132` (13 digits = ms).

3. **JSON output `timestamp` field is milliseconds.**
   `JsonMessageEnvelope.timestamp` is a `long` sourced from `MessageEnvelope.timestamp()` which comes from `SignalServiceEnvelope.getTimestamp()` — the raw protobuf value from the Signal service, always in ms. Real examples from issue #1570 show values like `1724265071110` (milliseconds).

4. **`JsonReceiptMessage.when` is milliseconds.**
   `SendReceiptAction` constructs `new SignalServiceReceiptMessage(type, timestamps, System.currentTimeMillis())` — the third argument (`when`) is explicitly `System.currentTimeMillis()`, i.e., current time in **milliseconds**.

5. **`JsonReceiptMessage.timestamps` list is milliseconds.**
   These are the target message timestamps (the IDs of messages being acknowledged). They come directly from the user-supplied `-t` arguments or from envelope timestamps, which are always in ms.

6. **signal-cli-rest-api REST API `Receipt.Timestamp` is `int64` and is passed verbatim to signal-cli.**
   In `client.go`, `SendReceipt(... timestamp int64 ...)` passes the value straight to `signal-cli sendReceipt -t <value>` with no unit conversion. So the REST API also expects **milliseconds**.

7. **Signal protocol itself uses milliseconds for message timestamps.**
   The `SignalServiceEnvelope.getTimestamp()` method in `libsignal-service-java` returns the protobuf `DataMessage.timestamp` field, which is a `uint64` representing Unix milliseconds. This is the canonical message ID in the Signal protocol (used for quoting, reactions, receipts, remote delete, etc.).

## Evidence from Source Code

### `SendReceiptAction.java` (signal-cli)
```java
// System.currentTimeMillis() — explicitly milliseconds
final var receiptMessage = new SignalServiceReceiptMessage(type, timestamps, System.currentTimeMillis());
```
Source: https://raw.githubusercontent.com/AsamK/signal-cli/master/lib/src/main/java/org/asamk/signal/manager/actions/SendReceiptAction.java

### `JsonMessageEnvelope.java` (signal-cli)
```java
// All timestamp fields typed as `long` — milliseconds
long timestamp,
long serverReceivedTimestamp,
long serverDeliveredTimestamp,
```
Source: https://raw.githubusercontent.com/AsamK/signal-cli/master/src/main/java/org/asamk/signal/json/JsonMessageEnvelope.java

### `JsonReceiptMessage.java` (signal-cli)
```java
// `when` and `timestamps` are List<Long> — milliseconds
record JsonReceiptMessage(long when, boolean isDelivery, boolean isRead, boolean isViewed, List<Long> timestamps)
```
Source: https://raw.githubusercontent.com/AsamK/signal-cli/master/src/main/java/org/asamk/signal/json/JsonReceiptMessage.java

### `SendReceiptCommand.java` (signal-cli)
```java
// -t / --target-timestamp typed as long.class — caller provides ms value
subparser.addArgument("-t", "--target-timestamp")
    .type(long.class)
    .nargs("+")
    .required(true)
    .help("Specify the timestamp of the messages for which a receipt should be sent.");
```
Source: https://raw.githubusercontent.com/AsamK/signal-cli/master/src/main/java/org/asamk/signal/commands/SendReceiptCommand.java

### `client.go` (signal-cli-rest-api)
```go
// No unit conversion — int64 passed directly to signal-cli
func (s *SignalClient) SendReceipt(number string, recipient string, receipt_type string, timestamp int64) error {
    cmd = append(cmd, []string{"-t", strconv.FormatInt(timestamp, 10)}...)
```
Source: https://raw.githubusercontent.com/bbernhard/signal-cli-rest-api/master/src/client/client.go

### Real example from GitHub issue #1570
```json
{
  "envelope": {
    "timestamp": 1724265071110,
    "syncMessage": {
      "readMessages": [
        {
          "timestamp": 1724264957132
        }
      ]
    }
  }
}
```
Both values are 13-digit numbers, confirming **milliseconds** (Unix seconds would be 10 digits at this era).
Source: https://github.com/AsamK/signal-cli/issues/1570

## Conclusion

**Signal-cli uses Unix milliseconds (ms) for all timestamps everywhere:**
- Outgoing `--target-timestamp` argument to `sendReceipt`: **milliseconds**
- Incoming `envelope.timestamp` in JSON output: **milliseconds**
- `receiptMessage.when`: **milliseconds** (`System.currentTimeMillis()`)
- `receiptMessage.timestamps` list (the acked message IDs): **milliseconds**
- signal-cli-rest-api `Receipt.Timestamp` field: **milliseconds** (passed through unchanged)

There is no seconds-based timestamp in signal-cli. The Signal protocol itself uses ms since epoch as the canonical message identifier.

## Sources

- **SendReceiptAction.java**: https://github.com/AsamK/signal-cli/blob/master/lib/src/main/java/org/asamk/signal/manager/actions/SendReceiptAction.java
- **JsonMessageEnvelope.java**: https://github.com/AsamK/signal-cli/blob/master/src/main/java/org/asamk/signal/json/JsonMessageEnvelope.java
- **JsonReceiptMessage.java**: https://github.com/AsamK/signal-cli/blob/master/src/main/java/org/asamk/signal/json/JsonReceiptMessage.java
- **SendReceiptCommand.java**: https://github.com/AsamK/signal-cli/blob/master/src/main/java/org/asamk/signal/commands/SendReceiptCommand.java
- **MessageEnvelope.java**: https://github.com/AsamK/signal-cli/blob/master/lib/src/main/java/org/asamk/signal/manager/api/MessageEnvelope.java
- **signal-cli-rest-api client.go**: https://github.com/bbernhard/signal-cli-rest-api/blob/master/src/client/client.go
- **GitHub issue #1570** (real timestamp examples): https://github.com/AsamK/signal-cli/issues/1570
- **signal-cli man page**: https://github.com/AsamK/signal-cli/blob/master/man/signal-cli.1.adoc
