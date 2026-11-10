@echo off
cd /d D:\Build App\Vishnu Creator
echo ========================================
echo STEP 1: Typecheck protocol package
echo ========================================
npx tsc --noEmit -p packages/protocol/tsconfig.json
if errorlevel 1 (
    echo ERROR: Protocol typecheck failed
    exit /b 1
)
echo.

echo ========================================
echo STEP 2: Typecheck daemon package
echo ========================================
npx tsc --noEmit -p apps/daemon/tsconfig.json
if errorlevel 1 (
    echo ERROR: Daemon typecheck failed
    exit /b 1
)
echo.

echo ========================================
echo STEP 3: Run protocol tests
echo ========================================
pnpm --filter @vishnucreator/protocol test
if errorlevel 1 (
    echo ERROR: Protocol tests failed
    exit /b 1
)
echo.

echo ========================================
echo STEP 4: Full build
echo ========================================
pnpm build
if errorlevel 1 (
    echo ERROR: Build failed
    exit /b 1
)
echo.

echo ========================================
echo ALL CHECKS PASSED!
echo ========================================
pause