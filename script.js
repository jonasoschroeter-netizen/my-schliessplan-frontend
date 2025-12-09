// ====================================================================================
// script.js - VERSION MIT FUNKTIONS-ABFRAGE & VORAUSWAHL
// ====================================================================================

// --- DATA & CONFIGURATION ---
const ZYLINDER_ARTEN = ["Doppelzylinder", "Halbzylinder", "Knaufzylinder", "Außenzylinder"];
// ALL_FEATURES wird jetzt dynamisch aus dem Backend geladen
let ALL_FEATURES = {};
const STRAPI_BASE_URL = 'https://brave-basketball-98ec57b285.strapiapp.com'; // Strapi Cloud Backend

// Cache-Busting Konfiguration
const CACHE_BUSTING = true; // Aktiviert Cache-Busting für alle API-Aufrufe

// --- SUPABASE CONFIGURATION ---
// Supabase Client wird in index.html als ES Module geladen und als window.supabaseClient verfügbar gemacht

// Supabase Client Variable (wird vom ES Module in index.html gesetzt)
let supabase = null;
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
            supabase = window.supabaseClient;
            supabaseInitialized = true;
            console.log('✅ Supabase Client bereits geladen');
            resolve(supabase);
            return;
        }
        
        // Event Listener für supabase-ready Event
        const onReady = () => {
            if (typeof window.supabaseClient !== 'undefined' && window.supabaseClient !== null) {
                supabase = window.supabaseClient;
                supabaseInitialized = true;
                console.log('✅ Supabase Client über Event initialisiert');
                window.removeEventListener('supabase-ready', onReady);
                resolve(supabase);
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
                supabase = window.supabaseClient;
                supabaseInitialized = true;
                console.log('✅ Supabase Client über Polling initialisiert');
                window.removeEventListener('supabase-ready', onReady);
                window.removeEventListener('supabase-error', onError);
                clearInterval(checkInterval);
                resolve(supabase);
            } else if (attempts >= maxAttempts) {
                console.error('❌ Supabase Client konnte nicht geladen werden (Timeout nach 15 Sekunden)');
                console.error('🔍 Debug Info:', {
                    supabaseClientExists: typeof window.supabaseClient !== 'undefined',
                    supabaseClientValue: window.supabaseClient,
                    supabaseLibraryExists: typeof supabase !== 'undefined'
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
            supabase = null;
            supabaseInitialized = false;
        });
}

// Hilfsfunktion: Stelle sicher, dass Supabase geladen ist
async function ensureSupabaseReady() {
    if (supabaseInitialized && supabase) {
        return supabase;
    }
    
    try {
        await waitForSupabase();
        return supabase;
    } catch (error) {
        throw new Error('Supabase Client konnte nicht initialisiert werden. Bitte laden Sie die Seite neu.');
    }
}

// --- LOADING SCREEN VERWALTUNG ---
const loadingStatus = {
    items: {},
    totalSteps: 0,
    completedSteps: 0,
    
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
        
        let icon = '';
        let textColor = '';
        let bgColor = '';
        
        if (item.status === 'success') {
            icon = '<i class="fas fa-check-circle text-green-500"></i>';
            textColor = 'text-green-700';
            bgColor = 'bg-green-50 border-green-200';
        } else if (item.status === 'error') {
            icon = '<i class="fas fa-times-circle text-red-500"></i>';
            textColor = 'text-red-700';
            bgColor = 'bg-red-50 border-red-200';
        } else if (item.status === 'loading') {
            icon = '<i class="fas fa-spinner fa-spin text-blue-500"></i>';
            textColor = 'text-blue-700';
            bgColor = 'bg-blue-50 border-blue-200';
        } else {
            icon = '<i class="fas fa-circle text-gray-400"></i>';
            textColor = 'text-gray-500';
            bgColor = 'bg-gray-50 border-gray-200';
        }
        
        itemElement.className = `flex items-center justify-between p-3 ${bgColor} rounded-lg border`;
        itemElement.innerHTML = `
            <div class="flex items-center space-x-3">
                <span class="text-xl">${icon}</span>
                <span class="${textColor} font-medium">${item.name}</span>
            </div>
            ${item.error ? `<span class="text-xs text-red-600">${item.error}</span>` : ''}
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
        const percentage = Math.round((this.completedSteps / this.totalSteps) * 100);
        const progressBar = document.getElementById('loading-progress-bar');
        const progressText = document.getElementById('loading-progress-text');
        
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${percentage}%`;
        }
        
        // Wenn alle Schritte abgeschlossen sind, Loading Screen ausblenden
        if (this.completedSteps === this.totalSteps) {
            setTimeout(() => {
                this.hideLoadingScreen();
            }, 500); // Kurze Verzögerung für bessere UX
        }
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
                
                // Zeige Auth Screen
                if (authScreen) {
                    authScreen.classList.remove('hidden');
                    authScreen.style.opacity = '0';
                    authScreen.style.transition = 'opacity 0.5s ease-in';
                    setTimeout(() => {
                        authScreen.style.opacity = '1';
                    }, 50);
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
        
        // Prüfe Türen
        if (userAnswers.tueren && userAnswers.tueren.length > 0) {
            // WENN Zylinder hat keine suitableTueren definiert, zähle es als Match (flexibel)
            const hasNoTuerenRestriction = !cylinder.suitableTueren || cylinder.suitableTueren.length === 0;
            
            if (hasNoTuerenRestriction) {
                // Keine Einschränkung = alle Türen matchen
                matchCount += userAnswers.tueren.length;
            } else {
                // Prüfe gegen die Einschränkungen
                const matchingTueren = userAnswers.tueren.filter(selectedTuer => 
                    cylinder.suitableTueren.some(option => 
                        option.name === selectedTuer || option.key === selectedTuer
                    )
                );
                matchCount += matchingTueren.length;
            }
            totalChecks += userAnswers.tueren.length;
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
    try {
        console.log('🔄 Lade alle Optionen mit Paginierung...');
        let allOptions = [];
        let currentPage = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
            const response = await fetchAndHandle(
                `${STRAPI_BASE_URL}/api/options?populate[0]=icon&populate[1]=child_options&populate[2]=parent_options&pagination[page]=${currentPage}&pagination[pageSize]=25`,
                `Optionen Seite ${currentPage} laden`
            );
            
            if (!response || !response.data) {
                console.warn(`Keine Daten für Seite ${currentPage}`);
                break;
            }
            
            console.log(`Seite ${currentPage} geladen:`, response.data.length, 'Optionen');
            allOptions = allOptions.concat(response.data);
            
            // Prüfe ob es weitere Seiten gibt
            if (response.meta && response.meta.pagination) {
                const { page, pageCount } = response.meta.pagination;
                console.log(`Paginierung: Seite ${page} von ${pageCount}`);
                hasMorePages = page < pageCount;
                currentPage++;
            } else {
                hasMorePages = false;
            }
        }
        
        console.log(`✅ Alle Optionen geladen: ${allOptions.length} insgesamt`);
        return allOptions;
    } catch (error) {
        console.error('❌ Fehler beim Laden aller Optionen:', error);
        return [];
    }
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
            console.error('❌ Fehler beim Laden der Global Settings:', error);
            globalSettingsResponse = null;
            loadingStatus.updateStatus('globaleinstellungen', 'error', error.message);
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
                    case 'zylinder':
                        options = questionData.zylinders?.data || questionData.zylinders || allCylinderSystems;
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
                },
                {
                    id: 7,
                    questionText: 'Welches Zylinder-System bevorzugen Sie?',
                    question: 'Welches Zylinder-System bevorzugen Sie?',
                    description: 'Wählen Sie das passende Zylinder-System basierend auf Ihren Anforderungen.',
                    key: 'zylinder',
                    type: 'single',
                    order: 7,
                    options: allCylinderSystems.map(cylinder => ({
                        id: cylinder.id,
                        text: cylinder.name,
                        value: cylinder.name,
                        key: cylinder.name.toLowerCase().replace(/\s+/g, '_'),
                        icon: null,
                        description: cylinder.description,
                        price: cylinder.price,
                        image: cylinder.image
                    }))
                }
            ];
        }
        
        // Zylinder-Frage wurde entfernt - Navigation geht direkt zum Zylinder-Finder
        
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

        // Features werden nicht mehr geladen, da sie in den Content Types integriert sind
        console.log('🔄 Features werden über Content Types geladen...');
        ALL_FEATURES = {};

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
                <input type="checkbox" data-feature="${featureKey}" class="h-5 w-5 rounded border-gray-300 text-[#1a3d5c] focus:ring-[#1a3d5c]">
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
        <div class="options-grid-container grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto max-h-[350px] overflow-y-auto pr-2"></div>
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
        const addCustomDoorCardHtml = `<div class="option-card border-2 border-dashed border-gray-400 rounded-lg p-4 cursor-pointer text-left flex items-center transition-all duration-200 hover:bg-gray-100 hover:border-green-500" onclick="focusCustomDoorInput()"><i class="fas fa-plus-circle text-green-500 fa-fw text-2xl mr-4 flex-shrink-0"></i><div><p class="font-semibold text-lg text-gray-700">Eigene Tür hinzufügen</p><p class="text-gray-600 text-sm mt-1">Benennen Sie eine nicht aufgelistete Tür.</p></div></div>`;
        optionsGridHtml += addCustomDoorCardHtml;
    }

    optionsGridContainer.innerHTML = optionsGridHtml || `<p class="text-center text-gray-500 col-span-2">Keine Optionen für diese Frage verfügbar.</p>`;
    
    if (question.key === 'tueren') {
        const customInputHtml = `<div class="mt-6 pt-6 border-t"><h3 class="text-lg font-semibold text-center text-gray-600 mb-4">Eigene Tür/Bereich hinzufügen:</h3><div class="flex items-center justify-center gap-2"><input type="text" id="custom-input" class="input-cell w-64" placeholder="z.B. Werkstatt" onkeydown="if(event.key==='Enter') { event.preventDefault(); addCustomOption(); }"><button onclick="addCustomOption()" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Hinzufügen</button></div></div>`;
        questionElement.insertAdjacentHTML('beforeend', customInputHtml);
    }
    
    updateNavigation();
    console.log('✅ Frage erfolgreich gerendert');
}

