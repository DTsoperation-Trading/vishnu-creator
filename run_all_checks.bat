@echo off
cd /d D:\Build App\Vishnu Creator
echo === Typecheck protocol package ===
npx tsc --noEmit -p packages/protocol/tsconfig.json 2>&1
echo.
echo === Typecheck daemon package ===
npx tsc --noEmit -p apps/daemon/tsconfig.json 2>&1
echo.
echo === Run protocol tests ===
pnpm --filter @vishnucreator/protocol test 2>&1
echo.
echo === Run daemon tests ===
pnpm --filter @vishnucreator/daemon test 2>&1
pause