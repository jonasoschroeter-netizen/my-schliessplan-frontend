// ====================================================================================
// script.js - VERSION MIT FUNKTIONS-ABFRAGE & VORAUSWAHL
// ====================================================================================

// --- DATA & CONFIGURATION ---
const ZYLINDER_ARTEN = ["Doppelzylinder", "Halbzylinder", "Knaufzylinder", "Außenzylinder"];
const DEFAULT_SCHLIESSPLAN_SYSTEM_OPTIONS = [
    { id: "mechanisch", key: "mechanisch", name: "Mechanisch", color: "#2563eb", sortOrder: 10, isActive: true, techType: "mechanisch" },
    { id: "elektronisch", key: "elektronisch", name: "Elektronisch", color: "#16a34a", sortOrder: 20, isActive: true, techType: "elektronisch" }
];
let schliessplanSystemOptions = DEFAULT_SCHLIESSPLAN_SYSTEM_OPTIONS.map(option => ({ ...option }));
let draggedSchliessplanRowId = null;
let activeSchliessplanPointerDrag = null;
// ALL_FEATURES wird jetzt dynamisch aus dem Backend geladen
let ALL_FEATURES = {};
/** Überschreiben: env-config.js setzt window.__SCHLIESSPLAN_STRAPI_URL__ (Standard: http://127.0.0.1:1337) */
const STRAPI_BASE_URL =
    (typeof window !== 'undefined' && window.__SCHLIESSPLAN_STRAPI_URL__) ||
    'http://127.0.0.1:1337';
const DEFAULT_BRAND_LOGO_PATH = '/uploads/Screenshot_2025_10_11_153627_removebg_preview_5c3bb40aa7.png';
const DEFAULT_BRAND_LOGO_DATA_URI = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"%3E%3Crect width="96" height="96" rx="18" fill="%23203d5d"/%3E%3Cpath d="M48 10 76 22v22c0 20-11 33-28 42-17-9-28-22-28-42V22l28-12Z" fill="%23f8fafc" opacity=".95"/%3E%3Cpath d="M48 16v64M34 22v44M62 22v44" stroke="%23203d5d" stroke-width="5" stroke-linecap="round"/%3E%3Ccircle cx="48" cy="45" r="14" fill="none" stroke="%23203d5d" stroke-width="5"/%3E%3Cpath d="M48 58v14M41 67h14" stroke="%23203d5d" stroke-width="5" stroke-linecap="round"/%3E%3C/svg%3E';

function getDefaultBrandLogoUrl() {
    return `${STRAPI_BASE_URL}${DEFAULT_BRAND_LOGO_PATH}`;
}

function applyBrandLogoUrl(logoUrl) {
    if (!logoUrl) return;
    const logoImg = document.querySelector('#logo img');
    if (logoImg) {
        logoImg.onerror = function () {
            if (this.src !== DEFAULT_BRAND_LOGO_DATA_URI) {
                this.onerror = null;
                applyBrandLogoUrl(DEFAULT_BRAND_LOGO_DATA_URI);
            }
        };
        logoImg.src = logoUrl;
        logoImg.alt = 'Firmenlogo';
    }
    document.documentElement.style.setProperty('--firmen-logo', `url("${logoUrl}")`);
}

function applyDefaultBrandLogo() {
    applyBrandLogoUrl(getDefaultBrandLogoUrl());
}

// Netlify Production URL für E-Mail-Bestätigung
const NETLIFY_URL = 'https://frontend-schlieplan.netlify.app';

// Cache-Busting Konfiguration
const CACHE_BUSTING = true; // Aktiviert Cache-Busting für alle API-Aufrufe

/** false = Start ohne „Willkommen / Einloggen / Gast“-Auswahl (direkt in den Fragebogen) */
const AUTH_SELECTION_SCREEN_ENABLED = false;

// --- SUPABASE CONFIGURATION ---
// Supabase Client wird in index.html als ES Module geladen und als window.supabaseClient verfügbar gemacht

// Client-Instanz (NICHT "supabase" nennen — kollidiert mit globalem UMD-Namen window.supabase)
let schliessplanSb = null;
let supabaseInitialized = false;
let supabaseReadyPromise = null;

// Promise-basierte Supabase Initialisierung - wartet garantiert bis Client geladen ist
function waitForSupabase() {
    if (supabaseReadyPromise) {
        return supabaseReadyPromise;
    }
    
    supabaseReadyPromise = new Promise((resolve, reject) => {
        // Prüfe sofort ob bereits geladen
        if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient !== null) {
            schliessplanSb = window.supabaseClient;
            supabaseInitialized = true;
            console.log('✅ Supabase Client bereits geladen');
            resolve(schliessplanSb);
            return;
        }
        
        // Event Listener für supabase-ready Event
        const onReady = () => {
            if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient !== null) {
                schliessplanSb = window.supabaseClient;
                supabaseInitialized = true;
                console.log('✅ Supabase Client über Event initialisiert');
                window.removeEventListener('supabase-ready', onReady);
                resolve(schliessplanSb);
            }
        };
        
        window.addEventListener('supabase-ready', onReady);
        
        // Fallback: Polling falls Event nicht kommt (max 15 Sekunden)
        let attempts = 0;
        const maxAttempts = 150; // 150 * 100ms = 15 Sekunden (erhöht für sehr langsame Verbindungen)
        let checkInterval = null;
        
        // Error Event Listener
        const onError = (event) => {
            const errorMessage = event.detail?.message || 'Unbekannter Fehler';
            console.error('❌ Supabase Fehler-Event erhalten:', errorMessage);
            if (event.detail?.debug) {
                console.error('Supabase-Debug:', event.detail.debug);
            }
            if (typeof window.__schliessplanSupabaseDebug !== 'undefined') {
                console.error('window.__schliessplanSupabaseDebug:', window.__schliessplanSupabaseDebug);
            }
            window.removeEventListener('supabase-error', onError);
            window.removeEventListener('supabase-ready', onReady);
            if (checkInterval) clearInterval(checkInterval);
            reject(new Error(`Supabase Client konnte nicht geladen werden: ${errorMessage}`));
        };
        
        window.addEventListener('supabase-error', onError);
        
        // Starte Polling
        checkInterval = setInterval(() => {
            attempts++;
            if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient !== null) {
                schliessplanSb = window.supabaseClient;
                supabaseInitialized = true;
                console.log('✅ Supabase Client über Polling initialisiert');
                window.removeEventListener('supabase-ready', onReady);
                window.removeEventListener('supabase-error', onError);
                clearInterval(checkInterval);
                resolve(schliessplanSb);
            } else if (attempts >= maxAttempts) {
                console.error('❌ Supabase Client konnte nicht geladen werden (Timeout nach 15 Sekunden)');
                console.error('🔍 Debug Info:', {
                    supabaseClientExists: typeof window.supabaseClient !== 'undefined',
                    supabaseClientValue: window.supabaseClient,
                    supabaseLibraryExists: typeof window.supabase !== 'undefined'
                });
                window.removeEventListener('supabase-ready', onReady);
                window.removeEventListener('supabase-error', onError);
                clearInterval(checkInterval);
                reject(new Error('Supabase Client konnte nicht geladen werden (Timeout nach 15 Sekunden)'));
            }
        }, 100);
    });
    
    return supabaseReadyPromise;
}

// Initialisiere Supabase Client (wird nach DOM-Load aufgerufen)
function initializeSupabase() {
    // Starte das Warten auf Supabase
    waitForSupabase()
        .then(() => {
            console.log('✅ Supabase Client erfolgreich initialisiert');
        })
        .catch((error) => {
            console.error('❌ Fehler bei Supabase Initialisierung:', error);
            schliessplanSb = null;
            supabaseInitialized = false;
        });
}

// Hilfsfunktion: Stelle sicher, dass Supabase geladen ist
async function ensureSupabaseReady() {
    if (supabaseInitialized && schliessplanSb) {
        return schliessplanSb;
    }
    
    try {
        await waitForSupabase();
        return schliessplanSb;
    } catch (error) {
        throw new Error('Supabase Client konnte nicht initialisiert werden. Bitte laden Sie die Seite neu.');
    }
}

// --- LOADING SCREEN VERWALTUNG ---
const loadingStatus = {
    items: {},
    totalSteps: 0,
    completedSteps: 0,
    readyToContinue: false,
    doorUnlockStarted: false,
    doorUnlockTimer: null,
    
    // Status-Items definieren
    init() {
        this.items = {
            supabase: { name: 'Supabase Client laden', status: 'pending', key: 'supabase' },
            objekttypen: { name: 'Objekttypen laden', status: 'pending', key: 'objekttypen' },
            anlagentypen: { name: 'Anlagentypen laden', status: 'pending', key: 'anlagentypen' },
            qualitaeten: { name: 'Qualitäten laden', status: 'pending', key: 'qualitaeten' },
            technologien: { name: 'Technologien laden', status: 'pending', key: 'technologien' },
            tueren: { name: 'Türen laden', status: 'pending', key: 'tueren' },
            funktionen: { name: 'Funktionen laden', status: 'pending', key: 'funktionen' },
            fragen: { name: 'Fragen laden', status: 'pending', key: 'fragen' },
            zylinder: { name: 'Zylinder-Systeme laden', status: 'pending', key: 'zylinder' },
            globaleinstellungen: { name: 'Globale Einstellungen laden', status: 'pending', key: 'globaleinstellungen' }
        };
        this.totalSteps = Object.keys(this.items).length;
        this.completedSteps = 0;
        this.readyToContinue = false;
        this.doorUnlockStarted = false;
        if (this.doorUnlockTimer) clearTimeout(this.doorUnlockTimer);
        this.doorUnlockTimer = null;
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('intro-ready', 'intro-unlock-mode', 'intro-door-opened');
            loadingScreen.removeAttribute('data-loading-complete');
        }
        const unlockHint = document.getElementById('intro-door-action-hint');
        if (unlockHint) unlockHint.remove();
        const readyNote = document.getElementById('intro-ready-note');
        if (readyNote) readyNote.remove();
        const skipButton = document.getElementById('intro-skip-btn');
        if (skipButton) {
            skipButton.textContent = 'Film reduzieren';
            skipButton.dataset.ready = 'false';
            skipButton.setAttribute('aria-pressed', 'false');
            skipButton.classList.remove('intro-start-btn');
            skipButton.disabled = false;
        }
        this.renderStatusItems();
        // Progress Bar initial auf 0% setzen
        this.updateProgressBar();
    },
    
    // Status-Item aktualisieren
    updateStatus(key, status, error = null) {
        if (this.items[key]) {
            const previousStatus = this.items[key].status;
            
            // Prüfe ob dieser Schritt bereits als abgeschlossen gezählt wurde
            const wasCompleted = previousStatus === 'success' || previousStatus === 'error';
            
            this.items[key].status = status;
            if (error) {
                this.items[key].error = error;
            }
            
            // Zähle als abgeschlossen, wenn success ODER error (beide sind "fertig")
            const isCompleted = status === 'success' || status === 'error';
            
            // Nur erhöhen wenn vorher nicht abgeschlossen war und jetzt abgeschlossen ist
            if (!wasCompleted && isCompleted) {
                this.completedSteps++;
            }
            // Wenn vorher abgeschlossen war und jetzt nicht mehr, dann verringern
            else if (wasCompleted && !isCompleted) {
                this.completedSteps = Math.max(0, this.completedSteps - 1);
            }
            
            this.renderStatusItem(key);
            this.updateProgressBar();
        }
    },
    
    // Einzelnes Status-Item rendern
    renderStatusItem(key) {
        const item = this.items[key];
        if (!item) return;
        
        const container = document.getElementById('loading-status-items');
        if (!container) return;
        
        let itemElement = document.getElementById(`loading-status-${key}`);
        
        if (!itemElement) {
            itemElement = document.createElement('div');
            itemElement.id = `loading-status-${key}`;
            itemElement.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg border';
            container.appendChild(itemElement);
        }
        
        const status = item.status || 'idle';
        let icon = '';

        if (status === 'success') {
            icon = '<i class="fas fa-check"></i>';
        } else if (status === 'error') {
            icon = '<i class="fas fa-xmark"></i>';
        } else if (status === 'loading') {
            icon = '<i class="fas fa-spinner fa-spin"></i>';
        } else {
            icon = '<i class="fas fa-circle"></i>';
        }

        itemElement.className = `intro-status-item intro-status-${status}`;
        itemElement.innerHTML = `
            <div class="intro-status-main">
                <span class="intro-status-icon">${icon}</span>
                <span class="intro-status-name">${item.name}</span>
            </div>
            ${item.error ? `<span class="intro-status-error-text">${item.error}</span>` : ''}
        `;
    },
    
    // Alle Status-Items rendern
    renderStatusItems() {
        Object.keys(this.items).forEach(key => {
            this.renderStatusItem(key);
        });
    },
    
    // Progress-Balken aktualisieren
    updateProgressBar() {
        const loadingCount = Object.values(this.items).filter(function (item) {
            return item.status === 'loading';
        }).length;
        // Bisher zählten nur success/error — bei laufenden Requests blieb 0 %. Lade-Status fließt anteilig ein.
        const loadingWeight = Math.min(loadingCount * 0.35, 3.5);
        const raw = (this.completedSteps + loadingWeight) / this.totalSteps;
        let percentage = Math.min(100, Math.round(raw * 100));
        if (this.completedSteps < this.totalSteps && percentage < 2 && (loadingCount > 0 || this.completedSteps > 0)) {
            percentage = Math.max(percentage, 2);
        }
        const progressBar = document.getElementById('loading-progress-bar');
        const progressText = document.getElementById('loading-progress-text');

        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }

        if (progressText) {
            progressText.textContent = `${percentage}%`;
        }

        // Wenn alle Schritte abgeschlossen sind, bleibt der Film sichtbar.
        // Der Nutzer startet den Konfigurator bewusst per Button.
        if (this.completedSteps === this.totalSteps) {
            this.showReadyState();
        }
    },    
    // Loader fertig, aber Film sichtbar lassen bis Nutzer startet
    showReadyState() {
        if (this.readyToContinue) return;
        this.readyToContinue = true;

        const loadingScreen = document.getElementById('loading-screen');
        const skipButton = document.getElementById('intro-skip-btn');
        const statusFrame = document.querySelector('.intro-status-frame');
        const hasErrors = Object.values(this.items).some(item => item.status === 'error');

        if (loadingScreen) {
            loadingScreen.classList.add('intro-ready');
            loadingScreen.setAttribute('data-loading-complete', 'true');
        }

        if (statusFrame && !document.getElementById('intro-ready-note')) {
            const readyNote = document.createElement('div');
            readyNote.id = 'intro-ready-note';
            readyNote.className = hasErrors ? 'intro-ready-note intro-ready-note-warning' : 'intro-ready-note';
            readyNote.innerHTML = hasErrors
                ? '<strong>Bereit mit Hinweisen.</strong><span>Einige optionale Dienste wurden nicht geladen. Sie koennen den Film weiter ansehen oder trotzdem starten.</span>'
                : '<strong>Alles geladen.</strong><span>Sie koennen die Animation weiter ansehen oder den Konfigurator starten.</span>';
            statusFrame.insertAdjacentElement('afterend', readyNote);
        }

        if (skipButton) {
            skipButton.dataset.ready = 'true';
            skipButton.textContent = hasErrors ? 'Trotzdem starten' : 'Konfigurator starten';
            skipButton.setAttribute('aria-pressed', 'false');
            skipButton.classList.add('intro-start-btn');
            skipButton.focus({ preventScroll: true });
        }
    },
    
    // Zweite Intro-Phase: Zoom zur Tuer, Klinke ziehen oder Auto-Start
    startDoorUnlockSequence() {
        if (this.doorUnlockStarted) return;
        this.doorUnlockStarted = true;

        const loadingScreen = document.getElementById('loading-screen');
        const skipButton = document.getElementById('intro-skip-btn');
        const stage = document.querySelector('.intro-stage');
        const handle = document.querySelector('.intro-cylinder');
        const doorFrame = document.querySelector('.intro-door-frame');

        if (!loadingScreen || !handle || !doorFrame) {
            this.hideLoadingScreen();
            return;
        }

        loadingScreen.classList.remove('intro-compact');
        loadingScreen.classList.add('intro-unlock-mode');

        if (skipButton) {
            skipButton.textContent = 'Klinke ziehen oder warten...';
            skipButton.disabled = true;
            skipButton.setAttribute('aria-pressed', 'true');
        }

        if (stage && !document.getElementById('intro-door-action-hint')) {
            const hint = document.createElement('div');
            hint.id = 'intro-door-action-hint';
            hint.className = 'intro-door-action-hint';
            hint.innerHTML = '<strong>Klinke nach unten ziehen</strong><span>Zum Oeffnen ziehen oder kurz warten.</span><small>Auto-Start in 3 Sekunden</small>';
            stage.appendChild(hint);
        }

        let startY = null;
        let isDragging = false;
        const finish = () => this.completeDoorUnlockSequence();

        const beginDrag = (event) => {
            if (this.doorUnlockStarted !== true || loadingScreen.classList.contains('intro-door-opened')) return;
            isDragging = true;
            startY = event.clientY || 0;
            loadingScreen.classList.add('intro-handle-grabbed');
            handle.setPointerCapture?.(event.pointerId);
        };

        const moveDrag = (event) => {
            if (!isDragging || startY === null) return;
            const deltaY = (event.clientY || 0) - startY;
            const pull = Math.max(0, Math.min(deltaY, 62));
            handle.style.setProperty('--handle-pull', `${pull}px`);
            if (pull >= 34) finish();
        };

        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            startY = null;
            loadingScreen.classList.remove('intro-handle-grabbed');
            handle.style.setProperty('--handle-pull', '0px');
        };

        handle.addEventListener('pointerdown', beginDrag, { once: false });
        handle.addEventListener('pointermove', moveDrag, { once: false });
        handle.addEventListener('pointerup', endDrag, { once: false });
        handle.addEventListener('pointercancel', endDrag, { once: false });
        handle.addEventListener('click', finish, { once: true });
        doorFrame.addEventListener('click', finish, { once: true });

        this.doorUnlockTimer = setTimeout(finish, 3000);
    },

    completeDoorUnlockSequence() {
        const loadingScreen = document.getElementById('loading-screen');
        const skipButton = document.getElementById('intro-skip-btn');
        if (!loadingScreen || loadingScreen.classList.contains('intro-door-opened')) return;

        if (this.doorUnlockTimer) clearTimeout(this.doorUnlockTimer);
        this.doorUnlockTimer = null;

        loadingScreen.classList.remove('intro-handle-grabbed');
        loadingScreen.classList.add('intro-door-opened');

        const handle = document.querySelector('.intro-cylinder');
        if (handle) handle.style.setProperty('--handle-pull', '42px');

        if (skipButton) {
            skipButton.textContent = 'Tuer geoeffnet';
        }

        setTimeout(() => this.hideLoadingScreen(), 1250);
    },
    // Loading Screen ausblenden und Auth Screen zeigen
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const authScreen = document.getElementById('auth-screen');
        
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            loadingScreen.style.transition = 'opacity 0.5s ease-out';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
                
                // Initialisiere Auth Screen Event Listeners
                initializeAuthScreen();

                if (AUTH_SELECTION_SCREEN_ENABLED && authScreen) {
                    authScreen.classList.remove('hidden');
                    authScreen.style.opacity = '0';
                    authScreen.style.transition = 'opacity 0.5s ease-in';
                    setTimeout(() => {
                        authScreen.style.opacity = '1';
                    }, 50);
                } else if (authScreen) {
                    authScreen.classList.add('hidden');
                }
            }, 500);
        }
    }
};

let allCylinderSystems = [];
let questionsData = [];
let allDoorOptionsForPlan = [];
let currentQuestionIndex = 0;
let contentTypes = {
    objekttyp: [],
    anlagentyp: [],
    qualitaet: [],
    technologie: [],
    tueren: [],
    funktionen: []
};
let userAnswers = {};
let currentModalRowId = null;
let planData = { rows: [], keys: [] };
let optionDetailsMap = new Map();

const LOCAL_SESSION_KEY = 'lastSchliessplanSession';
const RESUME_SESSION_KEY = 'resumeSchliessplanSession';
const RESUME_PLAN_ID_KEY = 'resumeSchliessplanId';
const START_NEW_CONFIG_KEY = 'startNewConfig';
const AUTO_SAVE_DELAY_MS = 5000;

let activeSchliessplanId = null;
let activeKundeId = null;
let autoSaveTimer = null;
let autoSaveInProgress = false;
let pendingAutoSave = false;
let lastRemoteSaveSignature = '';

/** Map für Funktions-Icons im Schließplan; Keys = Strapi funktionens.key (z. B. ein_schluessel_mehrere_tueren) */
function rebuildAllFeaturesFromContentTypes() {
    ALL_FEATURES = {};
    const list = contentTypes.funktionen || [];
    list.forEach((f, idx) => {
        const featureKey = f.key || `feature_${f.id ?? idx}`;
        ALL_FEATURES[featureKey] = {
            name: f.name || featureKey,
            icon: 'fa-circle',
            color: 'text-gray-600',
            title: (f.description && String(f.description).trim()) || f.name || featureKey
        };
    });
}

