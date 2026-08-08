# Capability: release mechanics

The release is made real: versions bumped, tree clean, and a `v2.7.0` tag cut and pushed.

## Scenarios

### Version is bumped everywhere

GIVEN the release is `2.7.0`
WHEN the version task completes
THEN `reeboot/package.json` `version` equals `2.7.0`
AND the hardcoded `serverVersion` constant in `reeboot/src/server.ts` equals `2.7.0`
AND `webchat/package.json` is unchanged.

### Release is cut from committed code

GIVEN the release commit is created
WHEN the tree is inspected at tagging time
THEN the working tree is clean (no uncommitted source/feature changes)
AND `research_dify/` (untracked, excluded by request) is not part of any commit or the tag.

### A v2.7.0 tag exists

GIVEN the release is complete
WHEN the user runs `git tag`
THEN `v2.7.0` is present, pointing at the release commit
AND it is an annotated tag.

### The tag and branch are pushed

GIVEN `v2.7.0` has been cut
WHEN the release is pushed
THEN `origin` has the `v2.7.0` tag
AND `origin/main` includes the release commit.