function createOptionCardHtml(question, option) {
    const isSelected = userAnswers[question.key]?.includes(option.name || option.text);
    const iconHtml = option.icon ? `<img src="${option.icon}" alt="Icon" class="w-8 h-8 mr-4">` : '';
    const recommendationClass = option.empfehlung === 'Empfohlen' ? 'is-recommended' : '';
    let selectionClass = isSelected ? (option.isCustom ? 'selected-custom' : 'selected') : '';
    const customCardClass = option.isCustom ? 'is-custom-card' : '';
    const isCustomFlag = !!option.isCustom;
    const optionName = option.name || option.text;
    return `<div class="option-card border-2 border-gray-300 rounded-lg p-4 cursor-pointer text-left flex items-center relative transition-all duration-200 ${recommendationClass} ${selectionClass} ${customCardClass}" onclick="selectOption(this, '${question.key}', '${optionName}', '${question.type}', ${isCustomFlag})">${iconHtml}<div><p class="font-semibold text-lg">${optionName}</p>${option.description ? `<p class="text-gray-600 text-sm mt-1">${option.description}</p>` : ''}</div></div>`;
}

function selectOption(element, key, value, type, isCustom) {
    if (type === 'single') {
        if (key === 'objekttyp' && userAnswers[key] !== value) {
            delete userAnswers.tueren;
            delete userAnswers.tuerens;
            const tuerenFrage = questionsData.find(q => q.key === 'tueren' || q.key === 'tuerens');
            if (tuerenFrage) tuerenFrage.options = tuerenFrage.options.filter(opt => !opt.isCustom);
        }
        userAnswers[key] = value;
        setTimeout(() => handleNext(), 100);
    } else {
        if (!userAnswers[key]) userAnswers[key] = [];
        const index = userAnswers[key].indexOf(value);
        const customClass = 'selected-custom';
        const standardClass = 'selected';
        if (index > -1) {
            userAnswers[key].splice(index, 1);
            element.classList.remove(standardClass, customClass);
        } else {
            userAnswers[key].push(value);
            element.classList.add(isCustom ? customClass : standardClass);
        }
    }
}