// --- DOM ELEMENTS ---
const elements = {
    contentContainer: document.getElementById('content-container'),
    progressBar: document.getElementById('progress-bar'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    navigationButtons: document.getElementById('navigation-buttons'),
    questionnaireContainer: document.getElementById('questionnaire-container'),
    schliessplanContainer: document.getElementById('schliessplan-container'),
    subtitle: document.getElementById('questionnaire-subtitle'),
    schliessplanBody: document.getElementById('schliessplan-body'),
    addRowBtn: document.getElementById('add-row-btn'),
    addKeyBtn: document.getElementById('add-key-btn'),
    backToQuestionsBtn: document.getElementById('back-to-questions-btn'),
    keyHeader: document.getElementById('schluessel-header-dynamic'),
    keyHeaderMain: document.getElementById('schluessel-header-main'),
    dynamicHeaderCell: document.getElementById('dynamic-header-cell'),
    functionModal: document.getElementById('function-modal'),
    modalTitle: document.getElementById('modal-title'),
    techHeader: document.getElementById('tech-header'),
    colorLegend: document.getElementById('color-legend'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalSaveBtn: document.getElementById('modal-save-btn'),
};

// --- HELPER FUNCTIONS ---
function getAttributes(item) { return item ? (item.attributes || item) : null; }

function escapeHtmlValue(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeSystemColor(color, fallback = '#e8eef5') {
    const raw = String(color || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
        return '#' + raw.slice(1).split('').map(ch => ch + ch).join('');
    }
    return fallback;
}

function hexToRgba(hex, alpha = 0.14) {
    const normalized = normalizeSystemColor(hex, '#e8eef5');
    const value = normalized.slice(1);
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeSchliessplanSystemOption(entry, fallbackIndex = 0) {
    const attrs = getAttributes(entry) || {};
    const name = attrs.name || attrs.label || attrs.title || `System ${fallbackIndex + 1}`;
    const key = attrs.key || attrs.slug || String(name).toLowerCase().trim().replace(/\s+/g, '-');
    return {
        id: entry?.id ?? attrs.id ?? key,
        key,
        name,
        color: normalizeSystemColor(attrs.color || attrs.farbe || attrs.hexColor || attrs.hex_color, fallbackIndex === 0 ? '#2563eb' : '#16a34a'),
        sortOrder: Number(attrs.sortOrder ?? attrs.order ?? fallbackIndex),
        isActive: attrs.isActive !== false && attrs.active !== false,
        techType: attrs.techType || attrs.technologyType || attrs.technologie || key
    };
}

function getSchliessplanSystemOptions() {
    const activeOptions = (schliessplanSystemOptions || [])
        .filter(option => option && option.isActive !== false)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    return activeOptions.length > 0
        ? activeOptions
        : DEFAULT_SCHLIESSPLAN_SYSTEM_OPTIONS.map(option => ({ ...option }));
}

function findSchliessplanSystemOption(value) {
    const valueString = String(value ?? '');
    return getSchliessplanSystemOptions().find(option =>
        String(option.id) === valueString ||
        String(option.key) === valueString ||
        String(option.name) === valueString
    );
}

function getDefaultSchliessplanSystemOption(techType = 'mechanisch') {
    const key = String(techType || '').toLowerCase().includes('elektr') ? 'elektronisch' : 'mechanisch';
    return findSchliessplanSystemOption(key) || getSchliessplanSystemOptions()[0];
}

function inferTechTypeFromSystemOption(option) {
    if (!option) return null;
    const probe = `${option.techType || ''} ${option.key || ''} ${option.name || ''}`.toLowerCase();
    if (probe.includes('elektr')) return 'elektronisch';
    if (probe.includes('mechan')) return 'mechanisch';
    return null;
}

async function loadSchliessplanSystemOptionsFromBackend() {
    const fallback = DEFAULT_SCHLIESSPLAN_SYSTEM_OPTIONS.map(option => ({ ...option }));
    try {
        const response = await fetch(`${STRAPI_BASE_URL}/api/schliessplan-system-options?pagination[pageSize]=100&sort=sortOrder:asc&_t=${Date.now()}`, {
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            schliessplanSystemOptions = fallback;
            console.info('Schliessplan-Systemoptionen: Backend-Endpunkt nicht aktiv, nutze Standardoptionen.');
            return schliessplanSystemOptions;
        }
        const payload = await response.json();
        const backendOptions = (payload.data || [])
            .map((entry, index) => normalizeSchliessplanSystemOption(entry, index))
            .filter(option => option.isActive !== false);
        schliessplanSystemOptions = backendOptions.length > 0 ? backendOptions : fallback;
    } catch (error) {
        schliessplanSystemOptions = fallback;
        console.info('Schliessplan-Systemoptionen: Standardoptionen aktiv.', error.message);
    }
    return schliessplanSystemOptions;
}

// Sammle Zylinder aus allen Fragen
function collectZylindersFromQuestions(questionsResponse) {
    if (!questionsResponse?.data) {
        console.log('❌ Keine Fragen-Daten verfügbar');
        return [];
    }
    
    const allZylinders = [];
    const seenZylinders = new Set();
    
    questionsResponse.data.forEach(question => {
        const questionData = getAttributes(question);
        const zylinders = questionData.zylinders?.data || questionData.zylinders || [];
        
        zylinders.forEach(zylinder => {
            const zylinderData = getAttributes(zylinder);
            const zylinderId = zylinder.id;
            
            // Vermeide Duplikate
            if (!seenZylinders.has(zylinderId)) {
                seenZylinders.add(zylinderId);
                
                allZylinders.push({
                    id: zylinder.id,
                    name: zylinderData.name,
                    key: zylinderData.key || zylinderData.name.toLowerCase().replace(/\s+/g, '_'),
                    description: zylinderData.description,
                    price: zylinderData.price,
                    sortOrder: zylinderData.sortOrder || 999,
                    isActive: zylinderData.isActive !== false,
                    image: zylinderData.image && zylinderData.image.data ? `${STRAPI_BASE_URL}${getAttributes(zylinderData.image.data).url}` : null,
                    // Relations aus Strapi laden
                    suitableObjectTypes: zylinderData.objekttyps?.data || zylinderData.objekttyps || [],
                    suitableAnlagentyp: zylinderData.anlagentyps?.data || zylinderData.anlagentyps || [],
                    suitableTechnologie: zylinderData.technologies?.data || zylinderData.technologies || [],
                    suitableQualitaet: zylinderData.qualitaets?.data || zylinderData.qualitaets || [],
                    suitableFeatures: zylinderData.funktionens?.data || zylinderData.funktionens || []
                });
            }
        });
    });
    
    // Sortiere nach sortOrder
    allZylinders.sort((a, b) => a.sortOrder - b.sortOrder);
    
    console.log('🔍 Gefundene Zylinder:', allZylinders.map(z => z.name));
    return allZylinders;
}

// Zylinder-Matching-Funktion mit Match-Prozentsatz
function getRecommendedCylinders(userAnswers) {
    console.log('🔍 Suche passende Zylinder für:', userAnswers);
    
    // Debug: Speichere userAnswers
    debugData.userAnswers = userAnswers;
    
    if (!allCylinderSystems || allCylinderSystems.length === 0) {
        console.log('❌ Keine Zylinder verfügbar');
        return [];
    }
    
    // Wenn ein Zylinder explizit ausgewählt wurde, zeige nur diesen
    if (userAnswers.zylinder) {
        const selectedCylinder = allCylinderSystems.find(cylinder => 
            cylinder.name === userAnswers.zylinder || cylinder.key === userAnswers.zylinder
        );
        if (selectedCylinder) {
            console.log(`🎯 Ausgewählter Zylinder gefunden: ${selectedCylinder.name}`);
            return [selectedCylinder];
        }
    }
    
    // Debug: Match-Daten für alle Zylinder sammeln
    const debugMatchData = [];
    
    // Berechne Match-Prozentsatz für alle Zylinder
    const cylindersWithMatch = allCylinderSystems.map(cylinder => {
        if (!cylinder.isActive) {
            return { ...cylinder, matchPercentage: 0, isMatch: false };
        }
        
        // Debug: Detaillierte Match-Berechnung
        const cylinderDebugInfo = debugMatchCalculation(userAnswers, cylinder);
        debugMatchData.push(cylinderDebugInfo);
        
        let matchCount = 0;
        let totalChecks = 0;
        
        // Prüfe Objekttyp
        if (userAnswers.objekttyp) {
            totalChecks++;
            console.log(`🔍 Prüfe Objekttyp "${userAnswers.objekttyp}" gegen Zylinder "${cylinder.name}"`);
            console.log(`   Zylinder suitableObjectTypes:`, cylinder.suitableObjectTypes);
            const hasMatchingObjectType = cylinder.suitableObjectTypes.some(option => 
                option.name === userAnswers.objekttyp || option.key === userAnswers.objekttyp
            );
            console.log(`   Match gefunden: ${hasMatchingObjectType}`);
            if (hasMatchingObjectType) matchCount++;
        }
        
        // Prüfe Anlagentyp
        if (userAnswers.anlagentyp) {
            totalChecks++;
            const hasMatchingAnlagentyp = cylinder.suitableAnlagentyp.some(option => 
                option.name === userAnswers.anlagentyp || option.key === userAnswers.anlagentyp
            );
            if (hasMatchingAnlagentyp) matchCount++;
        }
        
        // Prüfe Qualität
        if (userAnswers.qualitaet) {
            totalChecks++;
            const hasMatchingQualitaet = cylinder.suitableQualitaet.some(option => 
                option.name === userAnswers.qualitaet || option.key === userAnswers.qualitaet
            );
            if (hasMatchingQualitaet) matchCount++;
        }
        
        // Prüfe Technologie
        if (userAnswers.technologie) {
            totalChecks++;
            const hasMatchingTechnologie = cylinder.suitableTechnologie.some(option => 
                option.name === userAnswers.technologie || option.key === userAnswers.technologie
            );
            if (hasMatchingTechnologie) matchCount++;
        }
        
        // Prüfe Türen (Antwort kann Array sein oder einzelner String bei single-choice)
        const tuerenAnswers = Array.isArray(userAnswers.tueren)
            ? userAnswers.tueren
            : (userAnswers.tueren ? [userAnswers.tueren] : []);
        if (tuerenAnswers.length > 0) {
            // WENN Zylinder hat keine suitableTueren definiert, zähle es als Match (flexibel)
            const hasNoTuerenRestriction = !cylinder.suitableTueren || cylinder.suitableTueren.length === 0;
            
            if (hasNoTuerenRestriction) {
                // Keine Einschränkung = alle Türen matchen
                matchCount += tuerenAnswers.length;
            } else {
                // Prüfe gegen die Einschränkungen
                const matchingTueren = tuerenAnswers.filter(selectedTuer => 
                    cylinder.suitableTueren.some(option => 
                        option.name === selectedTuer || option.key === selectedTuer
                    )
                );
                matchCount += matchingTueren.length;
            }
            totalChecks += tuerenAnswers.length;
        }
        
        // Prüfe Funktionen
        if (userAnswers.funktionen && userAnswers.funktionen.length > 0) {
            // WENN Zylinder hat keine suitableFeatures definiert, zähle es als Match (flexibel)
            const hasNoFeaturesRestriction = !cylinder.suitableFeatures || cylinder.suitableFeatures.length === 0;
            
            if (hasNoFeaturesRestriction) {
                // Keine Einschränkung = alle Funktionen matchen
                matchCount += userAnswers.funktionen.length;
            } else {
                // Prüfe gegen die Einschränkungen
                const matchingFeatures = userAnswers.funktionen.filter(selectedFeature => 
                    cylinder.suitableFeatures.some(option => 
                        option.name === selectedFeature || option.key === selectedFeature
                    )
                );
                matchCount += matchingFeatures.length;
            }
            totalChecks += userAnswers.funktionen.length;
        }
        
        // Berechne Match-Prozentsatz
        const matchPercentage = totalChecks > 0 ? Math.round((matchCount / totalChecks) * 100) : 0;
        const isMatch = matchPercentage >= 0; // Zeige alle Zylinder, auch mit 0% Match
        
        console.log(`Zylinder "${cylinder.name}": ${matchCount}/${totalChecks} = ${matchPercentage}%`);
        
        return { 
            ...cylinder, 
            matchPercentage, 
            isMatch,
            matchCount,
            totalChecks
        };
    });
    
    // Sortiere nach Match-Prozentsatz, dann nach sortOrder
    const sortedCylinders = cylindersWithMatch
        .filter(cylinder => cylinder.isActive)
        .sort((a, b) => {
            if (b.matchPercentage !== a.matchPercentage) {
                return b.matchPercentage - a.matchPercentage;
            }
            return a.sortOrder - b.sortOrder;
        });
    
    // Debug: Speichere Match-Daten
    debugData.cylinderMatchData = debugMatchData;
    
    console.log(`🎯 ${sortedCylinders.length} Zylinder sortiert nach Match-Prozentsatz`);
    return sortedCylinders;
}

function getAttributeColor(attribute) {
    // Mappe Attribut-Werte zu CSS-Farben
    const colorMap = {
        'hoch': 'text-red-600',
        'mittel': 'text-orange-500', 
        'niedrig': 'text-green-600',
        'standard': 'text-gray-600',
        'premium': 'text-blue-600',
        'sicherheit': 'text-red-500',
        'komfort': 'text-green-500',
        'design': 'text-purple-500'
    };
    return colorMap[attribute] || 'text-gray-600';
}

async function fetchAndHandle(url, requestName, timeout = 10000) {
    try {
        // Cache-Busting hinzufügen wenn aktiviert
        let finalUrl = url;
        if (CACHE_BUSTING) {
            const separator = url.includes('?') ? '&' : '?';
            finalUrl = `${url}${separator}_t=${Date.now()}`;
        }
        
        // Timeout für fetch hinzufügen
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(finalUrl, {
                headers: {
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                console.error(`Fehler bei Anfrage "${requestName}" an URL: ${finalUrl}`);
                console.error(`Status: ${response.status}`, errorBody);
                throw new Error(`HTTP Fehler bei "${requestName}": ${response.status}`);
            }
            return await response.json();
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error(`Timeout bei "${requestName}" - Server antwortet nicht (${timeout}ms)`);
            }
            throw fetchError;
        }
    } catch (error) { 
        throw error; 
    }
}

// Neue Funktion zum Laden aller Optionen mit Paginierung
async function fetchAllOptions() {
    console.info('Optionen werden aus Question-Relations geladen; der alte /api/options-Endpunkt ist deaktiviert.');
    return [];
}

// Neue Funktion zum Aktualisieren aller Daten vom Backend
async function refreshData(showProgress = true) {
    try {
        const startTime = Date.now();
        if (showProgress) {
            console.log('🔄 Aktualisiere Daten vom Backend...');
        }

        // Alle Content Types laden
        console.log('🔄 Lade alle Content Types...');
        
        // Status auf "loading" setzen für alle Content Types
        loadingStatus.updateStatus('objekttypen', 'loading');
        loadingStatus.updateStatus('anlagentypen', 'loading');
        loadingStatus.updateStatus('qualitaeten', 'loading');
        loadingStatus.updateStatus('technologien', 'loading');
        loadingStatus.updateStatus('tueren', 'loading');
        loadingStatus.updateStatus('funktionen', 'loading');
        loadingStatus.updateStatus('fragen', 'loading');
        
        // Promise.allSettled verwenden, damit einzelne Fehler nicht alles stoppen
        const results = await Promise.allSettled([
            fetchAndHandle(`${STRAPI_BASE_URL}/api/objekttyps?populate[0]=tuerens&populate[1]=icon&pagination[pageSize]=100&_t=${Date.now()}`, 'Objekttypen').catch(err => { console.error('Fehler Objekttypen:', err); return null; }),
            fetchAndHandle(`${STRAPI_BASE_URL}/api/anlagentyps?populate[0]=icon&pagination[pageSize]=100&_t=${Date.now()}`, 'Anlagentypen').catch(err => { console.error('Fehler Anlagentypen:', err); return null; }),
            fetchAndHandle(`${STRAPI_BASE_URL}/api/qualitaets?populate[0]=icon&pagination[pageSize]=100&_t=${Date.now()}`, 'Qualitaeten').catch(err => { console.error('Fehler Qualitaeten:', err); return null; }),
            fetchAndHandle(`${STRAPI_BASE_URL}/api/technologies?populate[0]=icon&pagination[pageSize]=100&_t=${Date.now()}`, 'Technologien').catch(err => { console.error('Fehler Technologien:', err); return null; }),
            fetchAndHandle(`${STRAPI_BASE_URL}/api/tuerens?populate[0]=icon&pagination[pageSize]=100&_t=${Date.now()}`, 'Tueren').catch(err => { console.error('Fehler Tueren:', err); return null; }),
            fetchAndHandle(`${STRAPI_BASE_URL}/api/funktionens?populate[0]=icon&pagination[pageSize]=100&_t=${Date.now()}`, 'Funktionen').catch(err => { console.error('Fehler Funktionen:', err); return null; }),
            fetchAndHandle(`${STRAPI_BASE_URL}/api/questions?populate[0]=objekttyps&populate[1]=anlagentyps&populate[2]=qualitaets&populate[3]=technologies&populate[4]=tuerens&populate[5]=funktionens&populate[6]=zylinders&populate[7]=zylinders.objekttyps&populate[8]=zylinders.anlagentyps&populate[9]=zylinders.technologies&populate[10]=zylinders.qualitaets&populate[11]=zylinders.funktionens&pagination[pageSize]=100&publicationState=preview&sort=order:asc&_t=${Date.now()}`, 'Questions').catch(err => { console.error('Fehler Questions:', err); return null; })
        ]);
        
        // Extrahiere Responses aus den Results
        const objekttypResponse = results[0].status === 'fulfilled' ? results[0].value : null;
        const anlagentypResponse = results[1].status === 'fulfilled' ? results[1].value : null;
        const qualitaetResponse = results[2].status === 'fulfilled' ? results[2].value : null;
        const technologieResponse = results[3].status === 'fulfilled' ? results[3].value : null;
        const tuerenResponse = results[4].status === 'fulfilled' ? results[4].value : null;
        const funktionenResponse = results[5].status === 'fulfilled' ? results[5].value : null;
        const questionsResponse = results[6].status === 'fulfilled' ? results[6].value : null;
        
        // Debug: Speichere API-Responses
        debugData.apiResponses = {
            objekttyp: { count: objekttypResponse?.data?.length || 0, sample: objekttypResponse?.data?.[0] },
            anlagentyp: { count: anlagentypResponse?.data?.length || 0, sample: anlagentypResponse?.data?.[0] },
            qualitaet: { count: qualitaetResponse?.data?.length || 0, sample: qualitaetResponse?.data?.[0] },
            technologie: { count: technologieResponse?.data?.length || 0, sample: technologieResponse?.data?.[0] },
            tueren: { count: tuerenResponse?.data?.length || 0, sample: tuerenResponse?.data?.[0] },
            funktionen: { count: funktionenResponse?.data?.length || 0, sample: funktionenResponse?.data?.[0] },
            questions: { count: questionsResponse?.data?.length || 0, sample: questionsResponse?.data?.[0] }
        };
        
        console.log('📊 Content Types geladen:', {
            objekttyp: objekttypResponse?.data?.length || 0,
            tueren: tuerenResponse?.data?.length || 0,
            questions: questionsResponse?.data?.length || 0
        });
        
        // Status-Updates für Content Types - prüfe explizit auf null/undefined für bessere Fehlerbehandlung
        loadingStatus.updateStatus('objekttypen', (objekttypResponse && objekttypResponse.data && objekttypResponse.data.length > 0) ? 'success' : 'error', objekttypResponse ? null : '404 - API nicht erreichbar');
        loadingStatus.updateStatus('anlagentypen', (anlagentypResponse && anlagentypResponse.data && anlagentypResponse.data.length > 0) ? 'success' : 'error', anlagentypResponse ? null : '404 - API nicht erreichbar');
        loadingStatus.updateStatus('qualitaeten', (qualitaetResponse && qualitaetResponse.data && qualitaetResponse.data.length > 0) ? 'success' : 'error', qualitaetResponse ? null : '404 - API nicht erreichbar');
        loadingStatus.updateStatus('technologien', (technologieResponse && technologieResponse.data && technologieResponse.data.length > 0) ? 'success' : 'error', technologieResponse ? null : '404 - API nicht erreichbar');
        loadingStatus.updateStatus('tueren', (tuerenResponse && tuerenResponse.data && tuerenResponse.data.length > 0) ? 'success' : 'error', tuerenResponse ? null : '404 - API nicht erreichbar');
        loadingStatus.updateStatus('funktionen', (funktionenResponse && funktionenResponse.data && funktionenResponse.data.length > 0) ? 'success' : 'error', funktionenResponse ? null : '404 - API nicht erreichbar');
        loadingStatus.updateStatus('fragen', (questionsResponse && questionsResponse.data && questionsResponse.data.length > 0) ? 'success' : 'error', questionsResponse ? null : '404 - API nicht erreichbar');
        
        // Zylinder werden jetzt über die Fragen geladen
        console.log('🔄 Zylinder werden über Fragen geladen...');
        
        // Globale Einstellungen laden
        console.log('🔄 Lade Global Settings...');
        loadingStatus.updateStatus('globaleinstellungen', 'loading');
        let globalSettingsResponse;
        
        try {
            // Versuche verschiedene API-Endpunkte
            globalSettingsResponse = await fetchAndHandle(`${STRAPI_BASE_URL}/api/globale-einstellungen?populate=logo_auswahl&_t=${Date.now()}`, 'Globale Einstellungen');
            console.log('📊 Global Settings Response (globale-einstellungen):', globalSettingsResponse);
            
            // Falls keine Daten, versuche alternativen Endpunkt
            if (!globalSettingsResponse || !globalSettingsResponse.data || globalSettingsResponse.data.length === 0) {
                console.log('🔄 Versuche alternativen Endpunkt...');
                globalSettingsResponse = await fetchAndHandle(`${STRAPI_BASE_URL}/api/global-settings?populate=logo_auswahl&_t=${Date.now()}`, 'Global Settings (alternativ)');
                console.log('📊 Global Settings Response (global-settings):', globalSettingsResponse);
            }
            
            // Falls immer noch keine Daten, versuche ohne populate
            if (!globalSettingsResponse || !globalSettingsResponse.data || globalSettingsResponse.data.length === 0) {
                console.log('🔄 Versuche ohne populate...');
                globalSettingsResponse = await fetchAndHandle(`${STRAPI_BASE_URL}/api/globale-einstellungen?_t=${Date.now()}`, 'Globale Einstellungen (ohne populate)');
                console.log('📊 Global Settings Response (ohne populate):', globalSettingsResponse);
            }
        } catch (error) {
            console.info('Globale Einstellungen optional nicht verfuegbar:', error.message);
            globalSettingsResponse = null;
            loadingStatus.updateStatus('globaleinstellungen', 'success');
        }
if (globalSettingsResponse && globalSettingsResponse.data) {
            loadingStatus.updateStatus('globaleinstellungen', 'success');
        } else if (loadingStatus.items.globaleinstellungen?.status === 'loading') {
            loadingStatus.updateStatus('globaleinstellungen', 'success'); // Optional, nicht kritisch
        }

        if (showProgress) {
            console.log(`📊 Content Types erfolgreich geladen`);
        }

        // Zylinder direkt laden (da sie nicht in Fragen-Relations sind)
        console.log('🔄 Lade Zylinder direkt...');
        loadingStatus.updateStatus('zylinder', 'loading');
        try {
            const zylinderResponse = await fetchAndHandle(
                `${STRAPI_BASE_URL}/api/zylinders?populate[0]=image&populate[1]=objekttyps&populate[2]=anlagentyps&populate[3]=technologies&populate[4]=qualitaets&populate[5]=funktionens&pagination[pageSize]=100&_t=${Date.now()}`,
                'Zylinder'
            );
            
            if (zylinderResponse && zylinderResponse.data) {
                allCylinderSystems = zylinderResponse.data.map(cylinder => {
                    const cylinderData = getAttributes(cylinder);
                    return {
                        id: cylinder.id,
                        name: cylinderData.name,
                        key: cylinderData.key || cylinderData.name.toLowerCase().replace(/\s+/g, '_'),
                        description: cylinderData.description,
                        price: cylinderData.price,
                        sortOrder: cylinderData.sortOrder || 999,
                        isActive: cylinderData.isActive !== false,
                        image: cylinderData.image && cylinderData.image.data ? `${STRAPI_BASE_URL}${getAttributes(cylinderData.image.data).url}` : null,
                        // Relations aus Strapi laden
                        suitableObjectTypes: cylinderData.objekttyps?.data || cylinderData.objekttyps || [],
                        suitableAnlagentyp: cylinderData.anlagentyps?.data || cylinderData.anlagentyps || [],
                        suitableTechnologie: cylinderData.technologies?.data || cylinderData.technologies || [],
                        suitableQualitaet: cylinderData.qualitaets?.data || cylinderData.qualitaets || [],
                        suitableFeatures: cylinderData.funktionens?.data || cylinderData.funktionens || [],
                        // Debug: Logge die Features
                        _debugFeatures: cylinderData.funktionens?.data || cylinderData.funktionens || []
                    };
                });
                console.log(`✅ ${allCylinderSystems.length} Zylinder direkt geladen`);
                loadingStatus.updateStatus('zylinder', allCylinderSystems.length > 0 ? 'success' : 'error');
            } else {
                console.log('⚠️ Keine Zylinder-Daten erhalten');
                allCylinderSystems = [];
                loadingStatus.updateStatus('zylinder', 'error', 'Keine Daten erhalten');
            }
        } catch (error) {
            console.error('❌ Fehler beim Laden der Zylinder:', error);
            allCylinderSystems = [];
            loadingStatus.updateStatus('zylinder', 'error', error.message);
        }

        await loadSchliessplanSystemOptionsFromBackend();
        applyDefaultBrandLogo();

        // Logo setzen
        if (globalSettingsResponse && globalSettingsResponse.data) {
            console.log('🔍 Global Settings Data Structure:', globalSettingsResponse.data);
            
            // Prüfe ob data ein Array oder ein einzelnes Objekt ist
            let logoData;
            if (Array.isArray(globalSettingsResponse.data)) {
                // Array-Struktur
                if (globalSettingsResponse.data.length > 0) {
                    logoData = getAttributes(globalSettingsResponse.data[0]);
                } else {
                    console.log('❌ Global Settings Array ist leer');
                    logoData = null;
                }
            } else {
                // Einzelnes Objekt
                logoData = getAttributes(globalSettingsResponse.data);
            }
            
            if (logoData) {
                console.log('🔍 Logo-Debug:', {
                    logoData: logoData,
                    logoAuswahl: logoData.logo_auswahl,
                    hasLogoData: !!logoData.logo_auswahl?.data,
                    logoAuswahlType: typeof logoData.logo_auswahl,
                    logoAuswahlKeys: logoData.logo_auswahl ? Object.keys(logoData.logo_auswahl) : 'null'
                });
                
                // Prüfe verschiedene Logo-Datenstrukturen
                let logoUrl = null;
                
                if (logoData.logo_auswahl) {
                    // Struktur 1: logo_auswahl.data.url
                    if (logoData.logo_auswahl.data && logoData.logo_auswahl.data.url) {
                        const logoAttributes = getAttributes(logoData.logo_auswahl.data);
                        logoUrl = `${STRAPI_BASE_URL}${logoAttributes.url}`;
                        console.log('✅ Logo-URL generiert (data.url):', logoUrl);
                    }
                    // Struktur 2: logo_auswahl.url direkt
                    else if (logoData.logo_auswahl.url) {
                        logoUrl = logoData.logo_auswahl.url.startsWith('http') ? 
                            logoData.logo_auswahl.url : 
                            `${STRAPI_BASE_URL}${logoData.logo_auswahl.url}`;
                        console.log('✅ Logo-URL generiert (direkt url):', logoUrl);
                    }
                    // Struktur 3: logo_auswahl.formats
                    else if (logoData.logo_auswahl.formats) {
                        const smallFormat = logoData.logo_auswahl.formats.small || logoData.logo_auswahl.formats.thumbnail;
                        if (smallFormat && smallFormat.url) {
                            logoUrl = smallFormat.url.startsWith('http') ? 
                                smallFormat.url : 
                                `${STRAPI_BASE_URL}${smallFormat.url}`;
                            console.log('✅ Logo-URL generiert (formats):', logoUrl);
                        }
                    }
                    // Struktur 4: logo_auswahl ist direkt ein String
                    else if (typeof logoData.logo_auswahl === 'string') {
                        logoUrl = logoData.logo_auswahl.startsWith('http') ? 
                            logoData.logo_auswahl : 
                            `${STRAPI_BASE_URL}${logoData.logo_auswahl}`;
                        console.log('✅ Logo-URL generiert (String):', logoUrl);
                    }
                }
                
        if (logoUrl) {
                    // Logo im Header setzen
                    const logoImg = document.querySelector('#logo img');
                    if (logoImg) {
                        logoImg.src = logoUrl;
                        logoImg.alt = 'Firmenlogo';
                        console.log('✅ Logo im Header gesetzt');
                    }
                    
                    // Logo als CSS-Variable setzen für Option-Karten
            document.documentElement.style.setProperty('--firmen-logo', `url(${logoUrl})`);
                    console.log('✅ Logo als CSS-Variable gesetzt');
                } else {
                    console.log('❌ Kein Logo in Global Settings gefunden - alle Strukturen geprüft');
                    console.log('🔍 Vollständige logoAuswahl-Struktur:', JSON.stringify(logoData.logo_auswahl, null, 2));
                }
            } else {
                console.log('❌ Keine Logo-Daten in Global Settings');
            }
        } else {
            console.log('❌ Keine Global Settings gefunden');
        }

        // Hilfsfunktion für Icon-Verarbeitung
        function processIcon(iconData) {
            if (!iconData) return null;
            
            if (iconData.data) {
                const iconAttributes = getAttributes(iconData.data);
                return `${STRAPI_BASE_URL}${iconAttributes.url}`;
            } else if (iconData.url) {
                return iconData.url.startsWith('http') ? iconData.url : `${STRAPI_BASE_URL}${iconData.url}`;
            } else if (iconData.formats) {
                const smallFormat = iconData.formats.small || iconData.formats.thumbnail;
                if (smallFormat) {
                    return smallFormat.url.startsWith('http') ? smallFormat.url : `${STRAPI_BASE_URL}${smallFormat.url}`;
                }
            }
            return null;
        }
        
        // Hilfsfunktion für Content Type-Verarbeitung (neue Struktur)
        function processNewContentType(response, typeName) {
            if (!response?.data) return [];
            
            return response.data.map(item => {
                const itemData = getAttributes(item);
                return {
                    id: item.id,
                    name: itemData.name,
                    key: itemData.key,
                    description: itemData.description,
                    icon: processIcon(itemData.icon),
                    sortOrder: itemData.sortOrder || 999,
                    // Relations
                    tuerens: itemData.tuerens?.data || itemData.tuerens || [],
                    suitableObjectTypes: itemData.suitableObjectTypes?.data || itemData.suitableObjectTypes || []
                };
            });
        }
        
        // Hilfsfunktion für Option-Verarbeitung (alte Struktur)
        function processOptionsByQuestion(optionsData) {
            const optionsByQuestion = {};
            
            if (optionsData && optionsData.length > 0) {
                optionsData.forEach(option => {
                    const optionData = getAttributes(option);
                    const questionKey = optionData.questionKey || 'unbekannt';
                    
                    if (!optionsByQuestion[questionKey]) {
                        optionsByQuestion[questionKey] = [];
                    }
                    
                    const processedOption = {
                        id: option.id,
                        name: optionData.optionText,
                        text: optionData.optionText, // Fallback für Kompatibilität
                        key: optionData.optionKey,
                        description: optionData.description,
                        icon: processIcon(optionData.icon),
                        empfehlung: optionData.empfehlung,
                        isCustom: false,
                        child_options: optionData.child_options?.data || optionData.child_options || [],
                        parent_options: optionData.parent_options?.data || optionData.parent_options || []
                    };
                    
                    optionsByQuestion[questionKey].push(processedOption);
                });
            }
            
            return optionsByQuestion;
        }
        
        // Content Types verarbeiten - nur verfügbare verwenden
        // Content Types werden global verwaltet
        
        // Alle Content Types verarbeiten
        contentTypes.objekttyp = processNewContentType(objekttypResponse, 'objekttyp');
        console.log('🔍 Objekttyp Debug - Erste Option:', contentTypes.objekttyp[0]);
        console.log('🔍 Objekttyp Debug - Hat tuerens?', contentTypes.objekttyp[0]?.tuerens);
        console.log('🔍 Objekttyp Debug - tuerens Länge:', contentTypes.objekttyp[0]?.tuerens?.length);
        
        contentTypes.anlagentyp = processNewContentType(anlagentypResponse, 'anlagentyp');
        contentTypes.qualitaet = processNewContentType(qualitaetResponse, 'qualitaet');
        contentTypes.technologie = processNewContentType(technologieResponse, 'technologie');
        contentTypes.tueren = processNewContentType(tuerenResponse, 'tueren');
        contentTypes.funktionen = processNewContentType(funktionenResponse, 'funktionen');
        
        // Fallback-Daten nur wenn Content Types leer sind
        if (contentTypes.anlagentyp.length === 0) {
            contentTypes.anlagentyp = [
                { id: 'temp-1', name: 'Gleichschließend', key: 'gleichschliessend', description: 'Alle Zylinder können mit allen Schlüsseln geöffnet werden', icon: null, sortOrder: 1 },
                { id: 'temp-2', name: 'Hauptschlüssel', key: 'hauptschluessel', description: 'Ein Hauptschlüssel schließt alles', icon: null, sortOrder: 2 },
                { id: 'temp-3', name: 'Zentralschloss', key: 'zentralschloss', description: 'Einzelschlüssel schließen auch Zentraltüren', icon: null, sortOrder: 3 }
            ];
        }
        
        if (contentTypes.qualitaet.length === 0) {
            contentTypes.qualitaet = [
                { id: 'temp-4', name: 'Günstig', key: 'guenstig', description: 'Kostengünstige Lösung', icon: null, sortOrder: 1 },
                { id: 'temp-5', name: 'Mittel (Empfohlen)', key: 'mittel', description: 'Gutes Preis-Leistungs-Verhältnis', icon: null, sortOrder: 2 },
                { id: 'temp-6', name: 'Sehr Gut', key: 'sehr-gut', description: 'Höchste Qualität', icon: null, sortOrder: 3 }
            ];
        }
        
        if (contentTypes.technologie.length === 0) {
            contentTypes.technologie = [
                { id: 'temp-7', name: 'Rein Mechanisch', key: 'rein-mechanisch', description: 'Klassische, bewährte Lösung', icon: null, sortOrder: 1 },
                { id: 'temp-8', name: 'Rein Elektronisch', key: 'rein-elektronisch', description: 'Maximale Flexibilität', icon: null, sortOrder: 2 },
                { id: 'temp-9', name: 'Gemischte Anlage', key: 'gemischt', description: 'Kombiniert mechanisch und elektronisch', icon: null, sortOrder: 3 }
            ];
        }
        
        if (contentTypes.funktionen.length === 0) {
            contentTypes.funktionen = [
                { id: 'temp-10', name: 'Erhöhter Bohrschutz', key: 'erhoehter-bohrschutz', description: 'Schutz vor Aufbohrversuchen', icon: null, sortOrder: 1 },
                { id: 'temp-11', name: 'Kopierschutz', key: 'kopierschutz', description: 'Schutz vor unerlaubtem Nachmachen von Schlüsseln', icon: null, sortOrder: 2 },
                { id: 'temp-12', name: 'Panikschloss', key: 'panikschloss', description: 'Im Notfall von innen ohne Schlüssel zu öffnen', icon: null, sortOrder: 3 },
                { id: 'temp-13', name: 'Zentralschloss', key: 'zentralschloss', description: 'Einzelschlüssel schließen auch Zentraltüren', icon: null, sortOrder: 4 },
                { id: 'temp-14', name: 'Hauptschlüssel', key: 'hauptschluessel', description: 'Ein Hauptschlüssel schließt alles', icon: null, sortOrder: 5 },
                { id: 'temp-15', name: 'Gleichschließend', key: 'gleichschliessend', description: 'Alle Zylinder mit allen Schlüsseln', icon: null, sortOrder: 6 },
                { id: 'temp-16', name: 'Elektronisch', key: 'elektronisch', description: 'Elektronische Zusatzfunktionen', icon: null, sortOrder: 7 },
                { id: 'temp-17', name: 'RFID', key: 'rfid', description: 'RFID-Zugangskontrolle', icon: null, sortOrder: 8 },
                { id: 'temp-18', name: 'Fingerprint', key: 'fingerprint', description: 'Fingerabdruck-Erkennung', icon: null, sortOrder: 9 },
                { id: 'temp-19', name: 'Code-Schloss', key: 'code-schloss', description: 'Zahlenkombination', icon: null, sortOrder: 10 },
                { id: 'temp-20', name: 'Fernsteuerung', key: 'fernsteuerung', description: 'Per App oder Fernbedienung steuerbar', icon: null, sortOrder: 11 }
            ];
        }
        
        console.log('📊 Content Types verarbeitet:', contentTypes);

        // Fragen aus Strapi laden (mit Relations) oder Fallback erstellen
        if (questionsResponse && questionsResponse.data && questionsResponse.data.length > 0) {
            console.log('📊 Lade Fragen aus Strapi mit Relations...');
            questionsData = questionsResponse.data.map(question => {
                const questionData = getAttributes(question);
                console.log(`Verarbeite Frage: ${questionData.questionText}`);
                
                // Bestimme die Optionen basierend auf der Frage
                let options = [];
                const questionKey = questionData.questionKey;
                
                switch (questionKey) {
                    case 'objekttyp':
                        options = questionData.objekttyps?.data || questionData.objekttyps || contentTypes.objekttyp;
                        break;
                    case 'anlagentyp':
                        options = questionData.anlagentyps?.data || questionData.anlagentyps || contentTypes.anlagentyp;
                        break;
                    case 'qualitaet':
                        options = questionData.qualitaets?.data || questionData.qualitaets || contentTypes.qualitaet;
                        break;
                    case 'technologie':
                        options = questionData.technologies?.data || questionData.technologies || contentTypes.technologie;
                        break;
                    case 'tueren':
                        options = questionData.tuerens?.data || questionData.tuerens || contentTypes.tueren;
                        break;
                    case 'funktionen':
                        options = questionData.funktionens?.data || questionData.funktionens || contentTypes.funktionen;
                        break;
                    default:
                        options = [];
                }
                
                console.log(`Frage ${questionKey} hat ${options.length} Optionen`);
                
            return {
                    id: question.id,
                    questionText: questionData.questionText,
                    question: questionData.questionText,
                    description: questionData.description,
                    key: questionKey,
                    type: questionData.type || 'single',
                    order: questionData.order || 1,
                    options: options
            };
        }).sort((a, b) => a.order - b.order); // Sortiere nach order Feld
        } else {
            console.log('📊 Erstelle Fallback-Fragen...');
            // Fallback-Fragen erstellen
            questionsData = [
                {
                    id: 1,
                    questionText: 'Für welchen Objekttyp ist der Schließplan?',
                    question: 'Für welchen Objekttyp ist der Schließplan?',
                    description: 'Die Auswahl hilft uns, Ihnen passende Vorschläge zu machen.',
                    key: 'objekttyp',
                    type: 'single',
                    order: 1,
                    options: contentTypes.objekttyp
                },
                {
                    id: 2,
                    questionText: 'Welche Art von Schließanlage benötigen Sie?',
                    question: 'Welche Art von Schließanlage benötigen Sie?',
                    description: 'Dies bestimmt, wie die Schlüssel und Zylinder zueinander in Beziehung stehen.',
                    key: 'anlagentyp',
                    type: 'single',
                    order: 2,
                    options: contentTypes.anlagentyp
                },
                {
                    id: 3,
                    questionText: 'Welches Qualitäts- und Preisniveau bevorzugen Sie?',
                    question: 'Welches Qualitäts- und Preisniveau bevorzugen Sie?',
                    description: 'Dies legt die Basis für die Auswahl der Zylinder-Systeme.',
                    key: 'qualitaet',
                    type: 'single',
                    order: 3,
                    options: contentTypes.qualitaet
                },
                {
                    id: 4,
                    questionText: 'Bevorzugen Sie rein mechanische oder elektronische Komponenten?',
                    question: 'Bevorzugen Sie rein mechanische oder elektronische Komponenten?',
                    description: 'Elektronische Komponenten bieten mehr Flexibilität, mechanische sind oft günstiger.',
                    key: 'technologie',
                    type: 'single',
                    order: 4,
                    options: contentTypes.technologie
                },
                {
                    id: 5,
                    questionText: 'Welche Türen und Zylinder benötigen Sie?',
                    question: 'Welche Türen und Zylinder benötigen Sie?',
                    description: 'Wählen Sie alle zutreffenden Standardtüren aus. Eigene Türen können Sie später im Schließplan hinzufügen.',
                    key: 'tueren',
                    type: 'multiple',
                    order: 5,
                    options: contentTypes.tueren
                },
                {
                    id: 6,
                    questionText: 'Welche besonderen Zylinder-Funktionen sind Ihnen wichtig?',
                    question: 'Welche besonderen Zylinder-Funktionen sind Ihnen wichtig?',
                    description: 'Wählen Sie eine oder mehrere Funktionen. Diese werden als Standard für alle Türen übernommen.',
                    key: 'funktionen',
                    type: 'multiple',
                    order: 6,
                    options: contentTypes.funktionen
                }
            ];
        }
        
        // Keine separate „Zylinder wählen“-Frage – nach der letzten Frage geht es direkt zum Zylinder-Finder
        
        console.log('📊 Fragen aus Content Types erstellt:', questionsData);

        // Alte Fragen-Verarbeitung entfernen - jetzt deaktiviert
        if (false && questionsResponse && questionsResponse.data) {
            console.log('=== FRAGEN VERARBEITUNG DEBUGGING ===');
            console.log('Raw questionsResponse:', questionsResponse);
            console.log('Raw questionsResponse.data:', questionsResponse.data);
            
            // Debug: Prüfe die erste Frage genauer
            if (questionsResponse.data.length > 0) {
                const firstQuestion = questionsResponse.data[0];
                console.log('=== ERSTE FRAGE DEBUGGING ===');
                console.log('Erste Frage raw:', firstQuestion);
                console.log('Erste Frage attributes:', getAttributes(firstQuestion));
                console.log('Erste Frage options raw:', firstQuestion.options);
                console.log('Erste Frage options attributes:', getAttributes(firstQuestion.options));
                if (firstQuestion.options && firstQuestion.options.data) {
                    console.log('Erste Frage options.data:', firstQuestion.options.data);
                    console.log('Erste Frage options.data[0]:', firstQuestion.options.data[0]);
                }
                console.log('=== ERSTE FRAGE DEBUGGING END ===');
            }
            
            // Debug: Prüfe alle Fragen auf Optionen
            questionsResponse.data.forEach((question, index) => {
                console.log(`=== FRAGE ${index + 1} DEBUGGING ===`);
                console.log(`Frage ${index + 1} raw:`, question);
                console.log(`Frage ${index + 1} attributes:`, getAttributes(question));
                console.log(`Frage ${index + 1} options raw:`, question.options);
                
                // Prüfe verschiedene Optionen-Strukturen
                let optionsCount = 0;
                let optionsData = null;
                
                if (question.options && question.options.data) {
                    // Standard Strapi-Struktur: options.data
                    optionsCount = question.options.data.length;
                    optionsData = question.options.data;
                    console.log(`Frage ${index + 1} hat ${optionsCount} Optionen (options.data)`);
                } else if (question.options && Array.isArray(question.options)) {
                    // Direkte Array-Struktur: options
                    optionsCount = question.options.length;
                    optionsData = question.options;
                    console.log(`Frage ${index + 1} hat ${optionsCount} Optionen (direkt options)`);
                } else if (question.options && typeof question.options === 'object') {
                    // Möglicherweise andere Struktur
                    console.log(`Frage ${index + 1} options ist ein Objekt:`, question.options);
                    optionsCount = 0;
                } else {
                    console.log(`Frage ${index + 1} hat KEINE Optionen!`);
                }
                
                if (optionsData && optionsCount > 0) {
                    optionsData.forEach((option, optIndex) => {
                        console.log(`  Option ${optIndex + 1}:`, option);
                    });
                }
                console.log(`=== FRAGE ${index + 1} DEBUGGING END ===`);
            });
            
            questionsData = questionsResponse.data.map(question => {
                const questionData = getAttributes(question);
                console.log(`Verarbeite Frage ${questionData.questionKey}:`, questionData);
                console.log(`Frage ${questionData.questionKey} options:`, questionData.options);
                
                let processedOptions = [];
                
                // Prüfe verschiedene Optionen-Strukturen
                let optionsToProcess = null;
                
                if (questionData.options && questionData.options.data) {
                    // Standard Strapi-Struktur: options.data
                    optionsToProcess = questionData.options.data;
                    console.log(`Frage ${questionData.questionKey} hat ${optionsToProcess.length} Optionen (options.data)`);
                } else if (questionData.options && Array.isArray(questionData.options)) {
                    // Direkte Array-Struktur: options
                    optionsToProcess = questionData.options;
                    console.log(`Frage ${questionData.questionKey} hat ${optionsToProcess.length} Optionen (direkt options)`);
                } else {
                    console.warn(`Frage ${questionData.questionKey} hat keine Optionen oder leere Optionen`);
                }
                
                if (optionsToProcess && optionsToProcess.length > 0) {
                    // Verarbeite die Optionen zu vollständigen Objekten
                    processedOptions = optionsToProcess.map(optionRef => {
                        console.log(`Verarbeite Option ${optionRef.id}:`, optionRef);
                        
                        // Finde die vollständigen Option-Details aus dem featuresResponse
                        const fullOption = featuresResponse.find(opt => opt.id === optionRef.id);
                        if (fullOption) {
                            const optionData = getAttributes(fullOption);
                            
                            // Debug: Icon-Verarbeitung
                            console.log(`🔍 Icon-Debug für Option ${optionData.optionText}:`, {
                                rawIcon: optionData.icon,
                                hasIconData: !!optionData.icon?.data,
                                iconData: optionData.icon?.data,
                                iconUrl: optionData.icon?.url,
                                iconFormats: optionData.icon?.formats
                            });
                            
                            let iconUrl = null;
                            
                            // Prüfe verschiedene Icon-Strukturen
                            if (optionData.icon) {
                                if (optionData.icon.data) {
                                    // Standard Strapi-Struktur: icon.data
                                    const iconAttributes = getAttributes(optionData.icon.data);
                                    iconUrl = `${STRAPI_BASE_URL}${iconAttributes.url}`;
                                    console.log(`✅ Icon-URL generiert (data) für ${optionData.optionText}:`, iconUrl);
                                } else if (optionData.icon.url) {
                                    // Direkte URL-Struktur: icon.url
                                    iconUrl = optionData.icon.url.startsWith('http') ? optionData.icon.url : `${STRAPI_BASE_URL}${optionData.icon.url}`;
                                    console.log(`✅ Icon-URL generiert (url) für ${optionData.optionText}:`, iconUrl);
                                } else if (optionData.icon.formats) {
                                    // Formats-Struktur: icon.formats
                                    const smallFormat = optionData.icon.formats.small || optionData.icon.formats.thumbnail;
                                    if (smallFormat) {
                                        iconUrl = smallFormat.url.startsWith('http') ? smallFormat.url : `${STRAPI_BASE_URL}${smallFormat.url}`;
                                        console.log(`✅ Icon-URL generiert (formats) für ${optionData.optionText}:`, iconUrl);
                                    }
                                }
                            }
                            
                            if (!iconUrl) {
                                console.log(`❌ Kein Icon für ${optionData.optionText}`);
                            }
                            
                            const processedOption = {
                                id: fullOption.id,
                                text: optionData.optionText,
                                description: optionData.description,
                                icon: iconUrl,
                                empfehlung: optionData.empfehlung,
                                isCustom: false,
                                child_options: optionData.child_options?.data || optionData.child_options || [],
                                parent_options: optionData.parent_options?.data || optionData.parent_options || []
                            };
                            
                            // Debug: Zeige child_options für Objekttyp-Optionen
                            if (questionData.questionKey === 'objekttyp' && processedOption.child_options && processedOption.child_options.length > 0) {
                                console.log(`🔗 ${processedOption.text} hat ${processedOption.child_options.length} child_options:`, processedOption.child_options.map(c => c.attributes?.optionText || c.text || c));
                            }
                            
                            console.log(`Option ${optionRef.id} verarbeitet:`, processedOption);
                            return processedOption;
                        } else {
                            console.warn(`Option ${optionRef.id} nicht in featuresResponse gefunden!`);
                            return null;
                        }
                    }).filter(Boolean); // Entferne null-Werte
                    
                    console.log(`Frage ${questionData.questionKey} hat ${processedOptions.length} verarbeitete Optionen`);
                }
                
                const processedQuestion = {
                    id: question.id,
                    questionText: questionData.questionText,
                    question: questionData.questionText,
                    description: questionData.description,
                    key: questionData.questionKey,
                    order: questionData.order,
                    type: questionData.type || 'single',
                    options: processedOptions
                };
                
                console.log(`Verarbeitete Frage ${processedQuestion.key}:`, processedQuestion);
                return processedQuestion;
            });
            
            console.log('=== FRAGEN VERARBEITUNG DEBUGGING END ===');
        }

        console.log('🔄 ALL_FEATURES aus Funktionen-Content-Type aufbauen...');
        rebuildAllFeaturesFromContentTypes();

        // UI aktualisieren wenn nötig
        if (currentQuestionIndex < questionsData.length) {
            renderCurrentQuestion();
        }
        
        if (currentQuestionIndex >= questionsData.length && allCylinderSystems.length > 0) {
            renderCylinderFinder();
        }

        // Funktion-Modal neu initialisieren
        initializeFunctionModal();

        const duration = Date.now() - startTime;
        
        if (showProgress) {
            console.log(`✅ Daten erfolgreich aktualisiert (${duration}ms)`);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Fehler beim Aktualisieren der Daten:', error);
        return false;
    }
}


// Manuelle Aktualisierung der Daten
async function manualRefresh() {
    const refreshBtn = document.getElementById('refresh-data-btn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aktualisiere...';
    }
    
    try {
        const success = await refreshData(true);
        if (success) {
            // Erfolgsmeldung anzeigen
            const notification = document.createElement('div');
            notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
            notification.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Daten erfolgreich aktualisiert!';
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 3000);
        } else {
            throw new Error('Fehler beim Aktualisieren der Daten');
        }
    } catch (error) {
        console.error('Fehler bei manueller Aktualisierung:', error);
        
        // Fehlermeldung anzeigen
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        notification.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i>Fehler beim Aktualisieren der Daten!';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Daten aktualisieren';
        }
    }
}


function focusCustomDoorInput() {
    const input = document.getElementById('custom-input');
    if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function initializeFunctionModal() {
    // Modal mit Standard-Funktionen initialisieren
    console.log('=== INITIALIZE FUNCTION MODAL DEBUGGING ===');
    console.log('ALL_FEATURES beim Initialisieren:', ALL_FEATURES);
    console.log('Anzahl Features:', Object.keys(ALL_FEATURES).length);

    const modalContent = elements.functionModal.querySelector('#features-container');
    console.log('Modal Content Element:', modalContent);

    modalContent.innerHTML = '';

    Object.keys(ALL_FEATURES).forEach(featureKey => {
        const feature = ALL_FEATURES[featureKey];
        console.log(`Rendering feature ${featureKey}:`, feature);

        const featureHtml = `
            <label class="flex items-center p-3 border rounded-lg gap-4 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" data-feature="${featureKey}" class="h-5 w-5 rounded border-gray-300 text-[#203d5d] focus:ring-[#203d5d]">
                <span class="font-semibold flex-1 text-left">${feature.name}</span>
                <i class="fas ${feature.icon} ${feature.color} fa-fw" title="${feature.title}"></i>
            </label>
        `;
        modalContent.insertAdjacentHTML('beforeend', featureHtml);
    });

    console.log('Modal HTML nach dem Rendern:', modalContent.innerHTML);
    console.log('=== INITIALIZE FUNCTION MODAL DEBUGGING END ===');
}


// --- CORE LOGIC ---
async function initializeQuestionnaire() {
    try {
        console.log('🚀 Initialisiere Fragebogen...');
        
        // Verwende die neue refreshData Funktion für die initiale Datenladung
        const success = await refreshData(true);
        if (!success) {
            throw new Error("Fehler beim Laden der initialen Daten vom Backend");
        }

        const restoredStartupSession = await consumeStartupSessionIntent();
        if (restoredStartupSession) {
            console.log('✅ Gespeicherte Schließplan-Session wiederhergestellt');
            return;
        }

        console.log('📊 Nach refreshData:');
        console.log('- questionsData:', questionsData);
        console.log('- questionsData.length:', questionsData?.length);
        console.log('- allCylinderSystems:', allCylinderSystems);
        console.log('- allCylinderSystems.length:', allCylinderSystems?.length);

        // Prüfe ob alle notwendigen Daten geladen wurden
        if (!questionsData || questionsData.length === 0) {
            throw new Error("Keine Fragen vom Backend erhalten. Bitte prüfen Sie, ob Fragen im Strapi-Admin eingetragen sind.");
        }

        // Zylinder werden erst beim Zylinder-Finder benötigt, nicht beim Start
        console.log('📊 Zylinder werden beim Zylinder-Finder geladen');

        // Logo setzen
        const logoImg = document.querySelector('#logo img');
        if (logoImg && logoImg.src) {
            document.documentElement.style.setProperty('--firmen-logo', `url(${logoImg.src})`);
        }

        // Option-Details-Map wird bereits in refreshData aufgebaut
        // Keine zusätzliche Verarbeitung nötig

        // Fragen-Daten für das Frontend aufbereiten - nicht mehr nötig, da refreshData das bereits macht
        // questionsData wird bereits in refreshData korrekt verarbeitet

        // UI initialisieren
        currentQuestionIndex = 0;
        userAnswers = {};
        elements.questionnaireContainer.classList.remove('hidden');
        elements.schliessplanContainer.classList.add('hidden');
        elements.navigationButtons.style.display = 'flex';
        
        console.log('🎯 Vor renderCurrentQuestion:');
        console.log('- currentQuestionIndex:', currentQuestionIndex);
        console.log('- questionsData[0]:', questionsData[0]);
        
        renderCurrentQuestion();

        
        console.log('✅ Fragebogen erfolgreich initialisiert');
        
        // Debug: Initialisiere Debug-Panels (deaktiviert)
        // createDebugPanel();
        // createDebugToggle();
        // console.log('✅ Debug-System initialisiert');

    } catch (error) {
        console.error('❌ Fehler beim Initialisieren des Fragebogens:', error);
        alert(`Fehler beim Laden der Anwendung: ${error.message}`);
    }
}

function renderCurrentQuestion() {
    console.log('🔍 renderCurrentQuestion aufgerufen');
    console.log('currentQuestionIndex:', currentQuestionIndex);
    console.log('questionsData:', questionsData);
    console.log('questionsData.length:', questionsData?.length);
    
    // Debug: Prüfe ob contentContainer verfügbar ist
    console.log('contentContainer verfügbar:', !!elements.contentContainer);
    console.log('contentContainer Element:', elements.contentContainer);
    
    const question = questionsData[currentQuestionIndex];
    console.log('Aktuelle Frage:', question);
    
    if (!question) {
        console.error('❌ Keine Frage gefunden für Index:', currentQuestionIndex);
        return;
    }

    console.log('Rendere Frage:', question.key, question.questionText);
    console.log('Frage Optionen:', question.options);

    const questionElement = document.createElement('div');
    questionElement.className = 'question-card';
    questionElement.innerHTML = `
        <h2 class="text-2xl font-semibold text-center text-gray-700 mb-2">${question.questionText || question.question || 'Frage'}</h2>
        <p class="text-center text-gray-500 mb-6">${question.description || ''}</p>
        <div class="options-grid-container mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2"></div>
    `;
    console.log('Leere contentContainer...');
    elements.contentContainer.innerHTML = '';
    console.log('Füge Frage hinzu...');
    elements.contentContainer.appendChild(questionElement);
    console.log('Frage hinzugefügt. ContentContainer innerHTML:', elements.contentContainer.innerHTML.substring(0, 200) + '...');

    let optionsToRender;
    if (!question.options || !Array.isArray(question.options)) {
        console.warn(`Keine Optionen für Frage gefunden:`, question);
        optionsToRender = [];
    } else if (question.key === 'tueren' || question.key === 'tuerens') {
        console.log('=== TÜREN-FRAGE DEBUGGING ===');
        const objekttypAntwort = userAnswers['objekttyp'];
        console.log('Ausgewählter Objekttyp:', objekttypAntwort);
        
        if (!objekttypAntwort) {
            console.log('Kein Objekttyp ausgewählt - zeige alle Türen-Optionen');
            optionsToRender = question.options;
        } else {
            // Finde die ausgewählte Objekttyp-Option
        const objekttypFrage = questionsData.find(q => q.key === 'objekttyp');
            console.log('Objekttyp-Frage gefunden:', !!objekttypFrage);
            
            if (objekttypFrage) {
                // Finde die Objekttyp-Option in contentTypes.objekttyp (hat die tuerens Relations)
                const gewaehlteObjekttypOption = contentTypes.objekttyp.find(opt => 
                    opt.name === objekttypAntwort || opt.key === objekttypAntwort
                );
                console.log('Gewählte Objekttyp-Option aus contentTypes:', gewaehlteObjekttypOption);
                console.log('Objekttyp-Option Keys:', Object.keys(gewaehlteObjekttypOption));
                console.log('Hat tuerens?', 'tuerens' in gewaehlteObjekttypOption);
                console.log('tuerens Wert:', gewaehlteObjekttypOption.tuerens);
                
                if (gewaehlteObjekttypOption) {
                    // Prüfe ob die Option tuerens hat
                    if (gewaehlteObjekttypOption.tuerens && Array.isArray(gewaehlteObjekttypOption.tuerens)) {
                        console.log('Türen Relations gefunden:', gewaehlteObjekttypOption.tuerens.length);
                        
                        // Filtere die Türen-Optionen basierend auf den tuerens
                        const filteredDoors = question.options.filter(doorOption => {
                            // Prüfe ob diese Tür zu den tuerens des ausgewählten Objekttyps gehört
                            const isSuitableDoor = gewaehlteObjekttypOption.tuerens.some(suitableDoor => 
                                suitableDoor.id === doorOption.id || 
                                suitableDoor.name === doorOption.name || 
                                suitableDoor.key === doorOption.key
                            );
                            console.log(`Tür "${doorOption.name}" ist Suitable Door:`, isSuitableDoor);
                            return isSuitableDoor;
                        });
                        
                        console.log('Gefilterte Türen:', filteredDoors.map(d => d.name));
                        optionsToRender = filteredDoors;
                    } else {
                        console.log('Keine tuerens Relations gefunden - zeige alle Türen-Optionen');
                        optionsToRender = question.options;
                    }
                } else {
                    console.log('Gewählte Objekttyp-Option nicht gefunden - zeige alle Türen-Optionen');
                    optionsToRender = question.options;
                }
            } else {
                console.log('Objekttyp-Frage nicht gefunden - zeige alle Türen-Optionen');
                optionsToRender = question.options;
            }
        }
        
        // Füge benutzerdefinierte Türen hinzu
        const customDoors = question.options.filter(opt => opt.isCustom);
        if (customDoors.length > 0) {
            console.log('Benutzerdefinierte Türen hinzugefügt:', customDoors.map(d => d.text));
            optionsToRender = [...optionsToRender, ...customDoors];
        }
        
        console.log('Finale Türen-Optionen:', optionsToRender.map(d => d.text));
        console.log('=== TÜREN-FRAGE DEBUGGING END ===');
    } else {
        optionsToRender = question.options;
    }

    console.log('optionsToRender:', optionsToRender);
    
    const optionsGridContainer = questionElement.querySelector('.options-grid-container');
    let optionsGridHtml = '';
    
    if (optionsToRender && optionsToRender.length > 0) {
        optionsGridHtml = optionsToRender.map(opt => createOptionCardHtml(question, opt)).join('');
    }

    if (question.key === 'tueren') {
        const addCustomDoorCardHtml = `<div class="option-card flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-400 p-4 text-center transition-all duration-200 hover:border-green-500 hover:bg-gray-100" onclick="focusCustomDoorInput()"><i class="fas fa-plus-circle fa-fw flex-shrink-0 text-2xl text-green-500"></i><div><p class="text-lg font-semibold text-gray-700">Eigene Tür hinzufügen</p><p class="mt-1 text-sm text-gray-600">Benennen Sie eine nicht aufgelistete Tür.</p></div></div>`;
        optionsGridHtml += addCustomDoorCardHtml;
    }

    optionsGridContainer.innerHTML = optionsGridHtml || `<p class="col-span-2 text-center text-gray-500">Keine Optionen für diese Frage verfügbar.</p>`;
    
    if (question.key === 'tueren') {
        const customInputHtml = `<div class="mt-6 border-t pt-6"><h3 class="mb-4 text-center text-lg font-semibold text-gray-600">Eigene Tür/Bereich hinzufügen:</h3><div class="flex flex-wrap items-center justify-center gap-2"><input type="text" id="custom-input" class="input-cell w-64 max-w-full" placeholder="z.B. Werkstatt" onkeydown="if(event.key==='Enter') { event.preventDefault(); addCustomOption(); }"><button onclick="addCustomOption()" class="rounded-lg bg-green-500 px-4 py-2 font-bold text-white hover:bg-green-600">Hinzufügen</button></div></div>`;
        questionElement.insertAdjacentHTML('beforeend', customInputHtml);
    }
    
    updateNavigation();
    console.log('✅ Frage erfolgreich gerendert');
}

function createOptionCardHtml(question, option) {
    const optLabel = option.name || option.text;
    const ua = userAnswers[question.key];
    const isSelected = Array.isArray(ua)
        ? ua.includes(optLabel)
        : ua !== undefined && ua !== null && ua === optLabel;
    const iconHtml = option.icon ? `<img src="${option.icon}" alt="Icon" class="mb-2 h-8 w-8">` : '';
    const recommendationClass = option.empfehlung === 'Empfohlen' ? 'is-recommended' : '';
    let selectionClass = isSelected ? (option.isCustom ? 'selected-custom' : 'selected') : '';
    const customCardClass = option.isCustom ? 'is-custom-card' : '';
    const isCustomFlag = !!option.isCustom;
    const optionName = option.name || option.text;
    const safeName = String(optionName).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div class="option-card relative flex cursor-pointer flex-col items-center border-2 border-gray-300 rounded-lg p-4 text-center transition-all duration-200 ${recommendationClass} ${selectionClass} ${customCardClass}" onclick="selectOption(this, '${question.key}', '${safeName}', '${question.type}', ${isCustomFlag})">${iconHtml}<div><p class="text-lg font-semibold">${optionName}</p>${option.description ? `<p class="mt-1 text-sm text-gray-600">${option.description}</p>` : ''}</div></div>`;
}

function getQuestionAnswerValue(question) {
    if (!question) return undefined;
    if (question.key === 'tueren' || question.key === 'tuerens') {
        return userAnswers.tueren ?? userAnswers.tuerens;
    }
    return userAnswers[question.key];
}

function questionHasValidAnswer(question) {
    const answer = getQuestionAnswerValue(question);
    if (Array.isArray(answer)) {
        return answer.some(value => value !== undefined && value !== null && String(value).trim() !== '');
    }
    return answer !== undefined && answer !== null && String(answer).trim() !== '';
}

function selectOption(element, key, value, type, isCustom) {
    const customClass = 'selected-custom';
    const standardClass = 'selected';

    if (type === 'single') {
        if (key === 'objekttyp' && userAnswers[key] !== value) {
            delete userAnswers.tueren;
            delete userAnswers.tuerens;
            const tuerenFrage = questionsData.find(q => q.key === 'tueren' || q.key === 'tuerens');
            if (tuerenFrage) tuerenFrage.options = tuerenFrage.options.filter(opt => !opt.isCustom);
        }
        userAnswers[key] = value;
        const container = element.closest('.options-grid-container') || elements.contentContainer;
        if (container) {
            container.querySelectorAll('.option-card').forEach(card => card.classList.remove(standardClass, customClass));
        }
        element.classList.add(isCustom ? customClass : standardClass);
        saveSessionToStorage();
        updateNavigation();
        return;
    }

    if (!userAnswers[key]) userAnswers[key] = [];
    const index = userAnswers[key].indexOf(value);
    if (index > -1) {
        userAnswers[key].splice(index, 1);
        element.classList.remove(standardClass, customClass);
    } else {
        userAnswers[key].push(value);
        element.classList.add(isCustom ? customClass : standardClass);
    }
    saveSessionToStorage();
    updateNavigation();
}

function handleNext() {
    const currentQuestion = questionsData[currentQuestionIndex];
    if (!questionHasValidAnswer(currentQuestion)) {
        updateNavigation();
        return;
    }

    if (currentQuestionIndex < questionsData.length - 1) {
        currentQuestionIndex++;
        renderCurrentQuestion();
        // Speichere Session
        saveSessionToStorage();
    } else {
        // Prüfe ob alle notwendigen Fragen beantwortet wurden
        const tAns = userAnswers['tueren'] ?? userAnswers['tuerens'];
        const tuerenOk = Array.isArray(tAns) ? tAns.length > 0 : (tAns !== undefined && tAns !== null && String(tAns).length > 0);
        if (!tuerenOk) {
            alert("Bitte wählen Sie eine Option aus oder fügen Sie eine eigene Tür hinzu.");
            return;
        }
        // Nach der letzten Frage (Qualität) direkt zum Zylinder-Finder
        renderCylinderFinder();
        // Speichere Session
        saveSessionToStorage();
    }
}

function handlePrev() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        elements.navigationButtons.style.display = 'flex';
        renderCurrentQuestion();
        // Speichere Session
        saveSessionToStorage();
    }
}

function updateNavigation() {
    const totalSteps = questionsData.length + 1;
    const currentStep = currentQuestionIndex + 1;
    const progress = (currentStep / totalSteps) * 100;
    const currentQuestion = questionsData[currentQuestionIndex];
    const hasAnswer = questionHasValidAnswer(currentQuestion);
    
    elements.progressBar.style.width = `${progress}%`;
    elements.subtitle.innerText = `Schritt ${currentStep} von ${totalSteps}`;
    elements.prevBtn.disabled = currentQuestionIndex === 0;
    elements.nextBtn.innerText = (currentQuestionIndex === questionsData.length - 1) ? "Zylinder finden" : "Weiter";
    elements.nextBtn.disabled = !hasAnswer;
    elements.nextBtn.classList.toggle('is-waiting-for-selection', !hasAnswer);
    elements.nextBtn.title = hasAnswer ? '' : 'Bitte zuerst eine Auswahl treffen.';
}

function addCustomOption() {
    const input = document.getElementById('custom-input');
    const value = input.value.trim();
    if (value === '') return;
    const tuerenFrage = questionsData.find(q => q.key === 'tueren' || q.key === 'tuerens');
    if (!tuerenFrage) return;
    const isDuplicate = userAnswers.tueren?.includes(value) || userAnswers.tuerens?.includes(value) || tuerenFrage.options.some(opt => opt.text === value);
    if (isDuplicate) {
        alert("Diese Tür existiert bereits.");
        input.value = '';
        return;
    }
    if (!userAnswers.tueren) userAnswers.tueren = [];
    if (!userAnswers.tuerens) userAnswers.tuerens = [];
    userAnswers.tueren.push(value);
    userAnswers.tuerens.push(value);
    const newOption = { text: value, icon: null, description: 'Benutzerdefinierte Tür', empfehlung: null, isCustom: true };
    tuerenFrage.options.push(newOption);
    input.value = '';
    renderCurrentQuestion();
    saveSessionToStorage();
}

// --- ZYLINDER-ASSISTENT LOGIK (VEREINFACHT) ---

function calculateRecommendation(answers) {
    // 1. Nach Technologie filtern
    let technologyFilteredCylinders;
    if (answers.technologie === 'Rein Elektronisch') {
        technologyFilteredCylinders = allCylinderSystems.filter(s => s.isElectronic);
    } else { // Für "Rein Mechanisch" und "Gemischte Anlage" mechanische Zylinder betrachten
        technologyFilteredCylinders = allCylinderSystems.filter(s => !s.isElectronic);
    }

    if (technologyFilteredCylinders.length === 0) {
        return allCylinderSystems[0]; // Fallback, falls keine passenden Zylinder gefunden
    }

    // 2. Ziel-Sicherheitslevel bestimmen
    let targetLevels = [];
    switch (answers.sicherheitslevel) {
        case 'Standard-Sicherheit (gut)': targetLevels = [1, 2, 3]; break;
        case 'Erhöhte Sicherheit (besser)': targetLevels = [4]; break;
        case 'Maximale Sicherheit (am besten)': targetLevels = [5]; break;
        default: targetLevels = [1, 2, 3, 4, 5];
    }

    // 3. Nach Sicherheitslevel filtern
    let securityFilteredCylinders = technologyFilteredCylinders.filter(system => 
        targetLevels.includes(system.securityLevel)
    );

    // Fallback: Wenn kein Zylinder das Level erfüllt, alle aus dem Technologieschritt nehmen
    if (securityFilteredCylinders.length === 0) {
        securityFilteredCylinders = technologyFilteredCylinders;
    }
    
    // 4. Den ERSTEN passenden Zylinder als Empfehlung zurückgeben
    return securityFilteredCylinders[0];
}

function renderCylinderFinder() {
    elements.navigationButtons.style.display = 'none';
    elements.subtitle.innerText = `Schritt 7 von 7: Wählen Sie Ihr Zylindersystem`;
    elements.progressBar.style.width = '100%';
    
    // Debug: Aktualisiere Debug-Panel wenn verfügbar
    if (typeof updateDebugPanel === 'function') {
        updateDebugPanel();
    }

    if (!allCylinderSystems || allCylinderSystems.length === 0) {
        elements.contentContainer.innerHTML = `
            <div class="text-center">
                <p class="mb-4 text-red-500">Keine Zylinder verfügbar. Bitte überprüfen Sie die Daten im Backend.</p>
                <button onclick="location.reload()" class="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600">
                    Seite neu laden
                </button>
            </div>
        `;
        return;
    }

    // Berechne passende Zylinder basierend auf den Antworten
    const recommendedCylinders = getRecommendedCylinders(userAnswers);
    
    if (recommendedCylinders.length === 0) {
        elements.contentContainer.innerHTML = `
            <div class="text-center">
                <p class="mb-4 text-red-500">Keine Zylinder verfügbar.</p>
            </div>
        `;
        return;
    }
    
    // Bester Zylinder (erster in der Liste)
    const bestCylinder = recommendedCylinders[0];
    const bestCylinderHtml = createCylinderCard(bestCylinder, true);
    
    // Andere Zylinder (alle außer dem ersten)
    const otherCylinders = recommendedCylinders.slice(1);
    const otherCylindersHtml = otherCylinders.map(cylinder => createCylinderCard(cylinder, false)).join('');

    elements.contentContainer.innerHTML = `
        <div class="mx-auto w-full max-w-6xl pr-1">
            <div class="mb-8 text-center">
                <h2 class="text-2xl font-semibold text-gray-700">Verfügbare Zylinder-Systeme</h2>
                <p class="text-gray-500">Wählen Sie das passende Zylinder-System für Ihren Schließplan.</p>
            </div>
            
            <!-- Bester Zylinder - Quer angezeigt -->
            <div class="mb-12">
                ${bestCylinderHtml}
            </div>
            
            ${otherCylinders.length > 0 ? `
            <div class="mb-6 text-center">
                <h3 class="text-xl font-semibold text-gray-600">Andere passende Optionen</h3>
                <p class="text-gray-500">Diese Systeme könnten ebenfalls eine gute Wahl sein.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                ${otherCylindersHtml}
            </div>
            ` : ''}
            
            <div class="mt-12 text-center">
                <button onclick="generatePlan()" class="rounded-lg bg-[#203d5d] px-8 py-3 text-white transition-colors hover:bg-[#1a344f]">
                    <i class="fas fa-cog mr-2"></i>Schließplan generieren
                </button>
            </div>
        </div>
    `;
}

function createCylinderCard(system, isMain) {
    // Zylinder-Bild
    const imageHtml = system.image ? 
        `<img src="${system.image}" alt="${system.name}" class="w-full h-32 object-cover rounded-lg mb-4">` : 
        `<div class="w-full h-32 bg-gray-200 rounded-lg mb-4 flex items-center justify-center">
            <i class="fas fa-lock text-gray-400 text-2xl"></i>
        </div>`;
    
    // Match-Balken
    const matchPercentage = system.matchPercentage || 0;
    const matchColor = matchPercentage >= 80 ? 'bg-green-500' : 
                      matchPercentage >= 60 ? 'bg-yellow-500' : 'bg-orange-500';
    const matchTextColor = matchPercentage >= 80 ? 'text-green-700' : 
                          matchPercentage >= 60 ? 'text-yellow-700' : 'text-orange-700';
    
    const matchBarHtml = `
        <div class="mb-4">
            <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-medium text-gray-600">Passung zu Ihren Anforderungen:</span>
                <span class="text-sm font-bold ${matchTextColor}">${matchPercentage}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-3">
                <div class="h-3 rounded-full ${matchColor} transition-all duration-500" style="width: ${matchPercentage}%"></div>
            </div>
            <div class="text-xs text-gray-500 mt-1">
                ${system.matchCount || 0} von ${system.totalChecks || 0} Kriterien erfüllt
            </div>
        </div>`;
    
    // Preis anzeigen
    const priceHtml = system.price ? 
        `<div class="text-lg font-bold text-green-600 mb-2">€${system.price.toFixed(2)}</div>` : 
        `<div class="text-sm text-gray-500 mb-2">Preis auf Anfrage</div>`;
    
    // Features aus den Relations
    const features = system.suitableFeatures || [];
    console.log('🔍 Features für Zylinder:', system.name);
    console.log('   suitableFeatures:', features);
    console.log('   _debugFeatures:', system._debugFeatures);
    
    const featuresHtml = features.length > 0 ? 
        features.map(f => {
            const featureName = f.name || f.text || f.optionText || f.title || 'Unbekanntes Feature';
            console.log('🔍 Feature:', f, 'Name:', featureName);
            return `<li><i class="fas fa-check-circle text-green-500"></i> ${featureName}</li>`;
        }).join('') : 
        '<li><i class="fas fa-info-circle text-blue-500"></i> Standard-Features</li>';

    if (isMain) {
        return `
            <div class="cylinder-card bg-white border-2 border-blue-200 rounded-xl p-6 shadow-lg">
                <div class="flex flex-col lg:flex-row gap-6">
                    <!-- Bild und Hauptinfo -->
                    <div class="lg:w-1/3">
                        ${imageHtml}
                        <div class="text-center">
                            <h3 class="text-2xl font-bold text-gray-800 mb-2">${system.name}</h3>
                            <p class="text-gray-600 mb-4">${system.description || 'Hochwertiger Zylinder für Ihre Anforderungen'}</p>
                            ${priceHtml}
                        </div>
                    </div>
                    
                    <!-- Match-Info und Features -->
                    <div class="lg:w-2/3">
                        ${matchBarHtml}
                        <div class="mb-6">
                            <h4 class="text-lg font-semibold text-gray-700 mb-3">Features:</h4>
                            <ul class="cylinder-feature-list grid grid-cols-1 md:grid-cols-2 gap-2">${featuresHtml}</ul>
                        </div>
                        
                        <!-- Blauer Auswählen Button -->
                        <div class="text-center">
                            <button type="button" onclick="selectCylinderSystem(${JSON.stringify(system.id)})" class="bg-[#203d5d] hover:bg-[#1a344f] text-white font-bold py-4 px-8 rounded-lg transition-colors text-lg shadow-md hover:shadow-lg">
                                <i class="fas fa-check-circle mr-2"></i>Auswählen
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
    } else {
        return `
            <div class="cylinder-card alternative-card text-center">
                ${imageHtml}
                <h4 class="text-lg font-bold text-gray-800 mb-2">${system.name}</h4>
                <p class="text-gray-500 text-sm mb-4 flex-grow">${system.description || 'Alternative Zylinder-Option'}</p>
                ${matchBarHtml}
                ${priceHtml}
                <button type="button" onclick="selectCylinderSystem(${JSON.stringify(system.id)})" class="w-full mt-auto bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors text-sm">
                    Als Alternative wählen
                </button>
            </div>`;
    }
}

/** Strapi v4/v5: id kann Zahl oder String (documentId) sein */
function findCylinderSystemById(id) {
    if (id === undefined || id === null) return undefined;
    return allCylinderSystems.find(c => String(c.id) === String(id));
}

function selectCylinderSystem(systemId) {
    const selectedCylinder = findCylinderSystemById(systemId);
    if (selectedCylinder) {
        userAnswers.zylinder = selectedCylinder.name;
        userAnswers.cylinderSystemId = selectedCylinder.id;
        console.log('✅ Zylinder ausgewählt:', selectedCylinder.name);
    }
    generateInitialPlanData();
    showSchliessplan().catch(err => console.error('❌ showSchliessplan:', err));
}

/** Button „Schließplan generieren“ im Zylinder-Schritt (ohne vorher eine Karte angeklickt zu haben) */
async function generatePlan() {
    if (!userAnswers.cylinderSystemId && allCylinderSystems && allCylinderSystems.length > 0) {
        userAnswers.cylinderSystemId = allCylinderSystems[0].id;
    }
    generateInitialPlanData();
    await showSchliessplan();
}

// --- SCHLIESSPLAN LOGIK ---

async function showSchliessplan() {
    const tuerenFrage = questionsData.find(q => q.key === 'tueren' || q.key === 'tuerens');
    let alleTuerOptionen = tuerenFrage ? (tuerenFrage.options || []).map(o => o.text || o.name).filter(Boolean) : [];
    const rawTuerUser = userAnswers['tueren'] ?? userAnswers['tuerens'];
    const userTuerList = Array.isArray(rawTuerUser)
        ? rawTuerUser
        : (rawTuerUser != null && rawTuerUser !== '' ? [rawTuerUser] : []);
    allDoorOptionsForPlan = [...new Set([...userTuerList, ...alleTuerOptionen])];

    elements.questionnaireContainer.classList.add('hidden');
    elements.schliessplanContainer.classList.remove('hidden');
    elements.schliessplanContainer.scrollTop = 0;
    if (elements.subtitle) {
        elements.subtitle.textContent = 'Schließplan bearbeiten';
    }
    renderPlan();
    const tableWrap = document.querySelector('#schliessplan-container .overflow-x-auto');
    if (tableWrap && typeof tableWrap.scrollIntoView === 'function') {
        tableWrap.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    
    // Prüfe ob Benutzer eingeloggt ist und zeige/verstecke Anmelde-Option
    await checkAndShowLoginOption();
    
    // Prüfe ob Benutzer eingeloggt ist und zeige Speichern-Button
    await checkAndShowSaveButton();
    markPlanDirty('plan-visible');
}

// Prüfe Auth-Status und zeige Speichern-Button wenn eingeloggt
async function checkAndShowSaveButton() {
    try {
        const supabaseClient = await ensureSupabaseReady();
        if (supabaseClient) {
            const { data: { user }, error } = await supabaseClient.auth.getUser();
            
            const saveButtonContainer = document.getElementById('save-to-profile-container');
            if (saveButtonContainer) {
                if (!error && user) {
                    // Eingeloggt → Zeige Speichern-Button
                    saveButtonContainer.classList.remove('hidden');
                } else {
                    // Nicht eingeloggt → Verstecke Speichern-Button
                    saveButtonContainer.classList.add('hidden');
                }
            }
        } else {
            // Supabase nicht verfügbar → Verstecke Button
            const saveButtonContainer = document.getElementById('save-to-profile-container');
            if (saveButtonContainer) {
                saveButtonContainer.classList.add('hidden');
            }
        }
    } catch (error) {
        console.warn('⚠️ Fehler beim Prüfen des Auth-Status für Save-Button:', error);
        const saveButtonContainer = document.getElementById('save-to-profile-container');
        if (saveButtonContainer) {
            saveButtonContainer.classList.add('hidden');
        }
    }
}

// Prüfe Auth-Status und zeige Anmelde-Option wenn nicht eingeloggt
async function checkAndShowLoginOption() {
    try {
        const supabaseClient = await ensureSupabaseReady();
        if (supabaseClient) {
            const { data: { user }, error } = await supabaseClient.auth.getUser();
            
            const loginOptionContainer = document.getElementById('login-option-container');
            if (loginOptionContainer) {
                if (error || !user) {
                    // Nicht eingeloggt → Zeige Anmelde-Option
                    loginOptionContainer.classList.remove('hidden');
                } else {
                    // Eingeloggt → Verstecke Anmelde-Option
                    loginOptionContainer.classList.add('hidden');
                }
            }
        } else {
            // Supabase nicht verfügbar → Zeige Anmelde-Option
            const loginOptionContainer = document.getElementById('login-option-container');
            if (loginOptionContainer) {
                loginOptionContainer.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.warn('⚠️ Fehler beim Prüfen des Auth-Status für Login-Option:', error);
        // Bei Fehler → Zeige Anmelde-Option
        const loginOptionContainer = document.getElementById('login-option-container');
        if (loginOptionContainer) {
            loginOptionContainer.classList.remove('hidden');
        }
    }
}

function generateInitialPlanData() {
    const techDefault = userAnswers.technologie === 'Rein Elektronisch' ? 'elektronisch' : 'mechanisch';
    const selectedSystem = findCylinderSystemById(userAnswers.cylinderSystemId) || allCylinderSystems[0] || null;
    const defaultSystemOption = getDefaultSchliessplanSystemOption(techDefault);

    // Dynamische Standard-Funktionen basierend auf ALL_FEATURES
    const defaultFunctions = {};
    Object.keys(ALL_FEATURES).forEach(key => {
        const feat = ALL_FEATURES[key];
        if (!feat) return;
        const featureName = feat.name;
        defaultFunctions[key] = userAnswers.funktionen?.includes(featureName) || false;
    });

    const rawTueren = userAnswers['tueren'] ?? userAnswers['tuerens'];
    const tuerenListe = Array.isArray(rawTueren) ? rawTueren : rawTueren != null && rawTueren !== '' ? [rawTueren] : [];
    planData.rows = (tuerenListe.length > 0 ? tuerenListe : ['Beispieltür']).map((tuer, index) => ({
        id: Date.now() + index, pos: index + 1, tuer: tuer, typ: ZYLINDER_ARTEN[0],
        zylinderSystemId: selectedSystem ? selectedSystem.id : null,
        systemId: defaultSystemOption ? defaultSystemOption.key : techDefault,
        techType: inferTechTypeFromSystemOption(defaultSystemOption) || techDefault, massA: '30', massI: '30', anzahl: 1,
        funktionen: { ...defaultFunctions }, // NEU: Standardfunktionen werden hier für jede Tür übernommen
        matrix: [],
        isEditingTuer: false, isAddingCustomTuer: false
    }));
    const keyMap = { "Gleichschließend": ["Alle Türen"], "Zentralschloss": ["Mieter A", "Mieter B", "Hausmeister"], "Hauptschlüssel": ["Hauptschlüssel", "Gruppe 1", "Gruppe 2"] };
    planData.keys = (keyMap[userAnswers['anlagentyp']] || ['Gruppe 1', 'Gruppe 2']).map((keyName, index) => ({ id: Date.now() + index, name: keyName }));
    const prefillMatrix = userAnswers['anlagentyp'] === 'Gleichschließend';
    planData.rows.forEach(row => { row.matrix = Array(planData.keys.length).fill(prefillMatrix); });
}

function renderPlan() {
    try {
        if (!elements.schliessplanBody || !elements.keyHeader || !elements.keyHeaderMain || !elements.dynamicHeaderCell) {
            console.error('❌ renderPlan: fehlende DOM-Referenzen (#schliessplan-body / Schlüssel-Header)');
            return;
        }
        updatePlanRowPositions();
        const isMixedSystem = userAnswers.technologie === 'Gemischte Anlage';
        if (elements.techHeader) {
            elements.techHeader.style.display = isMixedSystem ? '' : 'none';
        }
        if (elements.colorLegend) {
            elements.colorLegend.style.display = isMixedSystem ? 'flex' : 'none';
        }

        elements.keyHeader.innerHTML = '';
        planData.keys.forEach(key => {
            const headerCell = document.createElement('div');
            headerCell.className = 'schluessel-header-zelle';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = key.name != null ? String(key.name) : '';
            inp.dataset.keyId = String(key.id);
            inp.addEventListener('change', function () { updateKeyName(this); });
            headerCell.appendChild(inp);
            elements.keyHeader.appendChild(headerCell);
        });

        const keyCount = planData.keys.length > 0 ? planData.keys.length : 1;
        elements.keyHeaderMain.colSpan = 1 + keyCount;
        elements.dynamicHeaderCell.colSpan = keyCount;
        elements.schliessplanBody.innerHTML = '';
        planData.rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.dataset.rowId = row.id;
        tr.className = row.techType === 'elektronisch' ? 'row-elektronisch' : 'row-mechanisch';
        tr.addEventListener('dragover', handleSchliessplanRowDragOver);
        tr.addEventListener('dragleave', handleSchliessplanRowDragLeave);
        tr.addEventListener('drop', handleSchliessplanRowDrop);

        let tuerCellHtml = '';
        if (row.isAddingCustomTuer) {
            tuerCellHtml = `<input type="text" class="input-cell" placeholder="Bezeichnung eingeben..." onblur="saveCustomDoorName(this, ${row.id})" onkeydown="if(event.key==='Enter') this.blur()">`;
        } else if (row.isEditingTuer) {
            const options = allDoorOptionsForPlan.map(opt => `<option value="${opt}" ${row.tuer === opt ? 'selected' : ''}>${opt}</option>`).join('');
            tuerCellHtml = `<select class="input-cell" onchange="updateDoorSelection(this, ${row.id})"><option value="">Bitte wählen...</option>${options}<option value="add_custom" class="font-bold text-[#203d5d]">Eigene Bezeichnung...</option></select>`;
        } else {
            tuerCellHtml = `<span class="font-semibold">${row.tuer}</span><button type="button" aria-label="Tuerbezeichnung bearbeiten" title="Tuerbezeichnung bearbeiten" onclick="editDoorName(${row.id})" class="ml-2 text-gray-400 hover:text-[#203d5d] opacity-50 hover:opacity-100 transition-opacity"><i class="fas fa-pencil-alt fa-xs" aria-hidden="true"></i></button>`;
        }

        const zylinderOptions = ZYLINDER_ARTEN.map(art => `<option value="${escapeHtmlValue(art)}" ${row.typ === art ? 'selected' : ''}>${escapeHtmlValue(art)}</option>`).join('');
        const systemOptionItems = getSchliessplanSystemOptions();
        const rowSystemOption = findSchliessplanSystemOption(row.systemId) || systemOptionItems[0];
        if (rowSystemOption && !findSchliessplanSystemOption(row.systemId)) {
            row.systemId = rowSystemOption.key;
        }
        const rowSystemColor = normalizeSystemColor(rowSystemOption?.color, '#e8eef5');
        const rowSystemBg = hexToRgba(rowSystemColor, 0.16);
        tr.classList.add('row-system-colored');
        tr.style.setProperty('--row-system-color', rowSystemColor);
        tr.style.setProperty('--row-system-bg', rowSystemBg);
        tr.dataset.systemColor = rowSystemColor;
        const systemOptions = systemOptionItems.map(sys => {
            const color = normalizeSystemColor(sys.color, '#e8eef5');
            const selected = String(row.systemId) === String(sys.key) || String(row.systemId) === String(sys.id);
            return `<option value="${escapeHtmlValue(sys.key)}" data-color="${escapeHtmlValue(color)}" style="background-color: ${hexToRgba(color, 0.26)}; color: #142033;" ${selected ? 'selected' : ''}>${escapeHtmlValue(sys.name)}</option>`;
        }).join('');
        const systemSelectStyle = `--system-color: ${rowSystemColor}; --system-bg: ${rowSystemBg}; background-color: ${rowSystemBg}; border-left: 7px solid ${rowSystemColor};`;
        
        let functionIcons = Object.keys(row.funktionen || {}).map((key) => {
            if (!row.funktionen[key]) return '';
            const feat = ALL_FEATURES[key];
            if (!feat) {
                return `<i class="fas fa-question-circle text-gray-300 fa-fw" title="${key}"></i>`;
            }
            return `<i class="fas ${feat.icon} ${feat.color} fa-fw" title="${feat.title || feat.name || ''}"></i>`;
        }).join('');
        functionIcons += `<button type="button" aria-label="Funktionen bearbeiten" title="Funktionen bearbeiten" class="icon-btn text-xl text-gray-400 hover:text-[#203d5d] ml-2" onclick="openFunctionModal(${row.id})"><i class="fas fa-cog" aria-hidden="true"></i></button>`;
        
        let matrixCells = planData.keys.map((key, keyIndex) => `<td class="border-l schliessmatrix-cell ${row.matrix[keyIndex] ? 'checked' : ''}" onclick="toggleMatrix(this, ${row.id}, ${keyIndex})">${row.matrix[keyIndex] ? '<i class="fas fa-times text-xl"></i>' : ''}</td>`).join('');
        const techDropdown = isMixedSystem ? `<td><select class="input-cell" onchange="updateRowData(${row.id}, 'techType', this.value)"><option value="mechanisch" ${row.techType === 'mechanisch' ? 'selected' : ''}>Mechanisch</option><option value="elektronisch" ${row.techType === 'elektronisch' ? 'selected' : ''}>Elektronisch</option></select></td>` : '<td style="display: none;"></td>';
        
        const dragDots = Array.from({ length: 9 }, () => '<span aria-hidden="true"></span>').join('');
        tr.innerHTML = `
            <td class="row-drag-cell"><button type="button" class="row-drag-handle" draggable="false" data-row-id="${row.id}" title="Zeile verschieben" aria-label="Zeile ${row.pos} verschieben" onpointerdown="handleSchliessplanRowPointerDown(event, ${row.id})">${dragDots}</button></td>
            <td class="font-bold">${row.pos}</td>
            <td>${tuerCellHtml}</td>
            <td><select class="input-cell" onchange="updateRowData(${row.id}, 'typ', this.value)">${zylinderOptions}</select></td>
            <td><select class="input-cell system-color-select" style="${systemSelectStyle}" onchange="updateRowData(${row.id}, 'systemId', this.value)">${systemOptions}</select></td>
            ${techDropdown}
            <td><div class="flex items-center justify-center gap-1"><input type="text" class="input-cell w-16 text-center" value="${row.massA}" onchange="updateRowData(${row.id}, 'massA', this.value)"><span>/</span><input type="text" class="input-cell w-16 text-center" value="${row.massI}" onchange="updateRowData(${row.id}, 'massI', this.value)"></div></td>
            <td><input type="number" min="1" class="input-cell w-20 text-center" value="${row.anzahl}" onchange="updateRowData(${row.id}, 'anzahl', this.value)"></td>
            <td><div class="flex items-center justify-center gap-3">${functionIcons}</div></td>
            <td class="border-none bg-gray-100"></td>
            <td class="schliessplan-data-vertical">${row.tuer}</td>
            ${matrixCells}`;
            elements.schliessplanBody.appendChild(tr);
        });
    } catch (err) {
        console.error('❌ renderPlan fehlgeschlagen:', err);
    }
}

function updatePlanRowPositions() {
    if (!planData || !Array.isArray(planData.rows)) return;
    planData.rows.forEach((row, index) => {
        row.pos = index + 1;
    });
}

function clearSchliessplanRowDragState() {
    document.querySelectorAll('#schliessplan-body tr').forEach((row) => {
        row.classList.remove('is-row-dragging', 'row-drag-over-before', 'row-drag-over-after');
        delete row.dataset.dropPosition;
    });
}

function getSchliessplanDragTargetRow(event) {
    const row = event.target && event.target.closest ? event.target.closest('#schliessplan-body tr') : null;
    return row && row.dataset.rowId ? row : null;
}

function handleSchliessplanRowDragStart(event, rowId) {
    draggedSchliessplanRowId = String(rowId);
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedSchliessplanRowId);
    }
    const row = event.target.closest('tr');
    if (row) row.classList.add('is-row-dragging');
}

function handleSchliessplanRowDragOver(event) {
    if (!draggedSchliessplanRowId) return;
    const row = getSchliessplanDragTargetRow(event);
    if (!row || row.dataset.rowId === draggedSchliessplanRowId) return;

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    document.querySelectorAll('#schliessplan-body tr').forEach((item) => {
        if (item !== row) {
            item.classList.remove('row-drag-over-before', 'row-drag-over-after');
            delete item.dataset.dropPosition;
        }
    });

    const rect = row.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    row.dataset.dropPosition = position;
    row.classList.toggle('row-drag-over-before', position === 'before');
    row.classList.toggle('row-drag-over-after', position === 'after');
}

function handleSchliessplanRowDragLeave(event) {
    const row = getSchliessplanDragTargetRow(event);
    if (!row || row.contains(event.relatedTarget)) return;
    row.classList.remove('row-drag-over-before', 'row-drag-over-after');
    delete row.dataset.dropPosition;
}

function moveSchliessplanRowToTarget(sourceRowId, targetRowId, dropPosition = 'before') {
    if (!sourceRowId || !targetRowId || !planData || !Array.isArray(planData.rows)) return false;

    const sourceIndex = planData.rows.findIndex((row) => String(row.id) === String(sourceRowId));
    const targetIndex = planData.rows.findIndex((row) => String(row.id) === String(targetRowId));

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;

    const [movedRow] = planData.rows.splice(sourceIndex, 1);
    let insertIndex = targetIndex;
    if (sourceIndex < targetIndex) insertIndex -= 1;
    if (dropPosition === 'after') insertIndex += 1;
    insertIndex = Math.max(0, Math.min(insertIndex, planData.rows.length));

    planData.rows.splice(insertIndex, 0, movedRow);
    updatePlanRowPositions();
    renderPlan();
    markPlanDirty('row-order');
    return true;
}

function handleSchliessplanRowDrop(event) {
    if (!draggedSchliessplanRowId) return;
    event.preventDefault();

    const targetRow = getSchliessplanDragTargetRow(event);
    if (targetRow) {
        moveSchliessplanRowToTarget(
            draggedSchliessplanRowId,
            targetRow.dataset.rowId,
            targetRow.dataset.dropPosition || 'before'
        );
    }

    draggedSchliessplanRowId = null;
    clearSchliessplanRowDragState();
}

function handleSchliessplanRowDragEnd() {
    draggedSchliessplanRowId = null;
    clearSchliessplanRowDragState();
}

function handleSchliessplanRowPointerDown(event, rowId) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();

    draggedSchliessplanRowId = String(rowId);
    activeSchliessplanPointerDrag = {
        rowId: String(rowId),
        startY: event.clientY,
        moved: false,
    };

    const sourceRow = event.currentTarget.closest('tr');
    if (sourceRow) sourceRow.classList.add('is-row-dragging');
    if (event.currentTarget.setPointerCapture && event.pointerId !== undefined) {
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch (e) {
            // Pointer capture can fail if the pointer already ended; dragging still works.
        }
    }

    document.addEventListener('pointermove', handleSchliessplanRowPointerMove, { passive: false });
    document.addEventListener('pointerup', handleSchliessplanRowPointerUp, { once: true });
    document.addEventListener('pointercancel', handleSchliessplanRowPointerCancel, { once: true });
}

function handleSchliessplanRowPointerMove(event) {
    if (!activeSchliessplanPointerDrag || !draggedSchliessplanRowId) return;
    event.preventDefault();
    if (Math.abs(event.clientY - activeSchliessplanPointerDrag.startY) > 3) {
        activeSchliessplanPointerDrag.moved = true;
    }

    const element = document.elementFromPoint(event.clientX, event.clientY);
    const row = element && element.closest ? element.closest('#schliessplan-body tr') : null;
    if (!row || row.dataset.rowId === draggedSchliessplanRowId) return;

    document.querySelectorAll('#schliessplan-body tr').forEach((item) => {
        if (item !== row) {
            item.classList.remove('row-drag-over-before', 'row-drag-over-after');
            delete item.dataset.dropPosition;
        }
    });

    const rect = row.getBoundingClientRect();
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    row.dataset.dropPosition = position;
    row.classList.toggle('row-drag-over-before', position === 'before');
    row.classList.toggle('row-drag-over-after', position === 'after');
}

function handleSchliessplanRowPointerUp() {
    const targetRow = document.querySelector('#schliessplan-body tr.row-drag-over-before, #schliessplan-body tr.row-drag-over-after');
    if (targetRow && activeSchliessplanPointerDrag && activeSchliessplanPointerDrag.moved) {
        moveSchliessplanRowToTarget(
            activeSchliessplanPointerDrag.rowId,
            targetRow.dataset.rowId,
            targetRow.dataset.dropPosition || 'before'
        );
    }

    activeSchliessplanPointerDrag = null;
    draggedSchliessplanRowId = null;
    document.removeEventListener('pointermove', handleSchliessplanRowPointerMove);
    clearSchliessplanRowDragState();
}

function handleSchliessplanRowPointerCancel() {
    activeSchliessplanPointerDrag = null;
    draggedSchliessplanRowId = null;
    document.removeEventListener('pointermove', handleSchliessplanRowPointerMove);
    clearSchliessplanRowDragState();
}

function updateRowData(rowId, field, value) { 
    const row = planData.rows.find(r => r.id === rowId); 
    if (row) { 
        let realValue = value;
        if (field === 'anzahl') {
            const n = parseInt(value, 10);
            realValue = Number.isNaN(n) ? 1 : n;
        } else if (field === 'systemId') {
            const match = findSchliessplanSystemOption(value);
            realValue = match ? match.key : value;
            const inferredTechType = inferTechTypeFromSystemOption(match);
            if (inferredTechType) row.techType = inferredTechType;
        }
        row[field] = realValue;
        renderPlan();
        markPlanDirty(`row-${field}`);
    }
}

function editDoorName(rowId) {
    const row = planData.rows.find(r => r.id === rowId);
    if (row) {
        row.isEditingTuer = true;
        row.isAddingCustomTuer = false;
        renderPlan();
        markPlanDirty('edit-door');
    }
}

function updateDoorSelection(select, rowId) {
    const row = planData.rows.find(r => r.id === rowId);
    if (!row) return;
    if (select.value === 'add_custom') {
        row.isAddingCustomTuer = true;
    } else {
        row.tuer = select.value;
        row.isEditingTuer = false;
    }
    renderPlan();
    markPlanDirty('door-selection');
}

function saveCustomDoorName(input, rowId) {
    const row = planData.rows.find(r => r.id === rowId);
    if (row && input.value.trim() !== '') {
        row.tuer = input.value.trim();
    }
    row.isEditingTuer = false;
    row.isAddingCustomTuer = false;
    renderPlan();
    markPlanDirty('custom-door');
}

function updateKeyName(input) {
    const idRaw = input.dataset.keyId;
    const key = planData.keys.find(k => String(k.id) === String(idRaw));
    if (key) {
        key.name = input.value;
        markPlanDirty('key-name');
    }
}

function toggleMatrix(cell, rowId, keyIndex) {
    const row = planData.rows.find(r => r.id === rowId);
    if (row) {
        row.matrix[keyIndex] = !row.matrix[keyIndex];
        cell.classList.toggle('checked');
        cell.innerHTML = row.matrix[keyIndex] ? '<i class="fas fa-times text-xl"></i>' : '';
        markPlanDirty('matrix');
    }
}

function addSchliessplanRow() {
    const techDefault = userAnswers.technologie === 'Rein Elektronisch' ? 'elektronisch' : 'mechanisch';
    const defaultSystemOption = getDefaultSchliessplanSystemOption(userAnswers.technologie === 'Rein Elektronisch' ? 'elektronisch' : 'mechanisch');
    const lastSystemId = planData.rows.length > 0 ? planData.rows[planData.rows.length - 1].systemId : (defaultSystemOption ? defaultSystemOption.key : 'mechanisch');

    // Dynamische Standardfunktionen basierend auf ALL_FEATURES
    const defaultFunctions = {};
    Object.keys(ALL_FEATURES).forEach(key => {
        defaultFunctions[key] = false;
    });

    const newRow = {
        id: Date.now(), pos: planData.rows.length + 1, tuer: '', typ: ZYLINDER_ARTEN[0],
        systemId: lastSystemId,
        techType: techDefault, massA: '30', massI: '30', anzahl: 1,
        funktionen: defaultFunctions,
        matrix: Array(planData.keys.length).fill(false),
        isEditingTuer: true, isAddingCustomTuer: false
    };
    planData.rows.push(newRow);
    renderPlan();
    markPlanDirty('add-row');
}

function addKeyColumn() {
    planData.keys.push({ id: Date.now(), name: `Gruppe ${planData.keys.length + 1}` });
    planData.rows.forEach(row => row.matrix.push(false));
    renderPlan();
    markPlanDirty('add-key');
}

function openFunctionModal(rowId) {
    console.log('=== OPEN FUNCTION MODAL DEBUGGING ===');
    console.log('Opening modal for rowId:', rowId);
    console.log('Current ALL_FEATURES:', ALL_FEATURES);
    console.log('Number of features:', Object.keys(ALL_FEATURES).length);

    currentModalRowId = rowId;
    const row = planData.rows.find(r => r.id === rowId);
    if (!row) {
        console.error('Row not found for ID:', rowId);
        return;
    }
    console.log('Row data:', row);

    elements.modalTitle.innerText = `Funktionen für: ${row.tuer || 'Neue Tür'}`;

    // Modal-Inhalt dynamisch generieren
    const modalContent = elements.functionModal.querySelector('#features-container');
    console.log('Modal content element:', modalContent);
    modalContent.innerHTML = '';

    Object.keys(ALL_FEATURES).forEach(featureKey => {
        const feature = ALL_FEATURES[featureKey];
        const isChecked = row.funktionen[featureKey] || false;
        console.log(`Rendering feature ${featureKey}:`, feature, 'Checked:', isChecked);

        const featureHtml = `
            <label class="flex items-center p-3 border rounded-lg gap-4 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" data-feature="${featureKey}" class="h-5 w-5 rounded border-gray-300 text-[#203d5d] focus:ring-[#203d5d]" ${isChecked ? 'checked' : ''}>
                <span class="font-semibold flex-1 text-left">${feature.name}</span>
                <i class="fas ${feature.icon} ${feature.color} fa-fw" title="${feature.title}"></i>
            </label>
        `;
        modalContent.insertAdjacentHTML('beforeend', featureHtml);
    });

    console.log('Final modal HTML:', modalContent.innerHTML);
    elements.functionModal.classList.add('active');
    console.log('=== OPEN FUNCTION MODAL DEBUGGING END ===');
}

function closeFunctionModal() {
    elements.functionModal.classList.remove('active');
    currentModalRowId = null;
}

function saveFunctions() {
    if (currentModalRowId === null) return;
    const row = planData.rows.find(r => r.id === currentModalRowId);
    if (!row) return;

    document.querySelectorAll('#function-modal input[type="checkbox"]').forEach(checkbox => {
        row.funktionen[checkbox.dataset.feature] = checkbox.checked;
    });

    closeFunctionModal();
    renderPlan();
    markPlanDirty('functions');
}

// --- CRM FUNKTIONEN ---

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function showSaveStatus(type, message) {
    const statusDiv = document.getElementById('save-status');
    if (!statusDiv) return;
    
    statusDiv.className = 'mt-4 p-4 rounded-lg';
    statusDiv.classList.remove('hidden');
    
    if (type === 'success') {
        statusDiv.className += ' bg-green-100 text-green-800 border border-green-300';
        statusDiv.innerHTML = `<i class="fas fa-check-circle mr-2"></i>${message}`;
    } else if (type === 'error') {
        statusDiv.className += ' bg-red-100 text-red-800 border border-red-300';
        statusDiv.innerHTML = `<i class="fas fa-exclamation-circle mr-2"></i>${message}`;
    } else if (type === 'loading') {
        statusDiv.className += ' bg-blue-100 text-blue-800 border border-blue-300';
        statusDiv.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${message}`;
    }
}

async function findOrCreateKunde(email, vorname, nachname, telefon) {
    // Stelle sicher, dass Supabase geladen ist
    const supabaseClient = await ensureSupabaseReady();

    try {
        // 1. Prüfe ob Kunde existiert
        const { data: existingKunde, error: searchError } = await supabaseClient
            .from('kunden')
            .select('id, kundenummer')
            .eq('email', email.toLowerCase().trim())
            .single();
        
        if (existingKunde) {
            // Kunde existiert bereits - aktualisiere Daten
            const { error: updateError } = await supabaseClient
                .from('kunden')
                .update({
                    vorname: vorname || existingKunde.vorname,
                    nachname: nachname || existingKunde.nachname,
                    telefon: telefon || null,
                    aktualisiert_am: new Date().toISOString()
                })
                .eq('id', existingKunde.id);
            
            if (updateError) {
                console.error('Fehler beim Aktualisieren des Kunden:', updateError);
            }
            
            console.log('✅ Kunde gefunden:', existingKunde.kundenummer);
            return existingKunde.id;
        }
        
        // 2. Erstelle neuen Kunden (Kundenummer wird automatisch generiert)
        // Verwende die find_or_create_kunde Funktion aus Supabase
        const { data: kundeId, error: rpcError } = await supabaseClient.rpc('find_or_create_kunde', {
            p_email: email,
            p_vorname: vorname,
            p_nachname: nachname,
            p_telefon: telefon || null
        });
        
        if (rpcError) {
            // Fallback: Direkt einfügen (Kundenummer muss dann über Trigger generiert werden)
            console.warn('RPC-Funktion nicht verfügbar, verwende direkten Insert:', rpcError);
            
            // Hole nächste Kundenummer (temporär, bis Trigger funktioniert)
            const { data: newKunde, error: createError } = await supabaseClient
                .from('kunden')
                .insert([{
                    email: email.toLowerCase().trim(),
                    vorname: vorname,
                    nachname: nachname,
                    telefon: telefon || null,
                    status: 'aktiv',
                    kundenummer: 'KD-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-5)
                }])
                .select()
                .single();
            
            if (createError) {
                throw new Error(`Fehler beim Erstellen des Kunden: ${createError.message}`);
            }
            
            console.log('✅ Neuer Kunde erstellt:', newKunde.kundenummer);
            return newKunde.id;
        }
        
        // Hole Kundenummer für Anzeige
        const { data: kundeData } = await supabaseClient
            .from('kunden')
            .select('kundenummer')
            .eq('id', kundeId)
            .single();
        
        console.log('✅ Kunde erstellt/gefunden:', kundeData?.kundenummer);
        return kundeId;
        
    } catch (error) {
        console.error('Fehler in findOrCreateKunde:', error);
        throw error;
    }
}


function getCurrentPlanSignature() {
    try {
        return JSON.stringify({ userAnswers, planData, currentQuestionIndex });
    } catch (error) {
        return String(Date.now());
    }
}

function setAutoSaveStatus(type, message) {
    const statusEl = document.getElementById('autosave-status');
    if (!statusEl) return;

    const classes = {
        idle: 'text-gray-500',
        pending: 'text-blue-700',
        saving: 'text-blue-700',
        success: 'text-green-700',
        error: 'text-red-700'
    };

    statusEl.className = `mt-2 text-center text-sm ${classes[type] || classes.idle}`;
    statusEl.textContent = message || '';
}

async function getKundeForCurrentUser(supabaseClient) {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
        throw new Error('Sie müssen angemeldet sein, um automatisch zu speichern.');
    }

    const { data: existingKunde, error: kundeError } = await supabaseClient
        .from('kunden')
        .select('id, kundenummer')
        .eq('user_id', user.id)
        .single();

    if (!kundeError && existingKunde) {
        activeKundeId = existingKunde.id;
        return existingKunde;
    }

    const meta = user.user_metadata || {};
    const { data: createdKunde, error: createError } = await supabaseClient
        .from('kunden')
        .insert([{
            user_id: user.id,
            email: user.email,
            vorname: meta.vorname || '',
            nachname: meta.nachname || '',
            telefon: meta.telefon || null,
            status: 'aktiv'
        }])
        .select('id, kundenummer')
        .single();

    if (createError) {
        throw new Error(`Kunden-Daten nicht gefunden und konnten nicht erstellt werden: ${createError.message}`);
    }

    activeKundeId = createdKunde.id;
    return createdKunde;
}

function normalizeZylinderSystemIdForSupabase(systemId) {
    const numericId = Number(systemId);
    return Number.isInteger(numericId) ? numericId : null;
}

function buildSchliessplanPayload(kundeId, status = 'in_bearbeitung') {
    const selectedSystem = findCylinderSystemById(userAnswers.cylinderSystemId);
    return {
        kunde_id: kundeId,
        name: `${userAnswers.objekttyp || 'Schließplan'} - ${new Date().toLocaleDateString('de-DE')}`,
        objekttyp: userAnswers.objekttyp || null,
        anlagentyp: userAnswers.anlagentyp || null,
        qualitaet: userAnswers.qualitaet || null,
        technologie: userAnswers.technologie || null,
        zylinder_system_id: normalizeZylinderSystemIdForSupabase(userAnswers.cylinderSystemId),
        zylinder_system_name: selectedSystem?.name || null,
        plan_data: getSerializablePlanData(),
        user_answers: { ...(userAnswers || {}) },
        status,
        aktualisiert_am: new Date().toISOString()
    };
}

async function persistCurrentPlan(options = {}) {
    const { kundeId: explicitKundeId, status = 'in_bearbeitung', includeMediathek = false } = options;

    if (!planData || !Array.isArray(planData.rows) || planData.rows.length === 0) {
        return null;
    }

    const supabaseClient = await ensureSupabaseReady();
    if (!supabaseClient) {
        throw new Error('Supabase Client nicht verfügbar');
    }

    let kundeId = explicitKundeId || activeKundeId;
    if (!kundeId) {
        const kunde = await getKundeForCurrentUser(supabaseClient);
        kundeId = kunde.id;
    }

    activeKundeId = kundeId;
    const payload = buildSchliessplanPayload(kundeId, status);
    let savedPlan;

    if (activeSchliessplanId) {
        const { data, error } = await supabaseClient
            .from('schliessplaene')
            .update(payload)
            .eq('id', activeSchliessplanId)
            .select()
            .single();

        if (error) {
            throw new Error(`Fehler beim Aktualisieren des Schließplans: ${error.message}`);
        }
        savedPlan = data;
    } else {
        const { data, error } = await supabaseClient
            .from('schliessplaene')
            .insert([payload])
            .select()
            .single();

        if (error) {
            throw new Error(`Fehler beim Speichern des Schließplans: ${error.message}`);
        }
        savedPlan = data;
        activeSchliessplanId = data.id;
    }

    if (includeMediathek) {
        try {
            await saveToMediathek(supabaseClient, savedPlan.id, kundeId, savedPlan);
        } catch (error) {
            console.warn('⚠️ Mediathek-Export fehlgeschlagen, Plan wurde trotzdem gespeichert:', error);
        }
    }

    lastRemoteSaveSignature = getCurrentPlanSignature();
    saveSessionToStorage();
    return savedPlan;
}

async function flushAutoSave(options = {}) {
    if (autoSaveInProgress) {
        pendingAutoSave = true;
        return;
    }

    const signature = getCurrentPlanSignature();
    if (signature === lastRemoteSaveSignature && !options.force) {
        setAutoSaveStatus('success', 'Alle Änderungen gespeichert.');
        return;
    }

    autoSaveInProgress = true;
    pendingAutoSave = false;
    setAutoSaveStatus('saving', 'Speichere automatisch...');

    try {
        await persistCurrentPlan({ status: 'in_bearbeitung', includeMediathek: true });
        setAutoSaveStatus('success', `Automatisch gespeichert um ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}.`);
    } catch (error) {
        console.warn('⚠️ Auto-Save fehlgeschlagen:', error);
        setAutoSaveStatus('error', `Auto-Save fehlgeschlagen: ${error.message}`);
    } finally {
        autoSaveInProgress = false;
        if (pendingAutoSave) {
            scheduleAutoSave('pending-change');
        }
    }
}

function scheduleAutoSave(reason = 'change') {
    if (!planData || !Array.isArray(planData.rows) || planData.rows.length === 0) return;
    clearTimeout(autoSaveTimer);
    setAutoSaveStatus('pending', 'Änderung erkannt. Auto-Save startet gleich...');
    autoSaveTimer = setTimeout(() => {
        flushAutoSave({ reason }).catch(err => console.warn('Auto-Save Fehler:', err));
    }, AUTO_SAVE_DELAY_MS);
}

function markPlanDirty(reason = 'change') {
    saveSessionToStorage();
    if (!elements.schliessplanContainer || elements.schliessplanContainer.classList.contains('hidden')) {
        return;
    }

    const saveContainer = document.getElementById('save-to-profile-container');
    const canRemoteSave = activeKundeId || (saveContainer && !saveContainer.classList.contains('hidden'));
    if (!canRemoteSave) {
        return;
    }

    scheduleAutoSave(reason);
}

async function savePlanToCRM() {
    const vorname = document.getElementById('customer-vorname')?.value.trim();
    const nachname = document.getElementById('customer-nachname')?.value.trim();
    const email = document.getElementById('customer-email')?.value.trim();
    const telefon = document.getElementById('customer-telefon')?.value.trim();

    if (!email || !vorname || !nachname) {
        showSaveStatus('error', 'Bitte füllen Sie alle Pflichtfelder aus.');
        return;
    }

    if (!isValidEmail(email)) {
        showSaveStatus('error', 'Bitte geben Sie eine gültige E-Mail-Adresse ein.');
        return;
    }

    showSaveStatus('loading', 'Schließplan wird gespeichert...');
    const saveBtn = document.getElementById('save-plan-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const kundeId = await findOrCreateKunde(email, vorname, nachname, telefon);
        activeKundeId = kundeId;
        const savedPlan = await persistCurrentPlan({ kundeId, status: 'erstellt', includeMediathek: true });

        showSaveStatus('success', 'Schließplan erfolgreich gespeichert und in der Mediathek versioniert.');
        console.log('✅ Schließplan gespeichert:', savedPlan);
    } catch (error) {
        console.error('❌ Fehler beim Speichern:', error);
        showSaveStatus('error', `Fehler: ${error.message}`);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function skipCustomerForm() {
    if (confirm('Moechten Sie wirklich ohne Speichern fortfahren? Der Schliessplan geht verloren.')) {
        const customerFormModal = document.getElementById('customer-form-modal');
        if (customerFormModal) customerFormModal.classList.add('hidden');
        console.log('Schliessplan wurde nicht gespeichert');
        // Optional: Als PDF exportieren oder anderweitig speichern
    }
}

// Speichere Schließplan direkt ins Profil (für angemeldete Benutzer)
async function savePlanToProfile() {
    const saveBtn = document.getElementById('save-to-profile-btn');
    const originalHtml = saveBtn ? saveBtn.innerHTML : '';

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin text-xl"></i><span class="text-lg">Speichere...</span>';
    }

    try {
        const savedPlan = await persistCurrentPlan({ status: 'erstellt', includeMediathek: true });
        console.log('✅ Schließplan ins Profil gespeichert:', savedPlan);
        setAutoSaveStatus('success', 'Manuell gespeichert und HTML-Version in der Mediathek abgelegt.');
        showSuccessOverlay();
    } catch (error) {
        console.error('❌ Fehler beim Speichern:', error);
        alert(`Fehler beim Speichern: ${error.message}`);
        setAutoSaveStatus('error', `Speichern fehlgeschlagen: ${error.message}`);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalHtml || '<i class="fas fa-save text-xl"></i><span class="text-lg">Schließplan ins Profil speichern</span>';
        }
    }
}

// Zeige Erfolgs-Overlay mit coolen Effekt
function showSuccessOverlay() {
    const overlay = document.getElementById('success-overlay');
    if (!overlay) {
        console.warn('⚠️ Success Overlay nicht gefunden');
        return;
    }
    
    // Entferne Confetti-Container falls vorhanden
    const confettiContainer = document.getElementById('confetti-container');
    if (confettiContainer) {
        confettiContainer.innerHTML = '';
    }
    
    // Erstelle Confetti
    createConfetti();
    
    // Zeige Overlay mit Animation
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    
    // Trigger Animationen durch Reflow
    void overlay.offsetWidth;
    
    // Verstecke Overlay nach 3 Sekunden
    setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
        // Entferne Confetti
        if (confettiContainer) {
            confettiContainer.innerHTML = '';
        }
    }, 3000);
}

// Erstelle Confetti-Effekt
function createConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) {
        console.warn('⚠️ Confetti Container nicht gefunden');
        return;
    }
    
    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];
    const confettiCount = 50;
    
    // Leere Container zuerst
    container.innerHTML = '';
    
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = Math.random() * 2 + 2;
        const size = Math.random() * 10 + 5;
        
        confetti.style.left = left + '%';
        confetti.style.top = '-10px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = delay + 's';
        confetti.style.animationDuration = duration + 's';
        confetti.style.width = size + 'px';
        confetti.style.height = size + 'px';
        confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
        confetti.style.position = 'absolute';
        confetti.style.zIndex = '101';
        
        container.appendChild(confetti);
        
        // Entferne nach Animation
        setTimeout(() => {
            if (confetti.parentNode) {
                confetti.remove();
            }
        }, (duration + delay) * 1000);
    }
}

// --- MEDIATHEK FUNKTIONEN ---

// Generiere HTML-String für Schließplan (wiederverwendbar)
function generateSchliessplanHTML() {
    // Aktualisiere planData mit aktuellen Werten aus dem DOM
    const rows = planData.rows.map(row => {
        const rowElement = document.querySelector(`tr[data-row-id="${row.id}"]`);
        if (rowElement) {
            const typSelect = rowElement.querySelector('select[onchange*="typ"]');
            if (typSelect) row.typ = typSelect.value;
            
            const systemSelect = rowElement.querySelector('select[onchange*="systemId"]');
            if (systemSelect) {
                const systemMatch = findCylinderSystemById(systemSelect.value);
                row.systemId = systemMatch ? systemMatch.id : systemSelect.value;
            }
            
            const techSelect = rowElement.querySelector('select[onchange*="techType"]');
            if (techSelect) row.techType = techSelect.value;
            
            const massInputs = rowElement.querySelectorAll('input[onchange*="mass"]');
            massInputs.forEach(input => {
                const onChangeStr = input.getAttribute('onchange') || '';
                if (onChangeStr.includes('massA')) row.massA = input.value || row.massA;
                if (onChangeStr.includes('massI')) row.massI = input.value || row.massI;
            });
            
            const anzahlInput = rowElement.querySelector('input[type="number"]');
            if (anzahlInput) row.anzahl = parseInt(anzahlInput.value) || row.anzahl;
            
            const tuerInput = rowElement.querySelector('input[placeholder*="Bezeichnung"]');
            if (tuerInput && tuerInput.value) row.tuer = tuerInput.value;
            
            const matrixCells = rowElement.querySelectorAll('.schliessmatrix-cell');
            if (matrixCells.length > 0) {
                row.matrix = Array.from(matrixCells).map(cell => cell.classList.contains('checked'));
            }
        }
        return row;
    });

    const getSystemName = (systemId) => {
        const system = findSchliessplanSystemOption(systemId);
        return system ? system.name : 'Unbekannt';
    };

    const getFunctionNames = (funktionen) => {
        return Object.keys(funktionen)
            .filter(key => funktionen[key])
            .map(key => ALL_FEATURES[key] ? ALL_FEATURES[key].name : key)
            .join(', ');
    };

    const isMixedSystem = userAnswers.technologie === 'Gemischte Anlage';

    let tableRows = '';
    rows.forEach(row => {
        const selectedSystem = findSchliessplanSystemOption(row.systemId);
        const systemName = selectedSystem ? selectedSystem.name : getSystemName(row.systemId);
        const functionNames = getFunctionNames(row.funktionen);
        const techType = row.techType || 'mechanisch';
        const bgColor = selectedSystem ? hexToRgba(selectedSystem.color, 0.16) : (techType === 'elektronisch' ? '#e0f2fe' : 'transparent');

        let matrixCells = '';
        planData.keys.forEach((key, keyIndex) => {
            const checked = row.matrix && row.matrix[keyIndex] ? '✓' : '';
            matrixCells += `<td style="border: 1px solid #ccc; text-align: center; padding: 8px;">${checked}</td>`;
        });

        const techCell = isMixedSystem ? 
            `<td style="border: 1px solid #ccc; padding: 8px; background-color: ${bgColor};">${techType === 'elektronisch' ? 'Elektronisch' : 'Mechanisch'}</td>` : 
            '';

        tableRows += `
            <tr style="background-color: ${bgColor};">
                <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold; text-align: center;">${row.pos}</td>
                <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold;">${row.tuer || ''}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${row.typ || ''}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${systemName}</td>
                ${techCell}
                <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${row.massA || ''}/${row.massI || ''}</td>
                <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${row.anzahl || 1}</td>
                <td style="border: 1px solid #ccc; padding: 8px;">${functionNames || '-'}</td>
                <td style="border: 1px solid #ccc; padding: 8px; background-color: #f5f5f5; font-weight: bold;">${row.tuer || ''}</td>
                ${matrixCells}
            </tr>
        `;
    });

    // Aktualisiere Schlüsselgruppen-Namen
    const keyInputs = document.querySelectorAll('#schluessel-header-dynamic input');
    if (keyInputs.length > 0) {
        keyInputs.forEach((input, index) => {
            if (planData.keys[index] && input.value) {
                planData.keys[index].name = input.value;
            }
        });
    }
    
    let keyHeaders = '';
    planData.keys.forEach(key => {
        keyHeaders += `<th style="border: 1px solid #ccc; padding: 8px; background-color: #203d5d; color: white; transform: rotate(-90deg); white-space: nowrap; min-width: 50px; height: 150px;">${key.name}</th>`;
    });

    // HTML-Dokument erstellen
    return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Schließplan Export</title>
    <style>
        body { font-family: 'Inter', Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 1400px; margin: 0 auto; }
        h1 { color: #203d5d; text-align: center; margin-bottom: 30px; font-size: 28px; }
        .info-box { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid #203d5d; }
        .info-box p { margin: 5px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
        th { background-color: #203d5d; color: white; padding: 10px 8px; text-align: center; border: 1px solid #ccc; font-weight: bold; }
        .header-main { background-color: #1a344f; font-size: 14px; padding: 12px; }
        td { border: 1px solid #ccc; padding: 8px; }
        @media print { body { background-color: white; margin: 0; } .container { box-shadow: none; padding: 10px; } }
    </style>
</head>
<body>
    <div class="container">
        <h1>Ihr persönlicher Schließplan</h1>
        <div class="info-box">
            <p><strong>Erstellt am:</strong> ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            ${userAnswers.objekttyp ? `<p><strong>Objekttyp:</strong> ${userAnswers.objekttyp}</p>` : ''}
            ${userAnswers.anlagentyp ? `<p><strong>Anlagentyp:</strong> ${userAnswers.anlagentyp}</p>` : ''}
            ${userAnswers.qualitaet ? `<p><strong>Qualität:</strong> ${userAnswers.qualitaet}</p>` : ''}
            ${userAnswers.technologie ? `<p><strong>Technologie:</strong> ${userAnswers.technologie}</p>` : ''}
        </div>
        ${isMixedSystem ? `<div class="legend"><strong>Legende:</strong> <span class="legend-item"><span class="legend-color"></span>Mechanisch</span> <span class="legend-item"><span class="legend-color elektronisch"></span>Elektronisch</span></div>` : ''}
        <table>
            <thead>
                <tr>
                    <th colspan="${isMixedSystem ? '8' : '7'}" class="header-main">Schließzylinder</th>
                    <td style="border: none; background-color: #ddd;"></td>
                    <th colspan="${planData.keys.length + 1}" class="header-main">Schlüsselmatrix</th>
                </tr>
                <tr>
                    <th>POS</th><th>Türbezeichnung</th><th>Zylindertyp</th><th>System</th>
                    ${isMixedSystem ? '<th>Technologie</th>' : ''}
                    <th>Maße A/I</th><th>Anzahl</th><th>Funktionen</th>
                    <td style="border: none; background-color: #ddd;"></td>
                    <th>Schlüsselgruppen</th>
                    ${keyHeaders}
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>
    </div>
</body>
</html>`;
}

// Speichere Schließplan in Mediathek
async function saveToMediathek(supabaseClient, schliessplanId, kundeId, schliessplanData) {
    try {
        // 1. HTML-Inhalt generieren
        console.log('📝 Generiere HTML-Inhalt für Schließplan...');
        const htmlContent = generateSchliessplanHTML();
        if (!htmlContent || htmlContent.trim().length === 0) {
            throw new Error('HTML-Inhalt konnte nicht generiert werden');
        }
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        console.log(`📦 HTML generiert: ${blob.size} Bytes`);
        
        // 2. Dateiname erstellen
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `schliessplan-${timestamp}-${Date.now()}.html`;
        const filePath = `${kundeId}/${schliessplanId}/${fileName}`;
        console.log(`📁 Dateipfad: ${filePath}`);
        
        // 3. Datei in Supabase Storage hochladen
        console.log('⬆️ Lade HTML-Datei in Supabase Storage hoch...');
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('schliessplaene')
            .upload(filePath, blob, {
                contentType: 'text/html;charset=utf-8',
                upsert: true
            });
        
        if (uploadError) {
            console.error('❌ Upload-Fehler:', uploadError);
            throw new Error(`Upload-Fehler: ${uploadError.message}`);
        }
        console.log('✅ HTML-Datei erfolgreich hochgeladen:', uploadData);
        
        // 4. Öffentliche URL generieren
        const { data: { publicUrl } } = supabaseClient.storage
            .from('schliessplaene')
            .getPublicUrl(filePath);
        console.log('🔗 Öffentliche URL:', publicUrl);
        
        // 5. Metadaten in Mediathek-Tabelle speichern
        console.log('💾 Speichere Metadaten in Mediathek-Tabelle...');
        const { data: mediathekEntry, error: dbError } = await supabaseClient
            .from('mediathek')
            .insert([{
                kunde_id: kundeId,
                schliessplan_id: schliessplanId,
                datei_name: fileName,
                datei_typ: 'html',
                datei_url: publicUrl,
                datei_groesse: blob.size,
                mime_type: 'text/html',
                beschreibung: `Schließplan Export - ${schliessplanData.name || 'Schließplan'} - ${new Date().toLocaleDateString('de-DE')}`,
                kategorie: 'exportiert',
                tags: [schliessplanData.objekttyp, schliessplanData.technologie].filter(Boolean)
            }])
            .select()
            .single();
        
        if (dbError) {
            console.error('❌ Datenbank-Fehler:', dbError);
            throw new Error(`Datenbank-Fehler: ${dbError.message}`);
        }
        console.log('✅ Metadaten gespeichert:', mediathekEntry);
        
        // 6. Schließplan mit Mediathek-ID verknüpfen
        const previousExportDateien = Array.isArray(schliessplanData.export_dateien)
            ? schliessplanData.export_dateien
            : [];
        const exportDateien = [
            ...previousExportDateien,
            {
                typ: 'html',
                url: publicUrl,
                datei_name: fileName,
                erstellt_am: new Date().toISOString()
            }
        ];
        
        await supabaseClient
            .from('schliessplaene')
            .update({ 
                mediathek_id: mediathekEntry.id,
                export_dateien: exportDateien
            })
            .eq('id', schliessplanId);
        
        console.log('✅ Schließplan erfolgreich in Mediathek gespeichert:', {
            mediathekId: mediathekEntry.id,
            fileUrl: publicUrl
        });
        
        return {
            success: true,
            mediathekId: mediathekEntry.id,
            fileUrl: publicUrl
        };
        
    } catch (error) {
        console.error('❌ Fehler beim Speichern in Mediathek:', error);
        throw error;
    }
}

// --- HTML EXPORT FUNKTION ---
function exportSchliessplanToHTML() {
    try {
        // Button während des Exports deaktivieren
        const exportBtn = document.getElementById('export-html-btn');
        const originalText = exportBtn.innerHTML;
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> HTML wird erstellt...';

        // Prüfe ob planData vorhanden ist
        if (!planData || !planData.rows || planData.rows.length === 0) {
            alert('Keine Daten zum Exportieren vorhanden. Bitte erstellen Sie zuerst einen Schließplan.');
            exportBtn.disabled = false;
            exportBtn.innerHTML = originalText;
            return;
        }

        // Verwende die wiederverwendbare Funktion
        const htmlContent = generateSchliessplanHTML();
        
        // Erstelle Blob und Download
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Schließplan_${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Button wieder aktivieren
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalText;

        // Erfolgsmeldung
        showSaveStatus('success', 'HTML erfolgreich erstellt und heruntergeladen! Öffnen Sie die Datei im Browser und drucken Sie sie als PDF (Strg+P).');

    } catch (error) {
        console.error('Fehler beim HTML-Export:', error);
        alert('Fehler beim Erstellen des HTML-Exports: ' + error.message);
        
        // Button wieder aktivieren
        const exportBtn = document.getElementById('export-html-btn');
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-file-code mr-2"></i> Als HTML exportieren';
        }
    }
}

// Die exportSchliessplanToHTML Funktion verwendet jetzt generateSchliessplanHTML() (siehe oben)

// --- AUTH SCREEN FUNKTIONEN ---
function showAuthScreen() {
    if (!AUTH_SELECTION_SCREEN_ENABLED) return;
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) {
        authScreen.classList.remove('hidden');
        authScreen.style.opacity = '0';
        authScreen.style.transition = 'opacity 0.5s ease-in';
        setTimeout(() => {
            authScreen.style.opacity = '1';
        }, 50);
    }
}

function hideAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) {
        authScreen.style.opacity = '0';
        authScreen.style.transition = 'opacity 0.5s ease-out';
        setTimeout(() => {
            authScreen.classList.add('hidden');
        }, 500);
    }
}

