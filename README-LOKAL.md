# 🚀 Lokale Version starten

## Schnellstart (Windows)

### Option 1: Mit Python (empfohlen)
1. Doppelklick auf `start-local.bat`
2. Browser öffnen: http://localhost:8000

### Option 2: Mit PowerShell
1. Rechtsklick auf `start-local.ps1` → "Mit PowerShell ausführen"
2. Browser öffnen: http://localhost:8000

### Option 3: Mit Node.js
```bash
npx http-server -p 8000
```
Dann Browser öffnen: http://localhost:8000

---

## Manuell starten

### Python (falls installiert):
```bash
python -m http.server 8000
```

### Node.js (falls installiert):
```bash
npx http-server -p 8000
```

### PHP (falls installiert):
```bash
php -S localhost:8000
```

---

## ⚠️ WICHTIG

**Die Datei `index.html` NICHT direkt im Browser öffnen!**
- ES Modules funktionieren nicht mit `file://` Protokoll
- Supabase kann nicht geladen werden
- **Strapi-API** (`/api/...`) wird von Browsern bei `file://` oft geblockt (CORS, `origin: null`)
- `env-config.js` nutzt unter **http://localhost** automatisch **Strapi auf http://localhost:1337**; die Cloud-URL funktioniert nur mit einer echten Website-Origin (z. B. Netlify)
- Sie MÜSSEN einen lokalen HTTP-Server verwenden (`start-local.bat` / Port 8000)

---

## ✅ Nach dem Start

1. Browser öffnen: http://localhost:8000
2. Warten bis Loading Screen fertig ist
3. Registrieren/Login oder als Gast fortfahren
4. Schließplan erstellen

---

## 🛑 Server beenden

- Im Terminal: `Strg + C` drücken

