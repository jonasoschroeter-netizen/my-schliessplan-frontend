/**
 * Zentrale Supabase-URL und anon key für alle HTML-Seiten.
 *
 * Umschalten:
 *   - URL: ?sb=local  |  ?sb=cloud
 *   - Konsole: localStorage.setItem('schliessplan-supabase-mode','local')
 *             localStorage.setItem('schliessplan-supabase-mode','cloud')
 *   - Ohne Einstellung: Supabase cloud. Lokal nur explizit mit ?sb=local oder localStorage.
 *
 * Strapi (CMS) – Standard nur lokal (http://localhost:1337). Strapi Cloud ist optional.
 *   - Standard: immer lokal
 *   - Nur bei Bedarf Cloud: ?strapi=cloud oder localStorage schliessplan-strapi-mode=cloud
 *   - Zurück auf lokal: ?strapi=local oder localStorage schliessplan-strapi-mode=local
 *   - Cloud-URL unten nur bei strapiMode === 'cloud' (Projekt arbeitet sonst ohne Cloud).
 *
 * Lokale Keys: Standard von `supabase start` (Supabase CLI). Nach eigenem
 *   supabase/config.toml ggf. `supabase status` ausführen und Werte hier anpassen.
 */
(function () {
    var CLOUD = {
        url: 'https://gffecqdaybyhhdfkkyqi.supabase.co',
        anonKey:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmZmVjcWRheWJ5aGhkZmtreXFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDY5NDYsImV4cCI6MjA3NzA4Mjk0Nn0.7iZ5UY2mSepEAhtPKlQ71JdIzmsLGzgU3RvmEJxzln4'
    };

    var LOCAL = {
        url: 'http://127.0.0.1:54321',
        anonKey:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
    };

    var params =
        typeof location !== 'undefined' && location.search
            ? new URLSearchParams(location.search)
            : null;
    function getStoredMode(key) {
        try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
        } catch (error) {
            return null;
        }
    }

    function setStoredMode(key, value) {
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
        } catch (error) {
            // Storage kann in restriktiven Browser-Kontexten blockiert sein.
        }
    }

    var qp = params && params.get('sb');
    var stored = getStoredMode('schliessplan-supabase-mode');

    var isFileProtocol =
        typeof location !== 'undefined' && location.protocol === 'file:';

    var mode;
    if (qp === 'local' || qp === 'l') {
        mode = 'local';
        setStoredMode('schliessplan-supabase-mode', 'local');
    } else if (qp === 'cloud' || qp === 'c') {
        mode = 'cloud';
        setStoredMode('schliessplan-supabase-mode', 'cloud');
    } else if (stored === 'local' || stored === 'cloud') mode = stored;
    else if (isFileProtocol) mode = 'cloud';
    else mode = 'cloud';

    var pick = mode === 'local' ? LOCAL : CLOUD;

    window.__SCHLIESSPLAN_SB__ = {
        url: pick.url,
        anonKey: pick.anonKey,
        mode: mode
    };

    if (typeof console !== 'undefined' && console.info) {
        console.info('[Schließplan] Supabase:', mode, pick.url);
    }

    /** Nur genutzt, wenn explizit strapi=cloud oder localStorage-Modus cloud */
    var STRAPI_CLOUD = 'https://brave-basketball-98ec57b285.strapiapp.com';
    var STRAPI_LOCAL = 'http://127.0.0.1:1337';

    var qpStrapi = params && params.get('strapi');
    var strapiStored = getStoredMode('schliessplan-strapi-mode');

    var strapiMode = 'local';
    if (qpStrapi === 'cloud' || qpStrapi === 'c') {
        strapiMode = 'cloud';
        setStoredMode('schliessplan-strapi-mode', 'cloud');
    } else if (qpStrapi === 'local' || qpStrapi === 'l') {
        strapiMode = 'local';
        setStoredMode('schliessplan-strapi-mode', 'local');
    } else if (strapiStored === 'cloud') strapiMode = 'cloud';
    else if (strapiStored === 'local') strapiMode = 'local';

    window.__SCHLIESSPLAN_STRAPI_URL__ =
        strapiMode === 'cloud' ? STRAPI_CLOUD : STRAPI_LOCAL;

    if (typeof console !== 'undefined' && console.info) {
        console.info('[Schließplan] Strapi:', strapiMode, window.__SCHLIESSPLAN_STRAPI_URL__);
    }
})();