// Auth Screen Event Listeners
// --- REGISTRIERUNGS-MODAL FUNKTIONEN ---
function showRegisterModal() {
    const modal = document.getElementById('register-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 10);
    }
}

function hideRegisterModal() {
    const modal = document.getElementById('register-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.classList.add('hidden');
            // Formular zurücksetzen
            const form = document.getElementById('register-form');
            if (form) form.reset();
            const statusDiv = document.getElementById('register-status');
            if (statusDiv) {
                statusDiv.classList.add('hidden');
                statusDiv.textContent = '';
            }
        }, 300);
    }
}

function showRegisterStatus(type, message) {
    const statusDiv = document.getElementById('register-status');
    if (!statusDiv) return;
    
    statusDiv.classList.remove('hidden', 'bg-green-100', 'border-green-400', 'text-green-700', 'bg-red-100', 'border-red-400', 'text-red-700');
    
    if (type === 'success') {
        statusDiv.classList.add('bg-green-100', 'border', 'border-green-400', 'text-green-700');
    } else {
        statusDiv.classList.add('bg-red-100', 'border', 'border-red-400', 'text-red-700');
    }
    
    statusDiv.textContent = message;
}

function showLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.opacity = '1';
        }, 10);
    }
}

function hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.classList.add('hidden');
            // Formular zurücksetzen
            const form = document.getElementById('login-form');
            if (form) form.reset();
            const statusDiv = document.getElementById('login-status');
            if (statusDiv) {
                statusDiv.classList.add('hidden');
                statusDiv.textContent = '';
            }
        }, 300);
    }
}

