@echo off
echo ========================================
echo   SchlieBplan Generator - Lokaler Server
echo ========================================
echo.
echo Starte lokalen HTTP-Server...
echo.
echo Die Anwendung ist dann erreichbar unter:
echo   http://localhost:8000
echo.
echo Zum Beenden: Strg+C druecken
echo.
python -m http.server 8000
pause

