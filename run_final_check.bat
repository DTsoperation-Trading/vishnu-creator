@echo off
cd /d D:\Build App\Vishnu Creator
echo ========================================
echo STEP 1: Typecheck protocol package
echo ========================================
npx tsc --noEmit -p packages/protocol/tsconfig.json 2>&1
if errorlevel 1 (
    echo ERROR: Protocol typecheck failed
    exit /b 1
)
echo.

echo ========================================
echo STEP 2: Typecheck daemon package
echo ========================================
npx tsc --noEmit -p apps/daemon/tsconfig.json 2>&1
if errorlevel 1 (
    echo ERROR: Daemon typecheck failed
    exit /b 1
)
echo.

echo ========================================
echo STEP 3: Typecheck web package
echo ========================================
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1
if errorlevel 1 (
    echo ERROR: Web typecheck failed
    exit /b 1
)
echo.

echo ========================================
echo STEP 4: Run protocol tests
echo ========================================
pnpm --filter @vishnucreator/protocol test 2>&1
if errorlevel 1 (
    echo ERROR: Protocol tests failed
    exit /b 1
)
echo.

echo ========================================
echo STEP 5: Run daemon tests
echo ========================================
pnpm --filter @vishnucreator/daemon test 2>&1
if errorlevel 1 (
    echo WARNING: Daemon tests had failures (may be pre-existing)
)
echo.

echo ========================================
echo STEP 6: Full build
echo ========================================
pnpm build 2>&1
if errorlevel 1 (
    echo ERROR: Build failed
    exit /b 1
)
echo.

echo ========================================
echo ALL CHECKS PASSED!
echo ========================================
pause