function showLoginStatus(type, message) {
    const statusDiv = document.getElementById('login-status');
    if (!statusDiv) return;
    
    statusDiv.classList.remove('hidden', 'bg-green-100', 'border-green-400', 'text-green-700', 'bg-red-100', 'border-red-400', 'text-red-700');
    
    if (type === 'success') {
        statusDiv.classList.add('bg-green-100', 'border', 'border-green-400', 'text-green-700');
    } else {
        statusDiv.classList.add('bg-red-100', 'border', 'border-red-400', 'text-red-700');
    }
    
    statusDiv.textContent = message;
}

// Registrierungs-Funktion mit Supabase Auth
async function handleRegister(event) {
    event.preventDefault();
    
    const vorname = document.getElementById('register-vorname')?.value.trim();
    const nachname = document.getElementById('register-nachname')?.value.trim();
    const email = document.getElementById('register-email')?.value.trim();
    const password = document.getElementById('register-password')?.value;
    const passwordConfirm = document.getElementById('register-password-confirm')?.value;
    const telefon = document.getElementById('register-telefon')?.value.trim();
    const submitBtn = document.getElementById('register-submit-btn');
    
    // Validierung
    if (!vorname || !nachname || !email || !password) {
        showRegisterStatus('error', 'Bitte füllen Sie alle Pflichtfelder aus.');
        return;
    }
    
    if (!isValidEmail(email)) {
        showRegisterStatus('error', 'Bitte geben Sie eine gültige E-Mail-Adresse ein.');
        return;
    }
    
    if (password.length < 8) {
        showRegisterStatus('error', 'Das Passwort muss mindestens 8 Zeichen lang sein.');
        return;
    }
    
    if (password !== passwordConfirm) {
        showRegisterStatus('error', 'Die Passwörter stimmen nicht überein.');
        return;
    }
    
    // Prüfe Passwort-Stärke (optional, aber empfohlen)
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    
    if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
        showRegisterStatus('error', 'Das Passwort muss Groß- und Kleinbuchstaben sowie Zahlen enthalten.');
        return;
    }
    
    // Button deaktivieren
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrierung läuft...';
    }
    
    try {
        // Stelle sicher, dass Supabase geladen ist
        const supabaseClient = await ensureSupabaseReady();
        
        if (!supabaseClient) {
            throw new Error('Supabase Client nicht verfügbar. Bitte laden Sie die Seite neu.');
        }
        
        // 0. PRÜFE OB E-MAIL BEREITS EXISTIERT
        const { data: existingKunde, error: checkError } = await supabaseClient
            .from('kunden')
            .select('id, email, user_id')
            .eq('email', email.toLowerCase().trim())
            .single();
        
        if (existingKunde && existingKunde.user_id) {
            // E-Mail existiert bereits UND hat einen user_id → Benutzer soll sich einloggen
            hideRegisterModal();
            showLoginStatus('error', 'Diese E-Mail ist bereits registriert. Bitte loggen Sie sich ein.');
            setTimeout(() => {
                showLoginModal();
                // E-Mail in Login-Formular eintragen
                const loginEmailInput = document.getElementById('login-email');
                if (loginEmailInput) {
                    loginEmailInput.value = email;
                }
            }, 500);
            return;
        }
        
        // 1. Registrierung mit Supabase Auth (Passwort wird automatisch gehashed!)
        // Bestimme Redirect-URL für E-Mail-Bestätigung
        // Verwende Netlify-URL wenn auf Netlify, sonst aktuelle URL (für lokale Entwicklung)
        const isNetlify = window.location.hostname.includes('netlify.app');
        const baseUrl = isNetlify ? NETLIFY_URL : (window.location.origin + window.location.pathname);
        const confirmUrl = baseUrl.replace('index.html', '').replace(/\/$/, '') + '/confirm-email.html';
        
        console.log('📧 E-Mail-Bestätigungs-URL:', confirmUrl);
        
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                emailRedirectTo: confirmUrl,
                data: {
                    vorname: vorname,
                    nachname: nachname,
                    telefon: telefon || null
                }
            }
        });
        
        if (authError) {
            // Prüfe ob Fehler wegen bereits existierender E-Mail ist
            if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
                hideRegisterModal();
                showLoginStatus('error', 'Diese E-Mail ist bereits registriert. Bitte loggen Sie sich ein.');
                setTimeout(() => {
                    showLoginModal();
                    const loginEmailInput = document.getElementById('login-email');
                    if (loginEmailInput) {
                        loginEmailInput.value = email;
                    }
                }, 500);
                return;
            }
            throw new Error(`Registrierungsfehler: ${authError.message}`);
        }
        
        if (!authData.user) {
            throw new Error('Registrierung fehlgeschlagen: Keine Benutzerdaten erhalten');
        }
        
        console.log('✅ Benutzer erfolgreich registriert:', authData.user.id);
        
        // 2. Kunden-Eintrag in kunden Tabelle erstellen
        // Verwende IMMER die create_kunde_on_signup Funktion, da sie E-Mail-Duplikate behandelt
        const { data: kundeId, error: rpcError } = await supabaseClient.rpc('create_kunde_on_signup', {
            p_user_id: authData.user.id,
            p_email: email.toLowerCase().trim(),
            p_vorname: vorname,
            p_nachname: nachname,
            p_telefon: telefon || null
        });
        
        if (rpcError) {
            // Falls Funktion fehlschlägt, versuche direkten Insert als Fallback
            console.warn('⚠️ Funktion fehlgeschlagen, versuche direkten Insert:', rpcError);
            
            const { data: kundeData, error: kundeError } = await supabaseClient
                .from('kunden')
                .insert([{
                    user_id: authData.user.id,
                    email: email.toLowerCase().trim(),
                    vorname: vorname,
                    nachname: nachname,
                    telefon: telefon || null,
                    status: 'aktiv'
                }])
                .select()
                .single();
            
            if (kundeError) {
                // Wenn auch Insert fehlschlägt, könnte E-Mail bereits existieren
                if (kundeError.code === '23505' && kundeError.message.includes('email')) {
                    // Versuche, bestehenden Eintrag zu aktualisieren
                    const { data: existingKunde, error: updateError } = await supabaseClient
                        .from('kunden')
                        .update({
                            user_id: authData.user.id,
                            vorname: vorname,
                            nachname: nachname,
                            telefon: telefon || null,
                            aktualisiert_am: new Date().toISOString()
                        })
                        .eq('email', email.toLowerCase().trim())
                        .select()
                        .single();
                    
                    if (updateError) {
                        throw new Error(`Fehler beim Aktualisieren des Kunden-Eintrags: ${updateError.message}`);
                    }
                    
                    console.log('✅ Bestehender Kunden-Eintrag aktualisiert:', existingKunde);
                } else {
                    throw new Error(`Fehler beim Erstellen des Kunden-Eintrags: ${kundeError.message}`);
                }
            } else {
                console.log('✅ Kunden-Eintrag erstellt (via direkten Insert):', kundeData);
            }
        } else {
            console.log('✅ Kunden-Eintrag erstellt/aktualisiert (via Funktion):', kundeId);
        }
        
        // 3. Erfolgsmeldung
        showRegisterStatus('success', 'Registrierung erfolgreich! Sie werden jetzt eingeloggt...');
        
        // Weiterleitung zu Dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('❌ Fehler bei der Registrierung:', error);
        showRegisterStatus('error', `Fehler: ${error.message}`);
    } finally {
        // Button wieder aktivieren
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-user-plus"></i><span>Registrieren</span>';
        }
    }
}

