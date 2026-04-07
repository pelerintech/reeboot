# Spec: config passthrough to web-search extension

## CP-1: web_search tool is registered when provider is duckduckgo

GIVEN reeboot config has search.provider="duckduckgo"
WHEN webSearchExtension(pi, config) is called
THEN pi.registerTool is called with name="web_search"

## CP-2: web_search tool is NOT registered when provider is none

GIVEN reeboot config has search.provider="none"
WHEN webSearchExtension(pi, config) is called
THEN pi.registerTool is called only once (fetch_url only)
AND no tool named "web_search" is registered

## CP-3: fetch_url tool is always registered regardless of provider

GIVEN reeboot config has search.provider="none"
WHEN webSearchExtension(pi, config) is called
THEN pi.registerTool is called with name="fetch_url"

## CP-4: web_search tool is registered for all non-none providers

GIVEN reeboot config has search.provider="brave" (or tavily, serper, exa, searxng)
WHEN webSearchExtension(pi, config) is called
THEN pi.registerTool is called with name="web_search"

## CP-5: extension handles missing config gracefully

GIVEN webSearchExtension(pi) is called with no second argument
WHEN the extension initialises
THEN only fetch_url is registered (provider defaults to "none")
AND no error is thrown

## CP-6: loader passes config to web-search factory

GIVEN getBundledFactories(config) is called with a config object
WHEN the web-search factory executes
THEN it calls web-search extension default export with both pi and config as arguments
