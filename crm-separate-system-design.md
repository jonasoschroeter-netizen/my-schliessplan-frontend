# CRM - Separates System Design

## 🎯 Ziel: Ein separates CRM-System zum Testen der Datenübergabe

---

## 💡 SYSTEM-ARCHITEKTUR

```
┌─────────────────────────────────────┐
│   Frontend (Schließplan-Generator)  │
│        GitHub Pages                  │
└──────────────┬──────────────────────┘
               │
               │ 1. Erstellt Schließplan
               │
               ▼
┌─────────────────────────────────────┐
│         Strapi Backend              │
│    (Schließplan-Daten)              │
└──────────────┬──────────────────────┘
               │
               │ 2. Exportiere Daten
               │
               ▼
┌─────────────────────────────────────┐
│      CRM Backend (NEU!)             │
│  ┌─────────────────────────────┐   │
│  │ API Endpoints:              │   │
│  │ - POST /kunden              │   │
│  │ - POST /projekte            │   │
│  │ - GET /schliesplan/export   │   │
│  └─────────────────────────────┘   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Separate Datenbank            │
│  (PostgreSQL / MySQL / MongoDB)    │
└─────────────────────────────────────┘
```

---

## 🛠️ TECHNOLOGIE-OPTIONEN

### **Option 1: Supabase + Express** (EMPFOHLEN ✅)

**WARUM:**
- ✅ PostgreSQL (Professionell)
- ✅ Automatische API
- ✅ Realtime möglich
- ✅ Authentication eingebaut
- ✅ Kostenlos (bis 500MB)

**SETUP:**
1. Account bei supabase.com
2. Erstelle Projekt
3. Tabellen erstellen (SQL oder GUI)
4. Fertig!

---

### **Option 2: Firebase (Google)**

**WARUM:**
- ✅ Sehr schnell
- ✅ Realtime Database
- ✅ Hosting dabei

**NACHTEILE:**
- ⚠️ Zuerst kostenlos, später teuer
- ⚠️ Nicht-SQL (Document Store)

---

### **Option 3: Eigener Node.js Server**

**WARUM:**
- ✅ Vollständige Kontrolle
- ✅ Jede Datenbank möglich
- ✅ Flexibel

**SETUP:**
- Express.js Backend
- Datenbank (SQLite für schnell, PostgreSQL für produktion)
- REST API

---

## 📊 DATENFLUSS BEISPIEL

### **Scenario: Kunde erstellt Schließplan**

1. **User erstellt Schließplan** im Frontend
   ```json
   {
     "objekttyp": "Einfamilienhaus",
     "tueren": ["Haustür", "Garage"],
     "zylinder": "ABUS A93"
   }
   ```

2. **Frontend sendet an Strapi:**
   ```javascript
   POST https://strapi.com/api/schliesplaene
   {
     ...schliesplanData
   }
   ```

3. **Strapi bestätigt:**
   ```json
   {
     "id": 123,
     "status": "erstellt",
     "export_url": "https://strapi.com/api/schliesplaene/123"
   }
   ```

4. **Frontend sendet an CRM:**
   ```javascript
   POST https://crm-backend.com/api/kunden
   {
     "name": "Max Mustermann",
     "email": "max@example.com",
     "schliesplan_id": 123,
     "schliesplan_url": "https://strapi.com/api/schliesplaene/123"
   }
   ```

5. **CRM speichert Kunde + verlinkt Schließplan**

---

## 🚀 JETZT: Was willst du bauen?

### **Quick Setup (30 Minuten):**

**A) Supabase Backend** (empfohlen)
- Ich erstelle SQL-Schema
- Du kopierst es in Supabase
- Fertig!

**B) Eigener Express Server**
- Ich baue Node.js Backend
- PostgreSQL oder SQLite
- REST API

**C) MongoDB + Node.js**
- Ich baue MongoDB Schema
- Node.js Backend
- REST API

---

## 📋 WAS BRAUCHST DU?

**Für mich zum Bauen:**
1. Welche Technologie? (Supabase / Express / MongoDB)
2. Welche Daten willst du speichern?
   - Kunden (Name, Email)
   - Projekte
   - Schließplan-ID (Link zu Strapi)
3. Soll ich ein minimales Frontend bauen?

**Meine Empfehlung:**
→ **Supabase** (schnellst, professionell, gratis)

**Sag mir:**
- "Bau Supabase Setup" 
- oder "Bau Express Server"
- oder deine Wünsche!