function initializeAuthScreen() {
    const registerBtn = document.getElementById('auth-register-btn');
    const loginBtn = document.getElementById('auth-login-btn');
    const guestBtn = document.getElementById('auth-guest-btn');
    const registerCloseBtn = document.getElementById('register-close-btn');
    const registerCancelBtn = document.getElementById('register-cancel-btn');
    const registerForm = document.getElementById('register-form');
    
    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            console.log('📝 Registrieren geklickt');
            hideAuthScreen();
            setTimeout(() => {
                showRegisterModal();
            }, 300);
        });
    }
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            console.log('🔐 Einloggen geklickt');
            hideAuthScreen();
            setTimeout(() => {
                showLoginModal();
            }, 300);
        });
    }
    
    if (guestBtn) {
        guestBtn.addEventListener('click', () => {
            console.log('👤 Als Gast fortfahren geklickt');
            // Weiterleitung zu /start
            window.location.href = 'start.html';
        });
    }
    
    // Registrierungs-Modal Event Listeners
    if (registerCloseBtn) {
        registerCloseBtn.addEventListener('click', () => {
            hideRegisterModal();
            showAuthScreen();
        });
    }
    
    if (registerCancelBtn) {
        registerCancelBtn.addEventListener('click', () => {
            hideRegisterModal();
            showAuthScreen();
        });
    }
    
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Login Modal Event Listeners
    const loginCloseBtn = document.getElementById('login-close-btn');
    const loginCancelBtn = document.getElementById('login-cancel-btn');
    const loginForm = document.getElementById('login-form');

    if (loginCloseBtn) {
        loginCloseBtn.addEventListener('click', () => {
            hideLoginModal();
            showAuthScreen();
        });
    }

    if (loginCancelBtn) {
        loginCancelBtn.addEventListener('click', () => {
            hideLoginModal();
            showAuthScreen();
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const headerLoginModalBtn = document.getElementById('header-open-login-modal-btn');
    const headerRegisterModalBtn = document.getElementById('header-open-register-modal-btn');
    const headerAuthMenuBtn = document.getElementById('header-auth-menu-btn');
    const headerAuthDropdown = document.getElementById('header-auth-dropdown');
    const customerRegisterBtn = document.getElementById('customer-open-register-btn');

    const closeHeaderAuthDropdown = () => {
        if (headerAuthDropdown) headerAuthDropdown.classList.add('hidden');
        if (headerAuthMenuBtn) headerAuthMenuBtn.setAttribute('aria-expanded', 'false');
    };

    if (headerAuthMenuBtn && headerAuthDropdown) {
        headerAuthMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            headerAuthDropdown.classList.toggle('hidden');
            headerAuthMenuBtn.setAttribute(
                'aria-expanded',
                String(!headerAuthDropdown.classList.contains('hidden'))
            );
        });
        document.addEventListener('click', (e) => {
            if (!headerAuthMenuBtn.contains(e.target) && !headerAuthDropdown.contains(e.target)) {
                closeHeaderAuthDropdown();
            }
        });
    }

    if (headerLoginModalBtn) {
        headerLoginModalBtn.addEventListener('click', () => {
            closeHeaderAuthDropdown();
            showLoginModal();
        });
    }
    if (headerRegisterModalBtn) {
        headerRegisterModalBtn.addEventListener('click', () => {
            closeHeaderAuthDropdown();
            showRegisterModal();
        });
    }
    if (customerRegisterBtn) {
        customerRegisterBtn.addEventListener('click', () => showRegisterModal());
    }
}

