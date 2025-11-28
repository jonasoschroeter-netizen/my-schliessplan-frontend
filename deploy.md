# Deployment-Anleitung für Schließplan Generator

## Option 1: GitHub Pages (Empfohlen - KOSTENLOS)

### Schritt 1: GitHub Pages aktivieren
1. Gehe zu: https://github.com/jonasoschroeter-netizen/my-schliessplan-frontend
2. Klicke auf **Settings** (oben im Repository
3. Scrolle runter zu **Pages** (linke Seitenleiste)
4. Unter **Source** wähle: **Deploy from a branch**
5. Branch: **master**
6. Folder: **/ (root)**
7. Klicke auf **Save**

### Schritt 2: Warte 1-2 Minuten
Die Anwendung ist dann verfügbar unter:
- **https://jonasoschroeter-netizen.github.io/my-schliessplan-frontend/**

---

## Option 2: Netlify (Auch kostenlos, einfacher)

### Schritt 1: Registriere dich bei Netlify
1. Gehe zu: https://www.netlify.com/
2. Klicke auf **Sign up** → **GitHub**
3. Erlaube den Zugriff

### Schritt 2: Site importieren
1. Klicke auf **Add new site** → **Import an existing project**
2. Wähle **GitHub** aus
3. Wähle dein Repository: `my-schliessplan-frontend`
4. Klicke auf **Deploy site**

### Schritt 3: Fertig!
Netlify gibt dir automatisch eine URL, z.B.:
- **https://my-schliessplan-frontend.netlify.app**

---

## Option 3: Vercel (Auch kostenlos)

### Schritt 1: Registriere dich
1. Gehe zu: https://vercel.com/
2. Klicke auf **Sign up** → **GitHub**

### Schritt 2: Projekt importieren
1. Klicke auf **Import Project**
2. Wähle dein Repository
3. Klicke auf **Deploy**

### Schritt 3: Fertig!
Vercel gibt dir automatisch eine URL.

---

## Was du BRAUCHST:

### ✅ WAS DU BEREITS HAST:
- GitHub Repository ✓
- Frontend-Code ✓
- Backend API (Strapi) ✓

### ⚙️ Was noch zu beachten ist:

**CORS (Cross-Origin Resource Sharing):**
Das Strapi Backend muss deine neue Domain erlauben. Du musst in Strapi die CORS-Einstellungen anpassen:

1. Gehe zu deinem Strapi Dashboard
2. **Settings** → **Users & Permissions plugin** → **Roles** → **Public**
3. Erlaube die nötigen Permissions für deine APIs
4. In der Strapi-Konfiguration (`config/plugins.js` oder `config/middlewares.js`):

```javascript
cors: {
  enabled: true,
  origin: [
    'http://localhost:3000',
    'https://jonasoschroeter-netizen.github.io',  // ← Deine GitHub Pages URL
    'https://my-schliessplan-frontend.netlify.app', // ← Falls Netlify
  ]
}
```

---

## 📝 Welche Option soll ich einrichten?

Sag mir einfach **"GitHub Pages"**, **"Netlify"** oder **"Vercel"** und ich bereite alles für dich vor!


