# CRM System - Design & Technologie

## 🎯 Ziel: Schnelles, vorübergehendes CRM (später erweiterbar)

---

## 💾 WO & WIE speichern wir die Daten?

### **Option 1: Strapi erweitern** (EMPFOHLEN ✅)

**VORTEILE:**
- ✅ Nutzt dein existierendes Backend
- ✅ Automatisches Admin-Panel
- ✅ API für später
- ✅ Keine zusätzliche Datenbank nötig
- ✅ Schnell umsetzbar

**DATENSTRUKTUR in Strapi:**

#### Content Type: `Kunden`
```yaml
Fields:
  - name: string
  - email: string
  - telefon: string
  - adresse: text
  - branche: string
  - status: enumeration (aktiv, inaktiv, potentiell)
  - kunden_seit: date
  - notizen: richtext
  - schliesplaene: relation (mehrere Schließpläne)
```

#### Content Type: `Projekte`
```yaml
Fields:
  - projektname: string
  - kunde: relation (ein Kunde)
  - status: enumeration (anfrage, in_bearbeitung, abgeschlossen, storniert)
  - erstellt_am: date
  - abschluss_am: date
  - budget: number
  - ansprechpartner: string
  - beschreibung: richtext
```

#### Content Type: `Angebote`
```yaml
Fields:
  - angebots_nummer: string
  - projekt: relation (ein Projekt)
  - kunde: relation (ein Kunde)
  - datum: date
  - gueltig_bis: date
  - gesamtpreis: number
  - status: enumeration (entwurf, versendet, angenommen, abgelehnt)
  - positionen: component (wiederholbar)
```

#### Content Type: `Schließpläne` (bereits vorhanden)
```yaml
Fields:
  - name: string
  - kunde: relation (ein Kunde) ← NEU
  - projekt: relation (ein Projekt) ← NEU
  - datum_erstellt: date
  - zylinder_data: JSON
  - schlueselmatrix: JSON
  - als_pdf_exportiert: boolean
```

---

### **Option 2: Supabase** (Alternative)

**VORTEILE:**
- ✅ PostgreSQL (professionelle Datenbank)
- ✅ SQL-Queries möglich
- ✅ Authentication eingebaut
- ✅ Realtime Features
- ✅ REST & GraphQL API automatisch

**DATENSTRUKTUR:**
```sql
-- Tabelle: customers
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  name TEXT,
  email TEXT,
  created_at TIMESTAMP
);

-- Tabelle: projects
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  name TEXT,
  status TEXT
);

-- etc.
```

---

### **Option 3: Firebase** (Alternative)

**VORTEILE:**
- ✅ Sehr schnell Setup
- ✅ Realtime Database
- ✅ Firebase Hosting
- ⚠️ Nach zahlreiche Schreibvorgänge kostenpflichtig

---

## 🏗️ ARCHITEKTUR

### Aktuell:
```
Frontend (GitHub Pages) → Strapi Backend → Daten
```

### Mit CRM:
```
┌─────────────────────────────────────┐
│     Frontend (Schließplan-Gen)      │
│          GitHub Pages                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Strapi Backend (1 Backend)     │
│  ┌───────────────────────────────┐  │
│  │  Content Types:               │  │
│  │  - Objekttypen                │  │
│  │  - Zylinder                   │  │
│  │  - Fragen                     │  │
│  │  ───────────                  │  │
│  │  CRM:                         │  │
│  │  - Kunden                     │  │
│  │  - Projekte                   │  │
│  │  - Angebote                   │  │
│  │  - Schließpläne (linked)      │  │
│  └───────────────────────────────┘  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         PostgreSQL Datenbank        │
│    (von Strapi verwaltet)           │
└─────────────────────────────────────┘
```

---

## 📋 IMPLEMENTIERUNG

### Phase 1: Datenmodell in Strapi (30 Minuten)

**WAS zu tun:**

1. **Strapi Admin öffnen:**
   - Gehe zu: `https://brave-basketball-98ec57b285.strapiapp.com/admin`

2. **Neue Content Types erstellen:**
   - Settings → Content Types → Create
   - Erstelle: `Kunden`, `Projekte`, `Angebote`

3. **Relations konfigurieren:**
   - Kunde → hat viele Projekte
   - Projekt → gehört zu einem Kunden
   - Angebot → gehört zu einem Projekt & Kunden
   - Schließplan → gehört zu einem Kunden & Projekt

### Phase 2: Schnelles Admin-Panel

**Option A: Strapi Admin nutzen** (0 Zeit)
- Strapi hat bereits ein Admin-Panel
- Einfach Content Types erstellen
- ✅ Fertig!

**Option B: Minimales CRM-Frontend** (2-3 Stunden)
```html
Seite 1: Kundenvübersicht
Seite 2: Projektdetail
Seite 3: Angebot erstellen
```

### Phase 3: Vollständiges CRM (später)

- Kanban Board für Projekte
- Automatische E-Mails
- PDF-Generator für Angebote
- Dashboard mit KPIs
- Rechnungsstellung

---

## 🚀 WAS SOLLTE ICH JETZT BAUEN?

**Für DICH empfehle ich:**

1. **Strapi erweitern** (schnellste Lösung)
2. **Phase 1:** Content Types erstellen
3. **Phase 2:** Schnelles CRM-Frontend

**Fragen an dich:**
1. Willst du Strapi als Basis nutzen? (empfohlen)
2. Was für Funktionen brauchst du SOFORT?
   - Kunden anlegen?
   - Projekte verwalten?
   - Angebote erstellen?
3. Soll ich ein einfaches CRM-Frontend bauen?

**Sag mir einfach "Ja, bau Strapi CRM" oder sag mir deine Wünsche!** 🎯