function handleNext() {
    if (currentQuestionIndex < questionsData.length - 1) {
        currentQuestionIndex++;
        renderCurrentQuestion();
    } else {
        // Prüfe ob alle notwendigen Fragen beantwortet wurden
        if (!userAnswers['tueren'] || userAnswers['tueren'].length === 0) {
            alert("Bitte wählen Sie mindestens eine Tür aus oder fügen Sie eine eigene hinzu.");
            return;
        }
        // Nach Frage 6 direkt zum Zylinder-Finder
        renderCylinderFinder();
    }
}

function handlePrev() {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        elements.navigationButtons.style.display = 'flex';
        renderCurrentQuestion();
    }
}

function updateNavigation() {
    const totalSteps = questionsData.length + 1;
    const currentStep = currentQuestionIndex + 1;
    const progress = (currentStep / totalSteps) * 100;
    
    elements.progressBar.style.width = `${progress}%`;
    elements.subtitle.innerText = `Schritt ${currentStep} von ${totalSteps}`;
    elements.prevBtn.disabled = currentQuestionIndex === 0;
    elements.nextBtn.innerText = (currentQuestionIndex === questionsData.length - 1) ? "Zylinder finden" : "Weiter";
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
                <p class="text-red-500 mb-4">Keine Zylinder verfügbar. Bitte überprüfen Sie die Daten im Backend.</p>
                <button onclick="location.reload()" class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
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
                <p class="text-red-500 mb-4">Keine Zylinder verfügbar.</p>
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
        <div class="text-center mb-8">
            <h2 class="text-2xl font-semibold text-gray-700">Verfügbare Zylinder-Systeme</h2>
            <p class="text-gray-500">Wählen Sie das passende Zylinder-System für Ihren Schließplan.</p>
        </div>
        
        <!-- Bester Zylinder - Quer angezeigt -->
        <div class="mb-12">
            ${bestCylinderHtml}
        </div>
        
        ${otherCylinders.length > 0 ? `
        <div class="text-center mb-6">
            <h3 class="text-xl font-semibold text-gray-600">Andere passende Optionen</h3>
            <p class="text-gray-500">Diese Systeme könnten ebenfalls eine gute Wahl sein.</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            ${otherCylindersHtml}
        </div>
        ` : ''}
        
        <div class="text-center mt-12">
            <button onclick="generatePlan()" class="bg-[#1a3d5c] text-white px-8 py-3 rounded-lg hover:bg-[#2a4d6c] transition-colors">
                <i class="fas fa-cog mr-2"></i>Schließplan generieren
            </button>
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
            <div class="cylinder-card bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 shadow-lg">
                <div class="flex flex-col lg:flex-row gap-6">
                    <!-- Bild und Hauptinfo -->
                    <div class="lg:w-1/3">
                        ${imageHtml}
                        <div class="text-center lg:text-left">
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
                        <div class="text-center lg:text-left">
                            <button onclick="selectCylinderSystem(${system.id})" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg transition-colors text-lg shadow-md hover:shadow-lg">
                                <i class="fas fa-check-circle mr-2"></i>Auswählen
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
    } else {
        return `
            <div class="cylinder-card alternative-card">
                ${imageHtml}
                <h4 class="text-lg font-bold text-gray-800 mb-2">${system.name}</h4>
                <p class="text-gray-500 text-sm mb-4 flex-grow">${system.description || 'Alternative Zylinder-Option'}</p>
                ${matchBarHtml}
                ${priceHtml}
                <button onclick="selectCylinderSystem(${system.id})" class="w-full mt-auto bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors text-sm">
                    Als Alternative wählen
                </button>
            </div>`;
    }
}