// Login-Funktion
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const submitBtn = document.getElementById('login-submit-btn');
    
    // Validierung
    if (!email || !password) {
        showLoginStatus('error', 'Bitte geben Sie E-Mail und Passwort ein.');
        return;
    }
    
    if (!isValidEmail(email)) {
        showLoginStatus('error', 'Bitte geben Sie eine gültige E-Mail-Adresse ein.');
        return;
    }
    
    // Button deaktivieren
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Einloggen...';
    }
    
    try {
        // Stelle sicher, dass Supabase geladen ist
        const supabaseClient = await ensureSupabaseReady();
        
        if (!supabaseClient) {
            throw new Error('Supabase Client nicht verfügbar. Bitte laden Sie die Seite neu.');
        }
        
        // Login mit Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (authError) {
            if (authError.message.includes('Invalid login credentials') || authError.message.includes('Invalid password')) {
                throw new Error('E-Mail oder Passwort ist falsch. Bitte versuchen Sie es erneut.');
            }
            throw new Error(`Login-Fehler: ${authError.message}`);
        }
        
        if (!authData.user) {
            throw new Error('Login fehlgeschlagen: Keine Benutzerdaten erhalten');
        }
        
        console.log('✅ Benutzer erfolgreich eingeloggt:', authData.user.id);
        
        // Synchronisiere E-Mail-Bestätigung (falls bereits bestätigt)
        try {
            const { data: syncData, error: syncError } = await supabaseClient.rpc('check_and_sync_email_confirmation', {
                p_user_id: authData.user.id
            });
            if (!syncError && syncData?.synced) {
                console.log('✅ E-Mail-Bestätigung synchronisiert:', syncData);
            }
        } catch (syncErr) {
            console.warn('⚠️ Synchronisation der E-Mail-Bestätigung fehlgeschlagen (nicht kritisch):', syncErr);
        }
        
        // Erfolgsmeldung
        showLoginStatus('success', 'Erfolgreich eingeloggt!');
        
        // Weiterleitung zu Dashboard
        window.location.href = 'dashboard.html';
        
    } catch (error) {
        console.error('❌ Fehler beim Login:', error);
        showLoginStatus('error', `Fehler: ${error.message}`);
    } finally {
        // Button wieder aktivieren
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i><span>Einloggen</span>';
        }
    }
}

