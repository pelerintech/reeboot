# Spec: TypeScript 6 build

## Capability 1 — tsc compiles cleanly under TypeScript 6

GIVEN `typescript@^6.0.2` is installed  
AND `tsconfig.json` has `"types": ["node"]` in `compilerOptions`  
WHEN `npm run build` runs  
THEN `tsc` exits 0 with no errors or warnings

## Capability 2 — all existing tests continue to pass

GIVEN the TypeScript 6 upgrade is complete  
WHEN `npm run test:run` runs  
THEN all tests pass (same count as before the upgrade)

## Capability 3 — tsx handles TS 6 source

GIVEN TypeScript 6 is installed  
WHEN `npx tsx --version` runs  
THEN it exits 0 (tsx is not broken by the TS 6 upgrade)
