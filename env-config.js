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

    /** Strapi CMS selection. Supports local, laptop tunnel, cloud and custom URLs. */
    var STRAPI_CLOUD = 'https://brave-basketball-98ec57b285.strapiapp.com';
    var STRAPI_PUBLIC = 'https://blacks-job-eliminate-flex.trycloudflare.com';
    var STRAPI_LOCAL = 'http://127.0.0.1:1337';
    var STRAPI_LAPTOP = 'http://100.102.21.19:1337';
    var STRAPI_CUSTOM_STORAGE_KEY = 'schliessplan-strapi-custom-url';

    function normalizeStrapiUrl(value) {
        if (!value) return null;
        var url = String(value).trim();
        if (!url) return null;
        if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
        return url.replace(/\/+$/, '');
    }

    function setStoredValue(key, value) {
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
        } catch (error) {
            // Storage can be blocked in restrictive browser contexts.
        }
    }

    function removeStoredValue(key) {
        try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        } catch (error) {
            // Storage can be blocked in restrictive browser contexts.
        }
    }

    var qpStrapi = params && params.get('strapi');
    var qpStrapiUrl =
        params &&
        (params.get('strapiUrl') || params.get('strapi-url') || params.get('strapiServer'));
    var strapiStored = getStoredMode('schliessplan-strapi-mode');
    var strapiStoredCustomUrl = normalizeStrapiUrl(getStoredMode(STRAPI_CUSTOM_STORAGE_KEY));
    var explicitCustomUrl = normalizeStrapiUrl(qpStrapiUrl);

    if (
        !explicitCustomUrl &&
        qpStrapi &&
        qpStrapi !== 'cloud' &&
        qpStrapi !== 'c' &&
        qpStrapi !== 'public' &&
        qpStrapi !== 'tunnel' &&
        qpStrapi !== 'laptop' &&
        qpStrapi !== 'local' &&
        qpStrapi !== 'l' &&
        qpStrapi !== 'server' &&
        qpStrapi !== 'custom'
    ) {
        explicitCustomUrl = normalizeStrapiUrl(qpStrapi);
    }

    var isHttpsPage =
        typeof location !== 'undefined' && location.protocol === 'https:';
    var isNetlifyPage =
        typeof location !== 'undefined' &&
        /(^|\.)netlify\.app$/i.test(location.hostname || '');
    var shouldUsePublicStrapi = isHttpsPage || isNetlifyPage || isFileProtocol;

    var strapiMode = shouldUsePublicStrapi ? 'public' : 'local';
    var strapiUrl = shouldUsePublicStrapi ? STRAPI_PUBLIC : STRAPI_LOCAL;

    if (explicitCustomUrl) {
        strapiMode = 'server';
        strapiUrl = explicitCustomUrl;
        setStoredMode('schliessplan-strapi-mode', 'server');
        setStoredValue(STRAPI_CUSTOM_STORAGE_KEY, explicitCustomUrl);
    } else if (qpStrapi === 'public' || qpStrapi === 'tunnel') {
        strapiMode = 'public';
        strapiUrl = STRAPI_PUBLIC;
        setStoredMode('schliessplan-strapi-mode', 'public');
    } else if (qpStrapi === 'cloud' || qpStrapi === 'c') {
        strapiMode = 'cloud';
        strapiUrl = STRAPI_CLOUD;
        setStoredMode('schliessplan-strapi-mode', 'cloud');
    } else if (qpStrapi === 'laptop') {
        strapiMode = 'laptop';
        strapiUrl = STRAPI_LAPTOP;
        setStoredMode('schliessplan-strapi-mode', 'laptop');
    } else if (qpStrapi === 'local' || qpStrapi === 'l') {
        strapiMode = 'local';
        strapiUrl = STRAPI_LOCAL;
        setStoredMode('schliessplan-strapi-mode', 'local');
    } else if ((qpStrapi === 'server' || qpStrapi === 'custom') && strapiStoredCustomUrl) {
        strapiMode = 'server';
        strapiUrl = strapiStoredCustomUrl;
        setStoredMode('schliessplan-strapi-mode', 'server');
    } else if (shouldUsePublicStrapi) {
        if (strapiStored === 'server' && strapiStoredCustomUrl && /^https:\/\//i.test(strapiStoredCustomUrl)) {
            strapiMode = 'server';
            strapiUrl = strapiStoredCustomUrl;
        } else {
            strapiMode = 'public';
            strapiUrl = STRAPI_PUBLIC;
            setStoredMode('schliessplan-strapi-mode', 'public');
        }
    } else if (strapiStored === 'public') {
        strapiMode = 'public';
        strapiUrl = STRAPI_PUBLIC;
    } else if (strapiStored === 'cloud') {
        strapiMode = 'cloud';
        strapiUrl = STRAPI_CLOUD;
    } else if (strapiStored === 'laptop') {
        strapiMode = 'laptop';
        strapiUrl = STRAPI_LAPTOP;
    } else if (strapiStored === 'server' && strapiStoredCustomUrl) {
        strapiMode = 'server';
        strapiUrl = strapiStoredCustomUrl;
    } else if (strapiStored === 'local') {
        strapiMode = 'local';
        strapiUrl = STRAPI_LOCAL;
    } else {
        if (strapiStored === 'server' && !strapiStoredCustomUrl) {
            removeStoredValue('schliessplan-strapi-mode');
        }
        strapiMode = 'local';
        strapiUrl = STRAPI_LOCAL;
    }

    if (isHttpsPage && /^http:\/\//i.test(strapiUrl) && typeof console !== 'undefined' && console.warn) {
        console.warn(
            '[Schliessplan] HTTPS-Seite nutzt eine HTTP-Strapi-URL. Browser koennen das als Mixed Content blockieren:',
            strapiUrl
        );
    }

    window.__SCHLIESSPLAN_STRAPI_MODE__ = strapiMode;
    window.__SCHLIESSPLAN_STRAPI_URL__ = strapiUrl;

    if (typeof console !== 'undefined' && console.info) {
        console.info('[Schliessplan] Strapi:', strapiMode, window.__SCHLIESSPLAN_STRAPI_URL__);
    }
})();