// --- EVENT LISTENERS ---
// Prüfe ob Elemente existieren bevor Event Listener hinzugefügt werden
if (elements.nextBtn) {
    elements.nextBtn.addEventListener('click', handleNext);
}
if (elements.prevBtn) {
    elements.prevBtn.addEventListener('click', handlePrev);
}
if (elements.addRowBtn) {
    elements.addRowBtn.addEventListener('click', addSchliessplanRow);
}
if (elements.addKeyBtn) {
    elements.addKeyBtn.addEventListener('click', addKeyColumn);
}
if (elements.backToQuestionsBtn) {
    elements.backToQuestionsBtn.addEventListener('click', initializeQuestionnaire);
}
const openCustomerFormBtn = document.getElementById('open-customer-form-btn');
if (openCustomerFormBtn) {
    openCustomerFormBtn.addEventListener('click', async () => {
        const customerFormModal = document.getElementById('customer-form-modal');
        if (!customerFormModal) return;
        customerFormModal.classList.remove('hidden');
        await checkAndShowLoginOption();
        document.getElementById('customer-vorname')?.focus();
    });
}

// PDF-Export Button Event Listener
// Wird nach DOM-Load in initializeQuestionnaire registriert 
if (elements.functionModal) {
    elements.functionModal.addEventListener('click', (e) => { if (e.target === elements.functionModal) closeFunctionModal(); });
}
if (elements.modalCancelBtn) {
    elements.modalCancelBtn.addEventListener('click', closeFunctionModal);
}
if (elements.modalSaveBtn) {
    elements.modalSaveBtn.addEventListener('click', saveFunctions);
}

// CRM Form Submit
const customerForm = document.getElementById('customer-form');
if (customerForm) {
    customerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await savePlanToCRM();
    });
}

// Prüfe Auth-Status wenn Customer Form Modal geöffnet wird
function checkAuthOnCustomerFormOpen() {
    const customerFormModal = document.getElementById('customer-form-modal');
    if (customerFormModal) {
        // Prüfe ob Modal sichtbar ist
        const observer = new MutationObserver(() => {
            if (!customerFormModal.classList.contains('hidden')) {
                checkAndShowLoginOption();
            }
        });
        observer.observe(customerFormModal, { attributes: true, attributeFilter: ['class'] });
    }
}

// Initialisiere Observer beim Laden
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAuthOnCustomerFormOpen);
} else {
    checkAuthOnCustomerFormOpen();
}

window.addEventListener('beforeunload', () => {
    saveSessionToStorage();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        saveSessionToStorage();
        clearTimeout(autoSaveTimer);
        if (activeSchliessplanId || activeKundeId) {
            flushAutoSave({ force: false }).catch(err => console.warn('Auto-Save beim Verlassen fehlgeschlagen:', err));
        }
    }
});

// HTML-Export Button Event Listener
document.addEventListener('DOMContentLoaded', () => {
    const exportHtmlBtn = document.getElementById('export-html-btn');
    if (exportHtmlBtn) {
        exportHtmlBtn.addEventListener('click', exportSchliessplanToHTML);
    }
    
    // Save to Profile Button Event Listener
    const saveToProfileBtn = document.getElementById('save-to-profile-btn');
    if (saveToProfileBtn) {
        saveToProfileBtn.addEventListener('click', savePlanToProfile);
    }
});

// Auch nach DOM-Load registrieren, falls DOM bereits geladen ist
const exportHtmlBtn = document.getElementById('export-html-btn');
if (exportHtmlBtn) {
    exportHtmlBtn.addEventListener('click', exportSchliessplanToHTML);
}

const saveToProfileBtn = document.getElementById('save-to-profile-btn');
if (saveToProfileBtn) {
    saveToProfileBtn.addEventListener('click', savePlanToProfile);
}

// --- DEBUG SYSTEM ---
let debugMode = false;
let debugData = {
    apiResponses: {},
    userAnswers: {},
    cylinderMatchData: {},
    rawData: {}
};

