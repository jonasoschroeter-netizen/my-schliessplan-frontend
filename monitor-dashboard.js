(function () {
    'use strict';

    const VERSION = 'monitor-dashboard-20260526';
    const AUTO_INTERVAL_MS = 10 * 60 * 1000;
    const FETCH_TIMEOUT_MS = 9000;
    const HISTORY_KEY = 'schliessplan-monitor-history';
    const AUTO_KEY = 'schliessplan-monitor-auto-enabled';
    const TEST_DATA_KEY = 'schliessplan-monitor-testdata';

    const CONFIG = {
        frontendBase: window.location.origin,
        strapiBase: window.__SCHLIESSPLAN_STRAPI_URL__ || 'http://127.0.0.1:1337',
        supabase: window.__SCHLIESSPLAN_SB__ || {
            url: 'https://gffecqdaybyhhdfkkyqi.supabase.co',
            anonKey: ''
        },
        supabaseLocal: 'http://127.0.0.1:54321'
    };

    const SYSTEM_META = {
        frontend: { name: 'Frontend Website', icon: 'fa-display', critical: true },
        strapi: { name: 'Strapi CMS/API', icon: 'fa-database', critical: true },
        supabase: { name: 'Supabase Cloud', icon: 'fa-cloud', critical: true },
        localSupabase: { name: 'Supabase Lokal', icon: 'fa-computer', critical: false },
        config: { name: 'Konfiguration', icon: 'fa-gear', critical: true },
        data: { name: 'Testdaten', icon: 'fa-flask', critical: false }
    };

    const els = {};
    const state = {
        running: false,
        filter: 'all',
        lastResults: [],
        history: readJson(HISTORY_KEY, []),
        autoEnabled: readJson(AUTO_KEY, false),
        nextRunAt: null,
        autoTimer: null,
        countdownTimer: null
    };

    const TESTS = [
        endpointTest('frontend-start', 'frontend', 'Startseite start.html', `${CONFIG.frontendBase}/start.html?monitor=${Date.now()}`, { critical: true }),
        endpointTest('frontend-index', 'frontend', 'Registrierung index.html', `${CONFIG.frontendBase}/index.html?monitor=${Date.now()}`, { critical: true }),
        endpointTest('frontend-login', 'frontend', 'Login-Seite', `${CONFIG.frontendBase}/login.html?monitor=${Date.now()}`, { critical: true }),
        endpointTest('frontend-dashboard', 'frontend', 'Dashboard-Seite', `${CONFIG.frontendBase}/dashboard.html?monitor=${Date.now()}`, { critical: true }),
        endpointTest('frontend-confirm', 'frontend', 'Confirm-Mail-Seite', `${CONFIG.frontendBase}/confirm-email.html?monitor=${Date.now()}`, { critical: false }),
        endpointTest('frontend-css', 'frontend', 'style.css geladen', `${CONFIG.frontendBase}/style.css?v=${VERSION}`, { critical: true, expectText: 'Premium App Design System' }),
        endpointTest('frontend-script', 'frontend', 'script.js geladen', `${CONFIG.frontendBase}/script.js?v=${VERSION}`, { critical: true, expectText: 'STRAPI_BASE_URL' }),
        endpointTest('frontend-monitor-script', 'frontend', 'Monitor-JS geladen', `${CONFIG.frontendBase}/monitor-dashboard.js?v=${VERSION}`, { critical: true, expectText: 'AUTO_INTERVAL_MS' }),
        endpointTest('env-config', 'config', 'env-config.js geladen', `${CONFIG.frontendBase}/env-config.js?v=${VERSION}`, { critical: true, expectText: '__SCHLIESSPLAN_SB__' }),
        functionTest('config-runtime', 'config', 'Runtime-Konfiguration aktiv', true, () => {
            assert(CONFIG.strapiBase, 'Strapi-URL fehlt');
            assert(CONFIG.supabase.url, 'Supabase-URL fehlt');
            assert(CONFIG.supabase.anonKey, 'Supabase anon key fehlt');
            return `Strapi ${CONFIG.strapiBase}; Supabase ${CONFIG.supabase.mode || 'cloud'}`;
        }),
        functionTest('supabase-client', 'supabase', 'Supabase Client Namespace', false, () => {
            if (!window.supabaseClient) return warn('Client nicht initialisiert, REST-Checks laufen trotzdem');
            assert(window.supabaseClient.auth, 'Auth API fehlt');
            return 'Client bereit';
        }),
        endpointTest('strapi-admin', 'strapi', 'Strapi Admin erreichbar', `${CONFIG.strapiBase}/admin`, { critical: true }),
        strapiCollectionTest('strapi-objekttyps', 'Objekttypen', 'objekttyps', true),
        strapiCollectionTest('strapi-anlagentyps', 'Anlagentypen', 'anlagentyps', true),
        strapiCollectionTest('strapi-qualitaets', 'Qualitaeten', 'qualitaets', true),
        strapiCollectionTest('strapi-technologies', 'Technologien', 'technologies', true),
        strapiCollectionTest('strapi-tuerens', 'Tueren', 'tuerens', true),
        strapiCollectionTest('strapi-funktionens', 'Funktionen', 'funktionens', true),
        strapiCollectionTest('strapi-questions', 'Fragen', 'questions', true),
        strapiCollectionTest('strapi-zylinders', 'Zylinder', 'zylinders', true),
        strapiCollectionTest('strapi-global', 'Globale Einstellungen', 'globale-einstellungen', false),
        expected404Test('strapi-options-legacy', 'strapi', 'Legacy /api/options bleibt deaktiviert', `${CONFIG.strapiBase}/api/options`, false),
        supabaseHealthTest('supabase-auth-health', 'Auth Health', `${CONFIG.supabase.url}/auth/v1/health`, true),
        supabaseRestTest('supabase-schliessplaene', 'Tabelle schliessplaene lesbar', 'schliessplaene', true),
        supabaseRestTest('supabase-mediathek', 'Tabelle mediathek lesbar', 'mediathek', true),
        endpointTest('supabase-local-health', 'localSupabase', 'Lokale Supabase Health', `${CONFIG.supabaseLocal}/auth/v1/health`, { critical: false, optional: true }),
        functionTest('testdata-integrity', 'data', 'Synthetische Testdaten pruefen', false, validateStoredTestData)
    ];

    document.addEventListener('DOMContentLoaded', () => {
        bindElements();
        bindEvents();
        renderStaticState();
        renderHistory();
        renderTestDataPreview();
        logEvent('Monitor geladen', `Version ${VERSION}`);

        if (state.autoEnabled) {
            startAutoTests(false);
        }
    });

    function bindElements() {
        [
            'overall-status-pill', 'overall-score', 'last-run-at', 'last-run-duration', 'next-run-at',
            'auto-countdown', 'test-count', 'slowest-test', 'slowest-test-time', 'run-all-btn',
            'run-critical-btn', 'toggle-auto-btn', 'create-test-data-btn', 'export-report-btn',
            'clear-history-btn', 'validate-test-data-btn', 'clear-test-data-btn', 'system-cards',
            'test-data-preview', 'test-results-body', 'history-list', 'event-log', 'monitor-run-note'
        ].forEach(id => {
            els[toCamel(id)] = document.getElementById(id);
        });
        els.filterTabs = Array.from(document.querySelectorAll('.monitor-filter-tabs button'));
    }

    function bindEvents() {
        els.runAllBtn.addEventListener('click', () => runAllTests({ criticalOnly: false, source: 'manual' }));
        els.runCriticalBtn.addEventListener('click', () => runAllTests({ criticalOnly: true, source: 'critical' }));
        els.toggleAutoBtn.addEventListener('click', () => {
            if (state.autoEnabled) stopAutoTests();
            else startAutoTests(true);
        });
        els.createTestDataBtn.addEventListener('click', createTestData);
        els.validateTestDataBtn.addEventListener('click', () => runSingleTest(TESTS.find(test => test.id === 'testdata-integrity'), true));
        els.clearTestDataBtn.addEventListener('click', clearTestData);
        els.exportReportBtn.addEventListener('click', exportReport);
        els.clearHistoryBtn.addEventListener('click', clearHistory);
        els.filterTabs.forEach(button => {
            button.addEventListener('click', () => {
                state.filter = button.dataset.filter;
                els.filterTabs.forEach(item => item.classList.toggle('is-active', item === button));
                renderResults();
            });
        });
    }

    function endpointTest(id, system, label, url, options = {}) {
        return {
            id,
            system,
            label,
            url,
            critical: !!options.critical,
            optional: !!options.optional,
            run: async () => {
                const response = await timedFetch(url, { cache: 'no-store' });
                const text = await safeText(response);
                if (!response.ok) {
                    if (options.optional) return warn(`Optional nicht erreichbar (${response.status})`);
                    throw new Error(`HTTP ${response.status}`);
                }
                if (options.expectText && !text.includes(options.expectText)) {
                    throw new Error(`Marker fehlt: ${options.expectText}`);
                }
                return `${response.status} OK`;
            }
        };
    }

    function strapiCollectionTest(id, label, collection, critical) {
        return {
            id,
            system: 'strapi',
            label: `Strapi ${label}`,
            url: `${CONFIG.strapiBase}/api/${collection}?pagination[pageSize]=1&_monitor=${Date.now()}`,
            critical,
            run: async () => {
                const response = await timedFetch(`${CONFIG.strapiBase}/api/${collection}?pagination[pageSize]=1&_monitor=${Date.now()}`, { cache: 'no-store' });
                const json = await response.json();
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const total = json?.meta?.pagination?.total ?? (Array.isArray(json?.data) ? json.data.length : json?.data ? 1 : 0);
                if (total < 1) return warn('Erreichbar, aber keine Daten gefunden');
                return `${total} Eintraege`;
            }
        };
    }

    function expected404Test(id, system, label, url, critical) {
        return {
            id,
            system,
            label,
            url,
            critical,
            run: async () => {
                const response = await timedFetch(url, { cache: 'no-store' });
                if (response.status === 404) return '404 erwartet: Legacy-Endpunkt sauber deaktiviert';
                if (response.ok) return warn('Legacy-Endpunkt antwortet wieder; bitte pruefen, ob er genutzt wird');
                throw new Error(`Unerwartet: HTTP ${response.status}`);
            }
        };
    }

    function supabaseHealthTest(id, label, url, critical) {
        return {
            id,
            system: 'supabase',
            label: `Supabase ${label}`,
            url,
            critical,
            run: async () => {
                const response = await timedFetch(url, { headers: supabaseHeaders(false), cache: 'no-store' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return `${response.status} OK`;
            }
        };
    }

    function supabaseRestTest(id, label, table, critical) {
        return {
            id,
            system: 'supabase',
            label,
            url: `${CONFIG.supabase.url}/rest/v1/${table}?select=id&limit=1`,
            critical,
            run: async () => {
                const response = await timedFetch(`${CONFIG.supabase.url}/rest/v1/${table}?select=id&limit=1`, {
                    headers: supabaseHeaders(true),
                    cache: 'no-store'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const json = await response.json();
                return `Lesbar (${Array.isArray(json) ? json.length : 0} Probeeintraege)`;
            }
        };
    }

    function functionTest(id, system, label, critical, runner) {
        return { id, system, label, critical, url: 'browser-runtime', run: runner };
    }

    async function runAllTests(options = {}) {
        if (state.running) return;
        state.running = true;
        const started = performance.now();
        const runStartedAt = new Date();
        const tests = options.criticalOnly ? TESTS.filter(test => test.critical) : TESTS;

        state.lastResults = tests.map(test => pendingResult(test));
        renderResults();
        setOverallStatus('running', 'Pruefung laeuft');
        els.monitorRunNote.textContent = `${tests.length} Testpunkte werden geprueft. Quelle: ${options.source || 'manual'}.`;
        logEvent('Testlauf gestartet', `${tests.length} Testpunkte`);

        const results = [];
        for (const test of tests) {
            const result = await executeTest(test);
            results.push(result);
            state.lastResults = state.lastResults.map(item => item.id === result.id ? result : item);
            renderResults();
            renderSystemCards();
        }

        state.running = false;
        const duration = Math.round(performance.now() - started);
        state.lastResults = results;
        addHistory(runStartedAt, duration, results, options.source || 'manual');
        updateSummary(duration, runStartedAt, results);
        renderResults();
        renderSystemCards();
        renderHistory();
        logEvent('Testlauf abgeschlossen', `${summarize(results).pass}/${results.length} OK in ${duration} ms`);

        if (state.autoEnabled) scheduleNextAutoRun();
    }

    async function runSingleTest(test, addToLog) {
        if (!test) return;
        const result = await executeTest(test);
        const existingIndex = state.lastResults.findIndex(item => item.id === result.id);
        if (existingIndex >= 0) state.lastResults.splice(existingIndex, 1, result);
        else state.lastResults.push(result);
        renderResults();
        renderSystemCards();
        if (addToLog) logEvent('Einzeltest', `${test.label}: ${result.status.toUpperCase()}`);
    }

    async function executeTest(test) {
        const started = performance.now();
        try {
            const detail = await test.run();
            const normalized = normalizeDetail(detail);
            return {
                id: test.id,
                system: test.system,
                label: test.label,
                url: test.url,
                critical: test.critical,
                optional: test.optional,
                status: normalized.status || 'pass',
                detail: normalized.message || String(detail || 'OK'),
                duration: Math.round(performance.now() - started),
                checkedAt: new Date().toISOString()
            };
        } catch (error) {
            return {
                id: test.id,
                system: test.system,
                label: test.label,
                url: test.url,
                critical: test.critical,
                optional: test.optional,
                status: test.optional ? 'warn' : 'fail',
                detail: error.message || String(error),
                duration: Math.round(performance.now() - started),
                checkedAt: new Date().toISOString()
            };
        }
    }

    function pendingResult(test) {
        return {
            id: test.id,
            system: test.system,
            label: test.label,
            url: test.url,
            critical: test.critical,
            optional: test.optional,
            status: 'pending',
            detail: 'Wartet',
            duration: null,
            checkedAt: null
        };
    }

    async function timedFetch(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
        } finally {
            clearTimeout(timeout);
        }
    }

    async function safeText(response) {
        try {
            return await response.clone().text();
        } catch (error) {
            return '';
        }
    }

    function supabaseHeaders(includeAuth) {
        const headers = {
            apikey: CONFIG.supabase.anonKey || ''
        };
        if (includeAuth) headers.Authorization = `Bearer ${CONFIG.supabase.anonKey || ''}`;
        return headers;
    }

    function createTestData() {
        const now = new Date();
        const payload = {
            type: 'schliessplan-monitor-demo',
            createdAt: now.toISOString(),
            source: 'monitor-dashboard',
            userAnswers: {
                objekttyp: 'wohnung',
                anlagentyp: 'gleichschliessung',
                tueren: ['Haupteingangstuer', 'Nebeneingangstuer', 'Keller'],
                technologie: 'mechanisch',
                qualitaet: 'komfort'
            },
            planData: {
                keys: [{ id: 1, name: 'Gruppe 1' }, { id: 2, name: 'Hausmeister' }],
                rows: [
                    { id: 1, tuer: 'Haupteingangstuer', typ: 'Doppelzylinder', systemId: 'monitor-standard', anzahl: 1 },
                    { id: 2, tuer: 'Nebeneingangstuer', typ: 'Doppelzylinder', systemId: 'monitor-standard', anzahl: 1 },
                    { id: 3, tuer: 'Keller', typ: 'Halbzylinder', systemId: 'monitor-standard', anzahl: 1 }
                ]
            }
        };
        localStorage.setItem(TEST_DATA_KEY, JSON.stringify(payload));
        renderTestDataPreview();
        logEvent('Testdaten erzeugt', 'Lokale synthetische Monitor-Daten wurden gespeichert');
        runSingleTest(TESTS.find(test => test.id === 'testdata-integrity'), false);
    }

    function clearTestData() {
        localStorage.removeItem(TEST_DATA_KEY);
        renderTestDataPreview();
        logEvent('Testdaten geloescht', 'Lokale Monitor-Testdaten entfernt');
        runSingleTest(TESTS.find(test => test.id === 'testdata-integrity'), false);
    }

    function validateStoredTestData() {
        const data = readJson(TEST_DATA_KEY, null);
        if (!data) return warn('Noch keine Testdaten erzeugt');
        assert(data.type === 'schliessplan-monitor-demo', 'Typ falsch');
        assert(Array.isArray(data.userAnswers?.tueren), 'Tuerliste fehlt');
        assert(Array.isArray(data.planData?.rows) && data.planData.rows.length >= 2, 'Planzeilen fehlen');
        assert(Array.isArray(data.planData?.keys) && data.planData.keys.length >= 1, 'Schluesselgruppen fehlen');
        return `${data.planData.rows.length} Zeilen, ${data.planData.keys.length} Gruppen`;
    }

    function renderStaticState() {
        els.testCount.textContent = String(TESTS.length);
        renderSystemCards();
        updateAutoUi();
    }

    function renderResults() {
        const rows = state.lastResults.filter(matchesFilter);
        if (!rows.length) {
            els.testResultsBody.innerHTML = '<tr class="monitor-empty-row"><td colspan="6">Noch keine Ergebnisse fuer diesen Filter.</td></tr>';
            return;
        }

        els.testResultsBody.innerHTML = rows.map(result => {
            const meta = SYSTEM_META[result.system] || { name: result.system };
            return `
                <tr class="is-${result.status}">
                    <td><span class="monitor-result-pill is-${result.status}">${statusIcon(result.status)} ${statusLabel(result.status)}</span></td>
                    <td><strong>${escapeHtml(meta.name)}</strong>${result.critical ? '<small>Kritisch</small>' : '<small>Optional</small>'}</td>
                    <td>${escapeHtml(result.label)}<small>${escapeHtml(result.id)}</small></td>
                    <td>${escapeHtml(statusResponse(result))}</td>
                    <td>${result.duration == null ? '--' : `${result.duration} ms`}</td>
                    <td><span title="${escapeHtml(result.url || '')}">${escapeHtml(result.detail)}</span></td>
                </tr>
            `;
        }).join('');
    }

    function renderSystemCards() {
        const systems = Object.keys(SYSTEM_META);
        els.systemCards.innerHTML = systems.map(key => {
            const meta = SYSTEM_META[key];
            const results = state.lastResults.filter(item => item.system === key);
            const summary = summarize(results);
            const stateName = summary.fail ? 'fail' : summary.warn ? 'warn' : summary.pending ? 'pending' : summary.total ? 'pass' : 'idle';
            return `
                <article class="monitor-system-card is-${stateName}">
                    <div class="monitor-system-icon"><i class="fas ${meta.icon}"></i></div>
                    <div>
                        <h3>${escapeHtml(meta.name)}</h3>
                        <p>${summary.total ? `${summary.pass} OK / ${summary.warn} Warn / ${summary.fail} Fehler` : 'Noch nicht geprueft'}</p>
                    </div>
                    <strong>${summary.total ? `${Math.round((summary.pass / summary.total) * 100)}%` : '--'}</strong>
                </article>
            `;
        }).join('');
    }

    function renderHistory() {
        if (!state.history.length) {
            els.historyList.innerHTML = '<p class="monitor-muted">Noch keine Historie.</p>';
            return;
        }
        els.historyList.innerHTML = state.history.slice(0, 12).map(item => {
            const status = item.summary.fail ? 'fail' : item.summary.warn ? 'warn' : 'pass';
            return `
                <button class="monitor-history-item is-${status}" type="button" data-history-id="${escapeHtml(item.id)}">
                    <span>${formatDateTime(item.timestamp)}</span>
                    <strong>${item.summary.pass}/${item.summary.total} OK</strong>
                    <small>${item.duration} ms - ${escapeHtml(item.source)}</small>
                </button>
            `;
        }).join('');

        Array.from(els.historyList.querySelectorAll('[data-history-id]')).forEach(button => {
            button.addEventListener('click', () => {
                const item = state.history.find(entry => entry.id === button.dataset.historyId);
                if (!item) return;
                state.lastResults = item.results;
                renderResults();
                renderSystemCards();
                updateSummary(item.duration, new Date(item.timestamp), item.results);
                logEvent('Historie geladen', formatDateTime(item.timestamp));
            });
        });
    }

    function renderTestDataPreview() {
        const data = readJson(TEST_DATA_KEY, null);
        if (!data) {
            els.testDataPreview.textContent = 'Noch keine Testdaten erzeugt.';
            return;
        }
        const preview = {
            createdAt: data.createdAt,
            tueren: data.userAnswers?.tueren,
            rows: data.planData?.rows?.length || 0,
            keys: data.planData?.keys?.length || 0
        };
        els.testDataPreview.textContent = JSON.stringify(preview, null, 2);
    }

    function updateSummary(duration, startedAt, results) {
        const summary = summarize(results);
        const score = summary.total ? Math.round((summary.pass / summary.total) * 100) : 0;
        els.overallScore.textContent = `${score}%`;
        els.lastRunAt.textContent = formatDateTime(startedAt);
        els.lastRunDuration.textContent = `${duration} ms Laufzeit`;

        const slowest = results.filter(result => typeof result.duration === 'number').sort((a, b) => b.duration - a.duration)[0];
        els.slowestTest.textContent = slowest ? slowest.label : '--';
        els.slowestTestTime.textContent = slowest ? `${slowest.duration} ms` : '-- ms';

        if (summary.fail) setOverallStatus('fail', `${summary.fail} Fehler`);
        else if (summary.warn) setOverallStatus('warn', `${summary.warn} Warnungen`);
        else setOverallStatus('pass', 'Alles laeuft');
    }

    function addHistory(startedAt, duration, results, source) {
        const entry = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            timestamp: startedAt.toISOString(),
            duration,
            source,
            summary: summarize(results),
            results
        };
        state.history = [entry, ...state.history].slice(0, 60);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
    }

    function clearHistory() {
        state.history = [];
        localStorage.removeItem(HISTORY_KEY);
        renderHistory();
        logEvent('Historie geloescht', 'Monitor-Historie wurde entfernt');
    }

    function startAutoTests(runImmediately) {
        state.autoEnabled = true;
        localStorage.setItem(AUTO_KEY, 'true');
        updateAutoUi();
        scheduleNextAutoRun();
        logEvent('Autotest aktiviert', 'Alle 10 Minuten');
        if (runImmediately) runAllTests({ source: 'auto-start' });
    }

    function stopAutoTests() {
        state.autoEnabled = false;
        state.nextRunAt = null;
        localStorage.setItem(AUTO_KEY, 'false');
        if (state.autoTimer) clearTimeout(state.autoTimer);
        if (state.countdownTimer) clearInterval(state.countdownTimer);
        state.autoTimer = null;
        state.countdownTimer = null;
        updateAutoUi();
        logEvent('Autotest gestoppt', 'Automatische Pruefung ist aus');
    }

    function scheduleNextAutoRun() {
        if (!state.autoEnabled) return;
        if (state.autoTimer) clearTimeout(state.autoTimer);
        if (state.countdownTimer) clearInterval(state.countdownTimer);
        state.nextRunAt = Date.now() + AUTO_INTERVAL_MS;
        state.autoTimer = setTimeout(() => runAllTests({ source: 'auto-10-min' }), AUTO_INTERVAL_MS);
        state.countdownTimer = setInterval(updateAutoUi, 1000);
        updateAutoUi();
    }

    function updateAutoUi() {
        els.toggleAutoBtn.classList.toggle('is-active', state.autoEnabled);
        els.toggleAutoBtn.querySelector('span').textContent = state.autoEnabled ? 'Autotest stoppen' : '10-Minuten-Autotest';
        if (!state.autoEnabled || !state.nextRunAt) {
            els.nextRunAt.textContent = 'Aus';
            els.autoCountdown.textContent = 'Intervall: 10 Minuten';
            return;
        }
        const remaining = Math.max(0, state.nextRunAt - Date.now());
        els.nextRunAt.textContent = formatTime(new Date(state.nextRunAt));
        els.autoCountdown.textContent = `Noch ${formatDuration(remaining)}`;
    }

    function exportReport() {
        const report = {
            version: VERSION,
            exportedAt: new Date().toISOString(),
            config: {
                frontendBase: CONFIG.frontendBase,
                strapiBase: CONFIG.strapiBase,
                supabaseUrl: CONFIG.supabase.url,
                supabaseMode: CONFIG.supabase.mode || 'unknown'
            },
            lastResults: state.lastResults,
            history: state.history
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `schliessplan-monitor-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        logEvent('Report exportiert', 'JSON-Datei erzeugt');
    }

    function setOverallStatus(status, text) {
        els.overallStatusPill.className = `monitor-pill is-${status}`;
        els.overallStatusPill.innerHTML = `<i class="fas fa-circle"></i> ${escapeHtml(text)}`;
    }

    function matchesFilter(result) {
        if (state.filter === 'all') return true;
        if (state.filter === 'critical') return result.critical;
        return result.status === state.filter;
    }

    function summarize(results) {
        return results.reduce((acc, item) => {
            acc.total += 1;
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
        }, { total: 0, pass: 0, warn: 0, fail: 0, pending: 0 });
    }

    function normalizeDetail(detail) {
        if (detail && typeof detail === 'object' && detail.__monitorStatus) {
            return { status: detail.__monitorStatus, message: detail.message };
        }
        return { status: 'pass', message: String(detail || 'OK') };
    }

    function warn(message) {
        return { __monitorStatus: 'warn', message };
    }

    function assert(condition, message) {
        if (!condition) throw new Error(message);
    }

    function statusIcon(status) {
        return {
            pass: '<i class="fas fa-check"></i>',
            warn: '<i class="fas fa-triangle-exclamation"></i>',
            fail: '<i class="fas fa-xmark"></i>',
            pending: '<i class="fas fa-spinner fa-spin"></i>'
        }[status] || '<i class="fas fa-circle"></i>';
    }

    function statusLabel(status) {
        return { pass: 'OK', warn: 'Warnung', fail: 'Fehler', pending: 'Laeuft' }[status] || status;
    }

    function statusResponse(result) {
        if (result.status === 'pending') return '...';
        if (result.status === 'pass') return 'Erreichbar';
        if (result.status === 'warn') return 'Pruefen';
        return 'Fehler';
    }

    function logEvent(title, detail) {
        const row = document.createElement('div');
        row.className = 'monitor-event-row';
        row.innerHTML = `<span>${formatTime(new Date())}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail || '')}</small>`;
        els.eventLog.prepend(row);
        while (els.eventLog.children.length > 80) els.eventLog.lastElementChild.remove();
    }

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function toCamel(id) {
        return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    }

    function formatDateTime(value) {
        const date = value instanceof Date ? value : new Date(value);
        return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function formatTime(date) {
        return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function formatDuration(ms) {
        const totalSeconds = Math.ceil(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')} min`;
    }
})();
