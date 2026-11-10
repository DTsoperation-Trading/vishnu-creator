@echo off
cd /d D:\Build App\Vishnu Creator
pnpm --filter @vishnucreator/protocol test 2>&1
pause