// Debug-Panel HTML erstellen
function createDebugPanel() {
    console.log('🔧 Erstelle Debug-Panel...');
    const debugPanelContainer = document.createElement('div');
    debugPanelContainer.id = 'debug-panel-container';
    debugPanelContainer.innerHTML = `
        <div id="debug-panel" class="fixed bottom-4 right-4 bg-gray-900 text-white rounded-lg shadow-2xl p-6 max-h-[80vh] overflow-y-auto min-w-[500px]" style="display: none; z-index: 9999;">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold">🐛 Debug Panel</h3>
                <div>
                    <button id="debug-copy-btn" class="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded text-sm mr-2">Copy All</button>
                    <button id="debug-close-btn" class="bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm">✕</button>
                </div>
            </div>
            <div class="space-y-4">
                <div>
                    <h4 class="font-bold text-green-400 mb-2">User Answers:</h4>
                    <pre id="debug-user-answers" class="bg-gray-800 p-2 rounded text-xs overflow-auto max-h-32"></pre>
                </div>
                <div>
                    <h4 class="font-bold text-blue-400 mb-2">Cylinders Data:</h4>
                    <pre id="debug-cylinders" class="bg-gray-800 p-2 rounded text-xs overflow-auto max-h-48"></pre>
                </div>
                <div>
                    <h4 class="font-bold text-yellow-400 mb-2">Match Calculation:</h4>
                    <pre id="debug-match-calculation" class="bg-gray-800 p-2 rounded text-xs overflow-auto max-h-64"></pre>
                </div>
                <div>
                    <h4 class="font-bold text-purple-400 mb-2">API Responses:</h4>
                    <pre id="debug-api-responses" class="bg-gray-800 p-2 rounded text-xs overflow-auto max-h-48"></pre>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(debugPanelContainer);
    
    const debugPanel = document.getElementById('debug-panel');
    console.log('🔧 Debug-Panel-Element gefunden:', !!debugPanel);
    
    // Event Listeners
    document.getElementById('debug-close-btn').addEventListener('click', () => {
        debugPanel.style.display = 'none';
    });
    
    document.getElementById('debug-copy-btn').addEventListener('click', () => {
        const allData = {
            userAnswers: debugData.userAnswers,
            cylinderMatchData: debugData.cylinderMatchData,
            apiResponses: debugData.apiResponses,
            timestamp: new Date().toISOString()
        };
        navigator.clipboard.writeText(JSON.stringify(allData, null, 2));
        alert('Debug data copied to clipboard!');
    });
    console.log('✅ Debug-Panel erstellt');
}

// Debug-Toggle Button erstellen
function createDebugToggle() {
    const toggle = document.createElement('button');
    toggle.id = 'debug-toggle-btn';
    toggle.className = 'fixed top-4 left-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50';
    toggle.innerHTML = '🐛 Debug';
    toggle.onclick = () => {
        const panel = document.getElementById('debug-panel');
        if (panel) {
            const currentDisplay = panel.style.display;
            panel.style.display = currentDisplay === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') {
                updateDebugPanel();
            }
        } else {
            console.error('Debug panel not found!');
        }
    };
    document.body.appendChild(toggle);
    console.log('✅ Debug Toggle Button erstellt');
}

// Debug-Panel aktualisieren
function updateDebugPanel() {
    console.log('🔄 Aktualisiere Debug-Panel...');
    try {
        const userAnswersEl = document.getElementById('debug-user-answers');
        const apiResponsesEl = document.getElementById('debug-api-responses');
        const cylindersEl = document.getElementById('debug-cylinders');
        const matchCalcEl = document.getElementById('debug-match-calculation');
        
        if (userAnswersEl) {
            userAnswersEl.textContent = JSON.stringify(debugData.userAnswers, null, 2);
        }
        
        if (apiResponsesEl) {
            apiResponsesEl.textContent = JSON.stringify(debugData.apiResponses, null, 2);
        }
        
        // Zylinder-Daten (gekürzt)
        const cylindersSummary = allCylinderSystems.map(cyl => ({
            id: cyl.id,
            name: cyl.name,
            matchPercentage: cyl.matchPercentage,
            isActive: cyl.isActive,
            suitableObjectTypes: cyl.suitableObjectTypes?.length || 0,
            suitableAnlagentyp: cyl.suitableAnlagentyp?.length || 0,
            suitableQualitaet: cyl.suitableQualitaet?.length || 0,
            suitableTechnologie: cyl.suitableTechnologie?.length || 0,
            suitableFeatures: cyl.suitableFeatures?.length || 0
        }));
        
        if (cylindersEl) {
            cylindersEl.textContent = JSON.stringify(cylindersSummary, null, 2);
        }
        
        // Match-Berechnung
        if (matchCalcEl) {
            matchCalcEl.textContent = JSON.stringify(debugData.cylinderMatchData, null, 2);
        }
        
        console.log('✅ Debug-Panel aktualisiert');
    } catch (error) {
        console.error('❌ Fehler beim Aktualisieren des Debug-Panels:', error);
    }
}

// Erweiterte Debug-Logik für Match-Berechnung
function debugMatchCalculation(userAnswers, cylinder) {
    const debugInfo = {
        cylinderName: cylinder.name,
        cylinderId: cylinder.id,
        checks: []
    };
    
    let matchCount = 0;
    let totalChecks = 0;
    
    // Prüfe Objekttyp
    if (userAnswers.objekttyp) {
        totalChecks++;
        const hasMatchingObjectType = cylinder.suitableObjectTypes.some(option => {
            const isMatch = option.name === userAnswers.objekttyp || option.key === userAnswers.objekttyp;
            debugInfo.checks.push({
                check: 'objekttyp',
                userValue: userAnswers.objekttyp,
                cylinderValue: cylinder.suitableObjectTypes.map(o => o.name || o.key),
                isMatch,
                matchDetails: cylinder.suitableObjectTypes.map(o => ({
                    name: o.name,
                    key: o.key,
                    matches: o.name === userAnswers.objekttyp || o.key === userAnswers.objekttyp
                }))
            });
            return isMatch;
        });
        if (hasMatchingObjectType) matchCount++;
    }
    
    // Prüfe Anlagentyp
    if (userAnswers.anlagentyp) {
        totalChecks++;
        const hasMatchingAnlagentyp = cylinder.suitableAnlagentyp.some(option => {
            const isMatch = option.name === userAnswers.anlagentyp || option.key === userAnswers.anlagentyp;
            debugInfo.checks.push({
                check: 'anlagentyp',
                userValue: userAnswers.anlagentyp,
                cylinderValue: cylinder.suitableAnlagentyp.map(o => o.name || o.key),
                isMatch,
                matchDetails: cylinder.suitableAnlagentyp.map(o => ({
                    name: o.name,
                    key: o.key,
                    matches: o.name === userAnswers.anlagentyp || o.key === userAnswers.anlagentyp
                }))
            });
            return isMatch;
        });
        if (hasMatchingAnlagentyp) matchCount++;
    }
    
    // Prüfe Qualität
    if (userAnswers.qualitaet) {
        totalChecks++;
        const hasMatchingQualitaet = cylinder.suitableQualitaet.some(option => {
            const isMatch = option.name === userAnswers.qualitaet || option.key === userAnswers.qualitaet;
            debugInfo.checks.push({
                check: 'qualitaet',
                userValue: userAnswers.qualitaet,
                cylinderValue: cylinder.suitableQualitaet.map(o => o.name || o.key),
                isMatch,
                matchDetails: cylinder.suitableQualitaet.map(o => ({
                    name: o.name,
                    key: o.key,
                    matches: o.name === userAnswers.qualitaet || o.key === userAnswers.qualitaet
                }))
            });
            return isMatch;
        });
        if (hasMatchingQualitaet) matchCount++;
    }
    
    // Prüfe Technologie
    if (userAnswers.technologie) {
        totalChecks++;
        const hasMatchingTechnologie = cylinder.suitableTechnologie.some(option => {
            const isMatch = option.name === userAnswers.technologie || option.key === userAnswers.technologie;
            debugInfo.checks.push({
                check: 'technologie',
                userValue: userAnswers.technologie,
                cylinderValue: cylinder.suitableTechnologie.map(o => o.name || o.key),
                isMatch,
                matchDetails: cylinder.suitableTechnologie.map(o => ({
                    name: o.name,
                    key: o.key,
                    matches: o.name === userAnswers.technologie || o.key === userAnswers.technologie
                }))
            });
            return isMatch;
        });
        if (hasMatchingTechnologie) matchCount++;
    }
    
        // Prüfe Türen
        if (userAnswers.tueren && userAnswers.tueren.length > 0) {
            const matchingTueren = [];
            // WENN Zylinder hat keine suitableTueren definiert, zähle es als Match (flexibel)
            const hasNoTuerenRestriction = !cylinder.suitableTueren || cylinder.suitableTueren.length === 0;
            
            userAnswers.tueren.forEach(selectedTuer => {
                totalChecks++;
                let matches = false;
                
                if (hasNoTuerenRestriction) {
                    // Keine Einschränkung = Match
                    matches = true;
                    matchingTueren.push(selectedTuer);
                    matchCount++;
                } else {
                    // Prüfe gegen die Einschränkungen
                    matches = cylinder.suitableTueren?.some(option => 
                        option.name === selectedTuer || option.key === selectedTuer
                    );
                    if (matches) {
                        matchingTueren.push(selectedTuer);
                        matchCount++;
                    }
                }
            });
            debugInfo.checks.push({
                check: 'tueren',
                userValue: userAnswers.tueren,
                cylinderValue: cylinder.suitableTueren?.map(o => o.name || o.key) || [],
                hasNoRestriction: hasNoTuerenRestriction,
                matchCount: matchingTueren.length,
                totalTueren: userAnswers.tueren.length,
                matchingTueren
            });
        }
    
    // Prüfe Funktionen
    if (userAnswers.funktionen && userAnswers.funktionen.length > 0) {
        const matchingFeatures = [];
        // WENN Zylinder hat keine suitableFeatures definiert, zähle es als Match (flexibel)
        const hasNoFeaturesRestriction = !cylinder.suitableFeatures || cylinder.suitableFeatures.length === 0;
        
        userAnswers.funktionen.forEach(selectedFeature => {
            totalChecks++;
            let matches = false;
            
            if (hasNoFeaturesRestriction) {
                // Keine Einschränkung = Match
                matches = true;
                matchingFeatures.push(selectedFeature);
                matchCount++;
            } else {
                // Prüfe gegen die Einschränkungen
                matches = cylinder.suitableFeatures.some(option => 
                    option.name === selectedFeature || option.key === selectedFeature
                );
                if (matches) {
                    matchingFeatures.push(selectedFeature);
                    matchCount++;
                }
            }
        });
        debugInfo.checks.push({
            check: 'funktionen',
            userValue: userAnswers.funktionen,
            cylinderValue: cylinder.suitableFeatures?.map(o => o.name || o.key || o.optionText || o.text) || [],
            hasNoRestriction: hasNoFeaturesRestriction,
            matchCount: matchingFeatures.length,
            totalFeatures: userAnswers.funktionen.length,
            matchingFeatures
        });
    }
    
    debugInfo.summary = {
        matchCount,
        totalChecks,
        matchPercentage: totalChecks > 0 ? Math.round((matchCount / totalChecks) * 100) : 0
    };
    
    return debugInfo;
}

// --- INITIALIZATION ---
let applicationStartupStarted = false;

function initializeIntroFilm() {
    const loadingScreen = document.getElementById('loading-screen');
    const skipButton = document.getElementById('intro-skip-btn');

    if (!loadingScreen || !skipButton || skipButton.dataset.bound === 'true') {
        return;
    }

    skipButton.dataset.bound = 'true';
    skipButton.dataset.ready = 'false';
    skipButton.addEventListener('click', () => {
        if (skipButton.dataset.ready === 'true') {
            loadingStatus.startDoorUnlockSequence();
            return;
        }

        loadingScreen.classList.add('intro-compact');
        skipButton.textContent = 'Film reduziert';
        skipButton.setAttribute('aria-pressed', 'true');
    });
}

// Warte bis DOM geladen ist
async function startApplication() {
    if (applicationStartupStarted) {
        console.debug('Schliessplan startup skipped because it is already running');
        return;
    }
    applicationStartupStarted = true;

    // Loading Screen initialisieren
    loadingStatus.init();
    initializeIntroFilm();
    
    // Supabase laden (mit Status-Update) - Warte kurz, damit Supabase Zeit hat zu starten
    loadingStatus.updateStatus('supabase', 'loading');
    
    // Warte kurz, damit Supabase-Laden in index.html starten kann
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
        initializeSupabase();
        // Warte bis zu 10 Sekunden auf Supabase
        await Promise.race([
            waitForSupabase(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        loadingStatus.updateStatus('supabase', 'success');
    } catch (error) {
        console.warn('⚠️ Supabase konnte nicht geladen werden, aber die Anwendung läuft weiter:', error.message);
        loadingStatus.updateStatus('supabase', 'error', error.message || 'Timeout oder Verbindungsfehler');
        // Setze Supabase auf null, damit die App weiterlaufen kann
        schliessplanSb = null;
        supabaseInitialized = false;
    }
    
    // Fragebogen initialisieren (lädt alle anderen Daten) - auch wenn Supabase fehlgeschlagen ist
    try {
        await initializeQuestionnaire();
    } catch (error) {
        console.error('❌ Fehler beim Initialisieren des Fragebogens:', error);
        // Zeige Fehlermeldung im Loading Screen
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.innerHTML += `
                <div class="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                    <p class="font-bold">Fehler beim Laden:</p>
                    <p>${error.message}</p>
                    <button onclick="location.reload()" class="mt-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded">
                        Seite neu laden
                    </button>
                </div>
            `;
        }
    }
}

// ============================================
// USER MENU FUNKTIONEN
// ============================================

// Zeige User-Menü wenn eingeloggt
async function showUserMenu(user) {
    const userMenuContainer = document.getElementById('user-menu-container');
    if (!userMenuContainer) return;

    const headerAuth = document.getElementById('header-auth-actions');
    if (headerAuth) headerAuth.classList.add('hidden');

    userMenuContainer.classList.remove('hidden');
    
    // Lade Benutzerdaten
    try {
        const supabaseClient = await ensureSupabaseReady();
        if (supabaseClient && user) {
            // Hole Kunden-Daten
            const { data: kundeData, error: kundeError } = await supabaseClient
                .from('kunden')
                .select('vorname, nachname, email')
                .eq('user_id', user.id)
                .single();
            
            if (!kundeError && kundeData) {
                const nameElement = document.getElementById('user-menu-name');
                const emailElement = document.getElementById('user-menu-email');
                
                if (nameElement) {
                    nameElement.textContent = `${kundeData.vorname || ''} ${kundeData.nachname || ''}`.trim() || 'Benutzer';
                }
                if (emailElement) {
                    emailElement.textContent = kundeData.email || user.email || '';
                }
            } else {
                // Fallback auf Auth-Daten
                const nameElement = document.getElementById('user-menu-name');
                const emailElement = document.getElementById('user-menu-email');
                
                if (nameElement) {
                    const vorname = user.user_metadata?.vorname || '';
                    const nachname = user.user_metadata?.nachname || '';
                    nameElement.textContent = `${vorname} ${nachname}`.trim() || 'Benutzer';
                }
                if (emailElement) {
                    emailElement.textContent = user.email || '';
                }
            }
        }
    } catch (error) {
        console.warn('⚠️ Fehler beim Laden der Benutzerdaten:', error);
    }
}

// Verstecke User-Menü
function hideUserMenu() {
    const userMenuContainer = document.getElementById('user-menu-container');
    if (userMenuContainer) {
        userMenuContainer.classList.add('hidden');
    }
    const headerAuth = document.getElementById('header-auth-actions');
    if (headerAuth) headerAuth.classList.remove('hidden');
}

// Stelle Session wieder her
function getSerializablePlanData() {
    return {
        ...(planData || { rows: [], keys: [] }),
        currentQuestionIndex,
        savedAt: new Date().toISOString()
    };
}

function getCurrentPlanSnapshot() {
    return {
        userAnswers: { ...(userAnswers || {}) },
        planData: getSerializablePlanData(),
        currentQuestionIndex,
        schliessplanId: activeSchliessplanId,
        kundeId: activeKundeId,
        timestamp: new Date().toISOString()
    };
}

function normalizeRestoredPlanData(rawPlanData) {
    const restoredPlanData = rawPlanData && typeof rawPlanData === 'object'
        ? { ...rawPlanData }
        : { rows: [], keys: [] };

    restoredPlanData.rows = Array.isArray(restoredPlanData.rows) ? restoredPlanData.rows : [];
    restoredPlanData.keys = Array.isArray(restoredPlanData.keys) ? restoredPlanData.keys : [];
    return restoredPlanData;
}

function restoreSession(sessionData, options = {}) {
    if (!sessionData || typeof sessionData !== 'object') {
        return false;
    }

    userAnswers = { ...(sessionData.userAnswers || sessionData.user_answers || {}) };
    planData = normalizeRestoredPlanData(sessionData.planData || sessionData.plan_data);

    const restoredQuestionIndex =
        sessionData.currentQuestionIndex ??
        sessionData.current_question_index ??
        planData.currentQuestionIndex ??
        planData._meta?.currentQuestionIndex ??
        0;
    currentQuestionIndex = Number.isFinite(Number(restoredQuestionIndex)) ? Number(restoredQuestionIndex) : 0;

    activeSchliessplanId = sessionData.schliessplanId || sessionData.id || activeSchliessplanId || null;
    activeKundeId = sessionData.kundeId || sessionData.kunde_id || activeKundeId || null;
    lastRemoteSaveSignature = getCurrentPlanSignature();

    console.log('✅ Session wiederhergestellt', {
        activeSchliessplanId,
        activeKundeId,
        rows: planData.rows.length,
        keys: planData.keys.length,
        currentQuestionIndex
    });

    if (options.render === false) {
        saveSessionToStorage();
        return true;
    }

    elements.questionnaireContainer.classList.toggle('hidden', planData.rows.length > 0);
    elements.schliessplanContainer.classList.toggle('hidden', planData.rows.length === 0);

    if (planData.rows.length > 0) {
        showSchliessplan().catch(err => console.error('❌ Wiederhergestellter Schließplan konnte nicht angezeigt werden:', err));
    } else if (questionsData && questionsData.length > 0) {
        renderCurrentQuestion();
    }

    saveSessionToStorage();
    return true;
}

// Speichere Session in localStorage
function saveSessionToStorage() {
    try {
        localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(getCurrentPlanSnapshot()));
    } catch (error) {
        console.warn('⚠️ Fehler beim Speichern der Session:', error);
    }
}

async function loadSchliessplanSessionById(planId) {
    const supabaseClient = await ensureSupabaseReady();
    if (!supabaseClient || !planId) return null;

    const { data, error } = await supabaseClient
        .from('schliessplaene')
        .select('id, kunde_id, user_answers, plan_data, status')
        .eq('id', planId)
        .single();

    if (error) {
        console.warn('⚠️ Gespeicherter Schließplan konnte nicht geladen werden:', error);
        return null;
    }

    return {
        id: data.id,
        schliessplanId: data.id,
        kundeId: data.kunde_id,
        userAnswers: data.user_answers || {},
        planData: data.plan_data || { rows: [], keys: [] },
        currentQuestionIndex: data.plan_data?.currentQuestionIndex || 0
    };
}

async function consumeStartupSessionIntent() {
    if (sessionStorage.getItem(START_NEW_CONFIG_KEY) === 'true') {
        sessionStorage.removeItem(START_NEW_CONFIG_KEY);
        sessionStorage.removeItem(RESUME_SESSION_KEY);
        sessionStorage.removeItem(RESUME_PLAN_ID_KEY);
        sessionStorage.removeItem('continueSession');
        sessionStorage.removeItem('lastSessionData');
        sessionStorage.removeItem('viewPlanId');
        activeSchliessplanId = null;
        activeKundeId = null;
        return false;
    }

    const resumeRaw = sessionStorage.getItem(RESUME_SESSION_KEY);
    if (resumeRaw) {
        sessionStorage.removeItem(RESUME_SESSION_KEY);
        try {
            return restoreSession(JSON.parse(resumeRaw));
        } catch (error) {
            console.warn('⚠️ Resume-Daten konnten nicht gelesen werden:', error);
        }
    }

    const resumePlanId = sessionStorage.getItem(RESUME_PLAN_ID_KEY) || sessionStorage.getItem('viewPlanId');
    if (resumePlanId) {
        sessionStorage.removeItem(RESUME_PLAN_ID_KEY);
        sessionStorage.removeItem('viewPlanId');
        const sessionData = await loadSchliessplanSessionById(resumePlanId);
        if (sessionData) return restoreSession(sessionData);
    }

    if (sessionStorage.getItem('continueSession') === 'true') {
        sessionStorage.removeItem('continueSession');
        const raw = sessionStorage.getItem('lastSessionData') || localStorage.getItem(LOCAL_SESSION_KEY);
        sessionStorage.removeItem('lastSessionData');
        if (raw) {
            try {
                return restoreSession(JSON.parse(raw));
            } catch (error) {
                console.warn('⚠️ Lokale Session konnte nicht gelesen werden:', error);
            }
        }
    }

    return false;
}

// Zeige Profil-Modal
async function showProfileModal() {
    const profileModal = document.getElementById('profile-modal');
    if (!profileModal) return;
    
    try {
        const supabaseClient = await ensureSupabaseReady();
        if (!supabaseClient) {
            console.error('Supabase Client nicht verfügbar');
            return;
        }
        
        // Hole aktuelle Session
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        
        if (userError || !user) {
            console.error('Fehler beim Laden des Benutzers:', userError);
            return;
        }
        
        // Hole Kunden-Daten
        const { data: kundeData, error: kundeError } = await supabaseClient
            .from('kunden')
            .select('vorname, nachname, email, email_bestaetigt, email_bestaetigt_am')
            .eq('user_id', user.id)
            .single();
        
        // Fülle Profil-Daten
        const vorname = kundeData?.vorname || user.user_metadata?.vorname || '-';
        const nachname = kundeData?.nachname || user.user_metadata?.nachname || '-';
        const email = kundeData?.email || user.email || '-';
        const emailBestaetigt = kundeData?.email_bestaetigt || user.email_confirmed_at !== null;
        
        document.getElementById('profile-vorname').textContent = vorname;
        document.getElementById('profile-nachname').textContent = nachname;
        document.getElementById('profile-email').textContent = email;
        
        const emailStatusElement = document.getElementById('profile-email-status');
        if (emailStatusElement) {
            if (emailBestaetigt) {
                emailStatusElement.innerHTML = '<i class="fas fa-check-circle text-green-500 mr-2"></i>Bestätigt';
            } else {
                emailStatusElement.innerHTML = '<i class="fas fa-times-circle text-red-500 mr-2"></i>Nicht bestätigt';
            }
        }
        
        profileModal.classList.remove('hidden');
    } catch (error) {
        console.error('Fehler beim Öffnen des Profils:', error);
    }
}

// Verstecke Profil-Modal
function hideProfileModal() {
    const profileModal = document.getElementById('profile-modal');
    if (profileModal) {
        profileModal.classList.add('hidden');
    }
}

// Logout-Funktion
async function handleLogout() {
    try {
        const supabaseClient = await ensureSupabaseReady();
        if (supabaseClient) {
            const { error } = await supabaseClient.auth.signOut();
            if (error) {
                console.error('Fehler beim Abmelden:', error);
                alert('Fehler beim Abmelden. Bitte versuchen Sie es erneut.');
            } else {
                console.log('✅ Erfolgreich abgemeldet');
                hideUserMenu();
                hideProfileModal();
                
                // Navigiere zur Login-Seite
                window.location.href = 'login.html';
            }
        }
    } catch (error) {
        console.error('Fehler beim Abmelden:', error);
    }
}

// Initialisiere User-Menü Event Listeners
function initializeUserMenu() {
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const userProfileBtn = document.getElementById('user-profile-btn');
    const userLogoutBtn = document.getElementById('user-logout-btn');
    const profileCloseBtn = document.getElementById('profile-close-btn');
    const profileCloseBtnBottom = document.getElementById('profile-close-btn-bottom');
    
    // Toggle Dropdown
    if (userMenuBtn && userMenuDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenuDropdown.classList.toggle('hidden');
        });
        
        // Schließe Dropdown wenn außerhalb geklickt wird
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userMenuDropdown.contains(e.target)) {
                userMenuDropdown.classList.add('hidden');
            }
        });
    }
    
    // Profil öffnen
    if (userProfileBtn) {
        userProfileBtn.addEventListener('click', () => {
            userMenuDropdown.classList.add('hidden');
            showProfileModal();
        });
    }
    
    // Logout
    if (userLogoutBtn) {
        userLogoutBtn.addEventListener('click', () => {
            userMenuDropdown.classList.add('hidden');
            handleLogout();
        });
    }
    
    // Profil schließen
    if (profileCloseBtn) {
        profileCloseBtn.addEventListener('click', hideProfileModal);
    }
    if (profileCloseBtnBottom) {
        profileCloseBtnBottom.addEventListener('click', hideProfileModal);
    }
}

// Prüfe ob Benutzer bereits eingeloggt ist beim Laden
async function checkAuthState() {
    try {
        // Prüfe nur auf Hauptseite (/), nicht auf /start
        const currentPath = window.location.pathname;
        if (currentPath === '/start' || currentPath === '/start.html') {
            // Auf /start Seite → Prüfe Auth nur für User-Menü, keine Weiterleitung
            const supabaseClient = await ensureSupabaseReady();
            if (supabaseClient) {
                const { data: { user }, error } = await supabaseClient.auth.getUser();
                if (!error && user) {
                    showUserMenu(user);
                }
            }
            return;
        }
        
        // Auf Hauptseite (/)
        const supabaseClient = await ensureSupabaseReady();
        if (supabaseClient) {
            const { data: { user }, error } = await supabaseClient.auth.getUser();
            if (!error && user) {
                // Eingeloggt auf Hauptseite → Weiterleitung zu Dashboard
                if (currentPath === '/' || currentPath === '/index.html') {
                    window.location.href = 'dashboard.html';
                    return;
                }
                console.log('✅ Benutzer bereits eingeloggt:', user.id);
                showUserMenu(user);
            } else {
                hideUserMenu();
            }
        }
    } catch (error) {
        console.warn('⚠️ Fehler beim Prüfen des Auth-Status:', error);
        hideUserMenu();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        startApplication();
        initializeUserMenu();
        checkAuthState();
    });
} else {
    startApplication();
    initializeUserMenu();
    checkAuthState();
}
