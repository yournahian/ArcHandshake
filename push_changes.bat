@echo off
echo Committing and pushing Circle API Sandbox base URL fixes...
git add apps/web/src/app/api/circle/user/route.ts
git add apps/web/src/app/api/circle/wallet/route.ts
git add apps/web/src/app/api/circle/transfer/route.ts
git add apps/web/src/app/api/circle/execute/route.ts
git commit -m "fix(circle): dynamic base URL for sandbox environment"
git push
echo Done!
pause
