Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Schließplan Generator - Lokaler Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starte lokalen HTTP-Server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Die Anwendung ist dann erreichbar unter:" -ForegroundColor Green
Write-Host "  http://localhost:8000" -ForegroundColor Green
Write-Host ""
Write-Host "Zum Beenden: Strg+C drücken" -ForegroundColor Yellow
Write-Host ""

# Prüfe ob Python installiert ist
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "FEHLER: Python ist nicht installiert!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Bitte installieren Sie Python von: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "ODER verwenden Sie Node.js:" -ForegroundColor Yellow
    Write-Host "  npx http-server -p 8000" -ForegroundColor Green
    pause
    exit
}

# Starte HTTP-Server
python -m http.server 8000

