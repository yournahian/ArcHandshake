@echo off
echo Committing and pushing all changes (including CCTP and missing hook/lib files)...
git add -A
git commit -m "feat: complete CCTP integration and add missing wallet and client files"
git push
echo Done!
pause

