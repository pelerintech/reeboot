# Spec: SearXNG auto-detection

## SD-1: probeSearXNG returns null when no known ports respond

GIVEN http://localhost:8080, :8888, :4000 all time out or return non-JSON
WHEN probeSearXNG() is called
THEN returns null

## SD-2: probeSearXNG returns first responding URL

GIVEN http://localhost:8080 returns valid JSON with "results" key
WHEN probeSearXNG() is called
THEN returns "http://localhost:8080"

## SD-3: probeSearXNG tries ports in order and returns first match

GIVEN http://localhost:8080 times out
AND http://localhost:8888 returns valid SearXNG JSON
WHEN probeSearXNG() is called
THEN returns "http://localhost:8888"

## SD-4: probeSearXNG rejects false positives (JSON but no results key)

GIVEN http://localhost:8080 returns valid JSON but without a "results" key
WHEN probeSearXNG() is called
THEN does not return "http://localhost:8080" for that port

## SD-5: wizard pre-fills URL input when SearXNG detected

GIVEN probeSearXNG returns "http://localhost:8080"
WHEN runSearXNGSubflow() runs
THEN prompter shows input pre-filled with "http://localhost:8080"
AND message is "SearXNG URL (confirm or edit):"

## SD-6: wizard shows hint URL when SearXNG not detected

GIVEN probeSearXNG returns null
WHEN runSearXNGSubflow() runs
THEN prompter shows input pre-filled with "http://localhost:8888"
AND message is "SearXNG URL:"

## SD-7: wizard uses user-confirmed URL

GIVEN probeSearXNG returns "http://localhost:8080"
AND user confirms without editing
WHEN runSearXNGSubflow() completes via "Use URL directly"
THEN returns { provider: "searxng", searxngBaseUrl: "http://localhost:8080", apiKey: "" }

## SD-8: wizard uses user-edited URL

GIVEN probeSearXNG returns "http://localhost:8080"
AND user edits to "http://localhost:7777"
WHEN runSearXNGSubflow() completes via "Use URL directly"
THEN returns { provider: "searxng", searxngBaseUrl: "http://localhost:7777", apiKey: "" }

## SD-9: wizard can start new container from subflow

GIVEN user enters a URL and selects "Start new reeboot-searxng container on port 8888"
WHEN runSearXNGSubflow() runs
THEN docker run is called for reeboot-searxng on port 8888
AND returns { provider: "searxng", searxngBaseUrl: "http://localhost:8888", apiKey: "" }

## SD-10: config default URL is http://localhost:8888

GIVEN config.ts SearchConfigSchema
WHEN parsed with no searxngBaseUrl provided
THEN searxngBaseUrl defaults to "http://localhost:8888"