function selectCylinderSystem(systemId) {
    // Finde den ausgewählten Zylinder
    const selectedCylinder = allCylinderSystems.find(cylinder => cylinder.id === systemId);
    if (selectedCylinder) {
        userAnswers.zylinder = selectedCylinder.name;
        userAnswers.cylinderSystemId = systemId;
        console.log('✅ Zylinder ausgewählt:', selectedCylinder.name);
    }
    generateInitialPlanData();
    showSchliessplan();
}

// --- SCHLIESSPLAN LOGIK ---

function showSchliessplan() {
    const tuerenFrage = questionsData.find(q => q.key === 'tueren');
    let alleTuerOptionen = tuerenFrage ? tuerenFrage.options.map(o => o.text) : [];
    allDoorOptionsForPlan = [...new Set([...(userAnswers['tueren'] || []), ...alleTuerOptionen])];
    
    elements.questionnaireContainer.classList.add('hidden');
    elements.schliessplanContainer.classList.remove('hidden');
    renderPlan();
}

function generateInitialPlanData() {
    const techDefault = userAnswers.technologie === 'Rein Elektronisch' ? 'elektronisch' : 'mechanisch';
    const selectedSystem = allCylinderSystems.find(s => s.id === userAnswers.cylinderSystemId) || allCylinderSystems[0];

    // Dynamische Standard-Funktionen basierend auf ALL_FEATURES
    const defaultFunctions = {};
    Object.keys(ALL_FEATURES).forEach(key => {
        // Prüfen ob der Benutzer diese Funktion in den Fragen ausgewählt hat
        const featureName = ALL_FEATURES[key].name;
        defaultFunctions[key] = userAnswers.funktionen?.includes(featureName) || false;
    });

    planData.rows = (userAnswers['tueren'] || ['Beispieltür']).map((tuer, index) => ({
        id: Date.now() + index, pos: index + 1, tuer: tuer, typ: ZYLINDER_ARTEN[0],
        systemId: selectedSystem.id,
        techType: techDefault, massA: '30', massI: '30', anzahl: 1,
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
    const isMixedSystem = userAnswers.technologie === 'Gemischte Anlage';
    elements.techHeader.style.display = isMixedSystem ? '' : 'none';
    elements.colorLegend.style.display = isMixedSystem ? 'flex' : 'none';
    
    elements.keyHeader.innerHTML = '';
    planData.keys.forEach(key => {
        const headerCell = document.createElement('div');
        headerCell.className = 'schluessel-header-zelle'; 
        headerCell.innerHTML = `<input type="text" value="${key.name}" data-key-id="${key.id}" onchange="updateKeyName(this)">`;
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

        let tuerCellHtml = '';
        if (row.isAddingCustomTuer) {
            tuerCellHtml = `<input type="text" class="input-cell" placeholder="Bezeichnung eingeben..." onblur="saveCustomDoorName(this, ${row.id})" onkeydown="if(event.key==='Enter') this.blur()">`;
        } else if (row.isEditingTuer) {
            const options = allDoorOptionsForPlan.map(opt => `<option value="${opt}" ${row.tuer === opt ? 'selected' : ''}>${opt}</option>`).join('');
            tuerCellHtml = `<select class="input-cell" onchange="updateDoorSelection(this, ${row.id})"><option value="">Bitte wählen...</option>${options}<option value="add_custom" class="font-bold text-[#1a3d5c]">Eigene Bezeichnung...</option></select>`;
        } else {
            tuerCellHtml = `<span class="font-semibold">${row.tuer}</span><button onclick="editDoorName(${row.id})" class="ml-2 text-gray-400 hover:text-[#1a3d5c] opacity-50 hover:opacity-100 transition-opacity"><i class="fas fa-pencil-alt fa-xs"></i></button>`;
        }

        const zylinderOptions = ZYLINDER_ARTEN.map(art => `<option value="${art}" ${row.typ === art ? 'selected' : ''}>${art}</option>`).join('');
        const systemOptions = allCylinderSystems.map(sys => `<option value="${sys.id}" ${row.systemId === sys.id ? 'selected' : ''}>${sys.name}</option>`).join('');
        
        let functionIcons = Object.keys(row.funktionen).map(key => row.funktionen[key] ? `<i class="fas ${ALL_FEATURES[key].icon} ${ALL_FEATURES[key].color} fa-fw" title="${ALL_FEATURES[key].title}"></i>` : '').join('');
        functionIcons += `<button class="icon-btn text-xl text-gray-400 hover:text-[#1a3d5c] ml-2" onclick="openFunctionModal(${row.id})"><i class="fas fa-cog"></i></button>`;
        
        let matrixCells = planData.keys.map((key, keyIndex) => `<td class="border-l schliessmatrix-cell ${row.matrix[keyIndex] ? 'checked' : ''}" onclick="toggleMatrix(this, ${row.id}, ${keyIndex})">${row.matrix[keyIndex] ? '<i class="fas fa-times text-xl"></i>' : ''}</td>`).join('');
        const techDropdown = isMixedSystem ? `<td><select class="input-cell" onchange="updateRowData(${row.id}, 'techType', this.value)"><option value="mechanisch" ${row.techType === 'mechanisch' ? 'selected' : ''}>Mechanisch</option><option value="elektronisch" ${row.techType === 'elektronisch' ? 'selected' : ''}>Elektronisch</option></select></td>` : '<td style="display: none;"></td>';
        
        tr.innerHTML = `
            <td class="font-bold">${row.pos}</td>
            <td>${tuerCellHtml}</td>
            <td><select class="input-cell" onchange="updateRowData(${row.id}, 'typ', this.value)">${zylinderOptions}</select></td>
            <td><select class="input-cell" onchange="updateRowData(${row.id}, 'systemId', this.value)">${systemOptions}</select></td>
            ${techDropdown}
            <td><div class="flex items-center justify-center gap-1"><input type="text" class="input-cell w-16 text-center" value="${row.massA}" onchange="updateRowData(${row.id}, 'massA', this.value)"><span>/</span><input type="text" class="input-cell w-16 text-center" value="${row.massI}" onchange="updateRowData(${row.id}, 'massI', this.value)"></div></td>
            <td><input type="number" min="1" class="input-cell w-20 text-center" value="${row.anzahl}" onchange="updateRowData(${row.id}, 'anzahl', this.value)"></td>
            <td><div class="flex items-center justify-center gap-3">${functionIcons}</div></td>
            <td class="border-none bg-gray-100"></td>
            <td class="schliessplan-data-vertical">${row.tuer}</td>
            ${matrixCells}`;
        elements.schliessplanBody.appendChild(tr);
    });
}

function updateRowData(rowId, field, value) { 
    const row = planData.rows.find(r => r.id === rowId); 
    if (row) { 
        const realValue = (field === 'anzahl' || field === 'systemId') ? parseInt(value, 10) : value;
        row[field] = realValue;
        renderPlan();
    }
}

function editDoorName(rowId) {
    const row = planData.rows.find(r => r.id === rowId);
    if (row) {
        row.isEditingTuer = true;
        row.isAddingCustomTuer = false;
        renderPlan();
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
}

function saveCustomDoorName(input, rowId) {
    const row = planData.rows.find(r => r.id === rowId);
    if (row && input.value.trim() !== '') {
        row.tuer = input.value.trim();
    }
    row.isEditingTuer = false;
    row.isAddingCustomTuer = false;
    renderPlan();
}

function updateKeyName(input) {
    const key = planData.keys.find(k => k.id === parseInt(input.dataset.keyId));
    if (key) key.name = input.value;
}

function toggleMatrix(cell, rowId, keyIndex) {
    const row = planData.rows.find(r => r.id === rowId);
    if (row) {
        row.matrix[keyIndex] = !row.matrix[keyIndex];
        cell.classList.toggle('checked');
        cell.innerHTML = row.matrix[keyIndex] ? '<i class="fas fa-times text-xl"></i>' : '';
    }
}

function addSchliessplanRow() {
    const techDefault = userAnswers.technologie === 'Rein Elektronisch' ? 'elektronisch' : 'mechanisch';
    const lastSystemId = planData.rows.length > 0 ? planData.rows[planData.rows.length - 1].systemId : allCylinderSystems[0].id;

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
}

function addKeyColumn() {
    planData.keys.push({ id: Date.now(), name: `Gruppe ${planData.keys.length + 1}` });
    planData.rows.forEach(row => row.matrix.push(false));
    renderPlan();
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
                <input type="checkbox" data-feature="${featureKey}" class="h-5 w-5 rounded border-gray-300 text-[#1a3d5c] focus:ring-[#1a3d5c]" ${isChecked ? 'checked' : ''}>
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

async function savePlanToCRM() {
    // 1. Formular-Daten sammeln
    const vorname = document.getElementById('customer-vorname')?.value.trim();
    const nachname = document.getElementById('customer-nachname')?.value.trim();
    const email = document.getElementById('customer-email')?.value.trim();
    const telefon = document.getElementById('customer-telefon')?.value.trim();
    
    // Validierung
    if (!email || !vorname || !nachname) {
        showSaveStatus('error', 'Bitte füllen Sie alle Pflichtfelder aus.');
        return;
    }
    
    if (!isValidEmail(email)) {
        showSaveStatus('error', 'Bitte geben Sie eine gültige E-Mail-Adresse ein.');
        return;
    }
    
    // 2. Speichern starten
    showSaveStatus('loading', 'Schließplan wird gespeichert...');
    const saveBtn = document.getElementById('save-plan-btn');
    if (saveBtn) saveBtn.disabled = true;
    
    try {
        // Stelle sicher, dass Supabase geladen ist
        const supabaseClient = await ensureSupabaseReady();
        
        // 3. Kunde finden oder erstellen
        const kundeId = await findOrCreateKunde(email, vorname, nachname, telefon);
        
        // Hole Kundenummer für Anzeige
        const { data: kundeInfo } = await supabaseClient
            .from('kunden')
            .select('kundenummer')
            .eq('id', kundeId)
            .single();
        
        // 4. Schließplan speichern
        const selectedSystem = allCylinderSystems.find(s => s.id === userAnswers.cylinderSystemId);
        
        const schliessplanData = {
            kunde_id: kundeId,
            name: `${userAnswers.objekttyp || 'Schließplan'} - ${new Date().toLocaleDateString('de-DE')}`,
            objekttyp: userAnswers.objekttyp,
            anlagentyp: userAnswers.anlagentyp,
            qualitaet: userAnswers.qualitaet,
            technologie: userAnswers.technologie,
            zylinder_system_id: userAnswers.cylinderSystemId,
            zylinder_system_name: selectedSystem?.name,
            plan_data: planData,
            user_answers: userAnswers,
            status: 'erstellt'
        };
        
        const { data: planDataResult, error: planError } = await supabaseClient
            .from('schliessplaene')
            .insert([schliessplanData])
            .select()
            .single();
        
        if (planError) {
            throw new Error(`Fehler beim Speichern des Schließplans: ${planError.message}`);
        }
        
        console.log('✅ Schließplan gespeichert:', planDataResult);
        
        // 5. Automatisch in Mediathek speichern
        try {
            showSaveStatus('loading', 'Schließplan wird in Mediathek gespeichert...');
            await saveToMediathek(supabaseClient, planDataResult.id, kundeId, planDataResult);
            console.log('✅ Schließplan erfolgreich in Mediathek gespeichert');
        } catch (mediathekError) {
            console.warn('⚠️ Fehler beim Speichern in Mediathek (Plan ist trotzdem gespeichert):', mediathekError);
            // Fehler wird nicht weitergegeben, da der Plan bereits gespeichert ist
        }
        
        // 6. Erfolgsmeldung
        const kundenummer = kundeInfo?.kundenummer || 'Wird generiert...';
        showSaveStatus('success', `Schließplan erfolgreich gespeichert und in Mediathek verfügbar! ${kundenummer ? 'Kundenummer: ' + kundenummer : ''}`);
        
        // Optional: Weiterleitung oder Dialog
        setTimeout(() => {
            alert(`Vielen Dank, ${vorname}! Ihr Schließplan wurde gespeichert und ist jetzt in Ihrer Mediathek verfügbar.${kundenummer ? ' Ihre Kundenummer: ' + kundenummer : ''}`);
        }, 1000);
        
    } catch (error) {
        console.error('❌ Fehler beim Speichern:', error);
        showSaveStatus('error', `Fehler: ${error.message}`);
        
        // Detaillierte Fehlerinformationen in Console
        if (error.message.includes('RLS')) {
            console.error('💡 Hinweis: Prüfen Sie die Row Level Security Policies in Supabase');
        }
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function skipCustomerForm() {
    if (confirm('Möchten Sie wirklich ohne Speichern fortfahren? Der Schließplan geht verloren.')) {
        console.log('Schließplan wurde nicht gespeichert');
        // Optional: Als PDF exportieren oder anderweitig speichern
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
            if (systemSelect) row.systemId = parseInt(systemSelect.value) || row.systemId;
            
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
        const system = allCylinderSystems.find(s => s.id === systemId);
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
        const systemName = getSystemName(row.systemId);
        const functionNames = getFunctionNames(row.funktionen);
        const techType = row.techType || 'mechanisch';
        const bgColor = techType === 'elektronisch' ? '#e0f2fe' : 'transparent';

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
        keyHeaders += `<th style="border: 1px solid #ccc; padding: 8px; background-color: #1a3d5c; color: white; transform: rotate(-90deg); white-space: nowrap; min-width: 50px; height: 150px;">${key.name}</th>`;
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
        h1 { color: #1a3d5c; text-align: center; margin-bottom: 30px; font-size: 28px; }
        .info-box { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid #1a3d5c; }
        .info-box p { margin: 5px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
        th { background-color: #1a3d5c; color: white; padding: 10px 8px; text-align: center; border: 1px solid #ccc; font-weight: bold; }
        .header-main { background-color: #2a4d6c; font-size: 14px; padding: 12px; }
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
        const htmlContent = generateSchliessplanHTML();
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        
        // 2. Dateiname erstellen
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `schliessplan-${timestamp}-${Date.now()}.html`;
        const filePath = `${kundeId}/${schliessplanId}/${fileName}`;
        
        // 3. Datei in Supabase Storage hochladen
        const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('schliessplaene')
            .upload(filePath, blob, {
                contentType: 'text/html;charset=utf-8',
                upsert: true
            });
        
        if (uploadError) {
            throw new Error(`Upload-Fehler: ${uploadError.message}`);
        }
        
        // 4. Öffentliche URL generieren
        const { data: { publicUrl } } = supabaseClient.storage
            .from('schliessplaene')
            .getPublicUrl(filePath);
        
        // 5. Metadaten in Mediathek-Tabelle speichern
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
            throw new Error(`Datenbank-Fehler: ${dbError.message}`);
        }
        
        // 6. Schließplan mit Mediathek-ID verknüpfen
        const exportDateien = [
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
        
        // 1. Registrierung mit Supabase Auth (Passwort wird automatisch gehashed!)
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    vorname: vorname,
                    nachname: nachname,
                    telefon: telefon || null
                }
            }
        });
        
        if (authError) {
            throw new Error(`Registrierungsfehler: ${authError.message}`);
        }
        
        if (!authData.user) {
            throw new Error('Registrierung fehlgeschlagen: Keine Benutzerdaten erhalten');
        }
        
        console.log('✅ Benutzer erfolgreich registriert:', authData.user.id);
        
        // 2. Kunden-Eintrag in kunden Tabelle erstellen
        // Verwende die create_kunde_on_signup Funktion oder direkten Insert
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
            // Falls Insert fehlschlägt, versuche die Funktion
            console.warn('⚠️ Direkter Insert fehlgeschlagen, versuche Funktion:', kundeError);
            
            const { data: kundeId, error: rpcError } = await supabaseClient.rpc('create_kunde_on_signup', {
                p_user_id: authData.user.id,
                p_email: email.toLowerCase().trim(),
                p_vorname: vorname,
                p_nachname: nachname,
                p_telefon: telefon || null
            });
            
            if (rpcError) {
                throw new Error(`Fehler beim Erstellen des Kunden-Eintrags: ${rpcError.message}`);
            }
            
            console.log('✅ Kunden-Eintrag erstellt (via Funktion):', kundeId);
        } else {
            console.log('✅ Kunden-Eintrag erstellt:', kundeData);
        }
        
        // 3. Erfolgsmeldung
        showRegisterStatus('success', 'Registrierung erfolgreich! Sie werden jetzt eingeloggt...');
        
        // 4. Modal schließen und Auth Screen ausblenden
        setTimeout(() => {
            hideRegisterModal();
            hideAuthScreen();
            // Fragebogen wird automatisch angezeigt
        }, 1500);
        
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
            // TODO: Login-Modal öffnen
            hideAuthScreen();
        });
    }
    
    if (guestBtn) {
        guestBtn.addEventListener('click', () => {
            console.log('👤 Als Gast fortfahren geklickt');
            hideAuthScreen();
            // Fragebogen wird automatisch angezeigt
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
}

// --- EVENT LISTENERS ---
elements.nextBtn.addEventListener('click', handleNext);
elements.prevBtn.addEventListener('click', handlePrev);
elements.addRowBtn.addEventListener('click', addSchliessplanRow);
elements.addKeyBtn.addEventListener('click', addKeyColumn);
elements.backToQuestionsBtn.addEventListener('click', initializeQuestionnaire);

// PDF-Export Button Event Listener
// Wird nach DOM-Load in initializeQuestionnaire registriert 
elements.functionModal.addEventListener('click', (e) => { if (e.target === elements.functionModal) closeFunctionModal(); });
elements.modalCancelBtn.addEventListener('click', closeFunctionModal);
elements.modalSaveBtn.addEventListener('click', saveFunctions);

// CRM Form Submit
const customerForm = document.getElementById('customer-form');
if (customerForm) {
    customerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await savePlanToCRM();
    });
}

// HTML-Export Button Event Listener
document.addEventListener('DOMContentLoaded', () => {
    const exportHtmlBtn = document.getElementById('export-html-btn');
    if (exportHtmlBtn) {
        exportHtmlBtn.addEventListener('click', exportSchliessplanToHTML);
    }
});

// Auch nach DOM-Load registrieren, falls DOM bereits geladen ist
const exportHtmlBtn = document.getElementById('export-html-btn');
if (exportHtmlBtn) {
    exportHtmlBtn.addEventListener('click', exportSchliessplanToHTML);
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
// Warte bis DOM geladen ist
async function startApplication() {
    // Loading Screen initialisieren
    loadingStatus.init();
    
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
        supabase = null;
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        startApplication();
    });
} else {
    startApplication();
}
