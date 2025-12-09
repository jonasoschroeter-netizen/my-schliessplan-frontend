-- ============================================
-- SUPABASE AUTH INTEGRATION - KOMPLETTES SETUP SCRIPT
-- ============================================
-- Führt alle notwendigen Schritte aus:
-- 1. Sequenz für Kundenummern erstellen
-- 2. Funktion generate_kundenummer() erstellen
-- 3. user_id Spalte zur kunden Tabelle hinzufügen
-- 4. Funktion create_kunde_on_signup() erstellen (behandelt E-Mail-Duplikate)
-- ============================================

-- ============================================
-- 1. SEQUENZ FÜR KUNDENUMMERN ERSTELLEN
-- ============================================

CREATE SEQUENCE IF NOT EXISTS kundenummer_seq START 10000;

-- ============================================
-- 2. FUNKTION: GENERIERUNG DER KUNDENUMMER
-- ============================================

CREATE OR REPLACE FUNCTION generate_kundenummer()
RETURNS TEXT AS $$
DECLARE
  next_num BIGINT;
  kundenummer TEXT;
  current_year TEXT;
BEGIN
  current_year := TO_CHAR(NOW(), 'YYYY');
  next_num := nextval('kundenummer_seq');
  kundenummer := 'KD-' || current_year || '-' || LPAD(next_num::TEXT, 5, '0');
  RETURN kundenummer;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Erlaube Ausführung für alle
GRANT EXECUTE ON FUNCTION generate_kundenummer() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_kundenummer() TO anon;

-- ============================================
-- 3. ERWEITERE KUNDEN TABELLE UM user_id
-- ============================================

-- Füge user_id Spalte hinzu (verknüpft mit auth.users)
ALTER TABLE kunden 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index für schnelle Suche nach user_id
CREATE INDEX IF NOT EXISTS idx_kunden_user_id ON kunden(user_id);

-- ============================================
-- 4. FUNKTION: KUNDE AUS USER_ID FINDEN
-- ============================================

CREATE OR REPLACE FUNCTION get_kunde_by_user_id(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  kundenummer TEXT,
  vorname TEXT,
  nachname TEXT,
  email TEXT,
  telefon TEXT,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    k.id,
    k.kundenummer,
    k.vorname,
    k.nachname,
    k.email,
    k.telefon,
    k.status
  FROM kunden k
  WHERE k.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Erlaube Ausführung für authentifizierte Nutzer
GRANT EXECUTE ON FUNCTION get_kunde_by_user_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_kunde_by_user_id(UUID) TO anon;

-- ============================================
-- 5. FUNKTION: KUNDE BEI REGISTRIERUNG ERSTELLEN (KOMPLETT)
-- ============================================
-- BEHOBEN: 
-- - Prüft sowohl user_id als auch E-Mail auf Duplikate
-- - Stellt sicher, dass kundenummer immer gesetzt ist
-- - Behandelt alle Fälle korrekt

CREATE OR REPLACE FUNCTION create_kunde_on_signup(
  p_user_id UUID,
  p_email TEXT,
  p_vorname TEXT DEFAULT NULL,
  p_nachname TEXT DEFAULT NULL,
  p_telefon TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  kunde_id UUID;
  normalized_email TEXT := LOWER(TRIM(p_email));
BEGIN
  -- Validierung
  IF normalized_email IS NULL OR normalized_email = '' THEN
    RAISE EXCEPTION 'E-Mail darf nicht leer sein';
  END IF;
  
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id darf nicht leer sein';
  END IF;
  
  -- Prüfe zuerst, ob bereits ein Kunde mit dieser user_id existiert
  SELECT id INTO kunde_id
  FROM kunden
  WHERE user_id = p_user_id
  LIMIT 1;
  
  IF kunde_id IS NOT NULL THEN
    -- Aktualisiere bestehenden Eintrag (user_id bereits vorhanden)
    UPDATE kunden
    SET 
      email = COALESCE(normalized_email, email),
      vorname = COALESCE(p_vorname, vorname),
      nachname = COALESCE(p_nachname, nachname),
      telefon = COALESCE(p_telefon, telefon),
      aktualisiert_am = NOW()
    WHERE id = kunde_id;
    
    RETURN kunde_id;
  ELSE
    -- Prüfe, ob bereits ein Kunde mit dieser E-Mail existiert (z.B. von Gast-Eintrag)
    SELECT id INTO kunde_id
    FROM kunden
    WHERE email = normalized_email
    LIMIT 1;
    
    IF kunde_id IS NOT NULL THEN
      -- Aktualisiere bestehenden Eintrag: Füge user_id hinzu
      -- WICHTIG: kundenummer bleibt erhalten!
      UPDATE kunden
      SET 
        user_id = p_user_id,
        vorname = COALESCE(p_vorname, vorname),
        nachname = COALESCE(p_nachname, nachname),
        telefon = COALESCE(p_telefon, telefon),
        aktualisiert_am = NOW()
      WHERE id = kunde_id;
      
      RETURN kunde_id;
    ELSE
      -- Erstelle neuen Kunden-Eintrag
      -- WICHTIG: kundenummer wird IMMER generiert!
      INSERT INTO kunden (
        user_id,
        kundenummer,
        email,
        vorname,
        nachname,
        telefon,
        status
      )
      VALUES (
        p_user_id,
        generate_kundenummer(), -- IMMER generieren!
        normalized_email,
        p_vorname,
        p_nachname,
        p_telefon,
        'aktiv'
      )
      RETURNING id INTO kunde_id;
      
      RETURN kunde_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Erlaube Ausführung für authentifizierte Nutzer UND anonyme Nutzer
GRANT EXECUTE ON FUNCTION create_kunde_on_signup(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_kunde_on_signup(UUID, TEXT, TEXT, TEXT, TEXT) TO anon;

-- ============================================
-- 6. RLS POLICY ANPASSEN
-- ============================================

-- Erlaube authentifizierten Nutzern, ihren eigenen Kunden-Eintrag zu lesen
DROP POLICY IF EXISTS kunden_select_own ON kunden;
CREATE POLICY kunden_select_own ON kunden
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Erlaube authentifizierten Nutzern, ihren eigenen Kunden-Eintrag zu aktualisieren
DROP POLICY IF EXISTS kunden_update_own ON kunden;
CREATE POLICY kunden_update_own ON kunden
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- 7. TEST-FUNKTION (OPTIONAL)
-- ============================================
-- Führen Sie diese aus, um zu testen, ob alles funktioniert:
-- SELECT generate_kundenummer(); -- Sollte eine Kundenummer zurückgeben
-- ============================================

-- ============================================
-- FERTIG!
-- ============================================
-- Die Funktion behandelt jetzt:
-- 1. Kunde mit user_id existiert bereits → Update (kundenummer bleibt erhalten)
-- 2. Kunde mit E-Mail existiert bereits → Update (füge user_id hinzu, kundenummer bleibt erhalten)
-- 3. Neuer Kunde → Insert mit generierter kundenummer
-- 
-- WICHTIG: kundenummer wird IMMER gesetzt (entweder vorhanden oder neu generiert)
-- ============================================

