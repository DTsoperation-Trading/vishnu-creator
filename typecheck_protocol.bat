@echo off
cd /d D:\Build App\Vishnu Creator
npx tsc --noEmit -p packages/protocol/tsconfig.json 2>&1
pause