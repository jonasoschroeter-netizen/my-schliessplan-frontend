// ============================================
// DASHBOARD LOGIK
// ============================================

let currentUser = null;

// Initialisiere Dashboard
async function initDashboard() {
    // Prüfe ob Benutzer eingeloggt ist
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    
    if (error || !user) {
        // Nicht eingeloggt → Weiterleitung zu Login
        window.location.href = '/login';
        return;
    }
    
    currentUser = user;
    
    // Lade Benutzerdaten für User-Menü
    await loadUserData();
    
    // Initialisiere Event Listeners
    initializeEventListeners();
    
    // Lade gespeicherte Schließpläne
    await loadSavedPlans();
}

// Lade Benutzerdaten
async function loadUserData() {
    try {
        const { data: kundeData, error: kundeError } = await supabaseClient
            .from('kunden')
            .select('vorname, nachname, email')
            .eq('user_id', currentUser.id)
            .single();
        
        if (!kundeError && kundeData) {
            const nameElement = document.getElementById('user-menu-name');
            const emailElement = document.getElementById('user-menu-email');
            
            if (nameElement) {
                nameElement.textContent = `${kundeData.vorname || ''} ${kundeData.nachname || ''}`.trim() || 'Benutzer';
            }
            if (emailElement) {
                emailElement.textContent = kundeData.email || currentUser.email || '';
            }
        } else {
            // Fallback auf Auth-Daten
            const nameElement = document.getElementById('user-menu-name');
            const emailElement = document.getElementById('user-menu-email');
            
            if (nameElement) {
                const vorname = currentUser.user_metadata?.vorname || '';
                const nachname = currentUser.user_metadata?.nachname || '';
                nameElement.textContent = `${vorname} ${nachname}`.trim() || 'Benutzer';
            }
            if (emailElement) {
                emailElement.textContent = currentUser.email || '';
            }
        }
    } catch (error) {
        console.warn('⚠️ Fehler beim Laden der Benutzerdaten:', error);
    }
}

// Initialisiere Event Listeners
function initializeEventListeners() {
    // Neuer Konfigurator Button
    const newConfigBtn = document.getElementById('new-config-btn');
    if (newConfigBtn) {
        newConfigBtn.addEventListener('click', () => {
            // Speichere Session-Status: Neuer Konfigurator
            sessionStorage.setItem('startNewConfig', 'true');
            window.location.href = '/start';
        });
    }
    
    // Session fortsetzen Button
    const continueSessionBtn = document.getElementById('continue-session-btn');
    if (continueSessionBtn) {
        continueSessionBtn.addEventListener('click', () => {
            // Lade letzte Session aus localStorage
            const lastSession = localStorage.getItem('lastSchliessplanSession');
            if (lastSession) {
                sessionStorage.setItem('continueSession', 'true');
                sessionStorage.setItem('lastSessionData', lastSession);
                window.location.href = '/start';
            } else {
                alert('Keine gespeicherte Session gefunden. Starten Sie einen neuen Konfigurator.');
            }
        });
    }
    
    // User Menu
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    const userLogoutBtn = document.getElementById('user-logout-btn');
    
    if (userMenuBtn && userMenuDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenuDropdown.classList.toggle('hidden');
        });
        
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userMenuDropdown.contains(e.target)) {
                userMenuDropdown.classList.add('hidden');
            }
        });
    }
    
    if (userLogoutBtn) {
        userLogoutBtn.addEventListener('click', async () => {
            await handleLogout();
        });
    }
}

// Lade gespeicherte Schließpläne
async function loadSavedPlans() {
    const container = document.getElementById('saved-plans-container');
    if (!container) return;
    
    try {
        // Hole Kunden-ID
        const { data: kundeData, error: kundeError } = await supabaseClient
            .from('kunden')
            .select('id')
            .eq('user_id', currentUser.id)
            .single();
        
        if (kundeError || !kundeData) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine Schließpläne gefunden.</p>';
            return;
        }
        
        // Hole Schließpläne
        const { data: plans, error: plansError } = await supabaseClient
            .from('schliessplaene')
            .select('id, name, erstellt_am, status')
            .eq('kunde_id', kundeData.id)
            .order('erstellt_am', { ascending: false })
            .limit(5);
        
        if (plansError) {
            console.error('Fehler beim Laden der Schließpläne:', plansError);
            container.innerHTML = '<p class="text-red-500 text-center py-4">Fehler beim Laden der Schließpläne.</p>';
            return;
        }
        
        if (!plans || plans.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Noch keine Schließpläne erstellt.</p>';
            return;
        }
        
        // Zeige Schließpläne
        container.innerHTML = plans.map(plan => {
            const date = new Date(plan.erstellt_am);
            const formattedDate = date.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="font-semibold text-gray-800">${plan.name || 'Unbenannter Schließplan'}</h4>
                            <p class="text-sm text-gray-500 mt-1">Erstellt am: ${formattedDate}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-1 text-xs rounded-full ${
                                plan.status === 'abgeschlossen' ? 'bg-green-100 text-green-800' :
                                plan.status === 'in_bearbeitung' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                            }">${plan.status}</span>
                            <button onclick="viewPlan('${plan.id}')" class="text-[#1a3d5c] hover:text-[#143149]">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Fehler beim Laden der Schließpläne:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4">Fehler beim Laden der Schließpläne.</p>';
    }
}

// Schließplan anzeigen
function viewPlan(planId) {
    // Weiterleitung zur Hauptseite mit Plan-ID
    sessionStorage.setItem('viewPlanId', planId);
    window.location.href = '/';
}

// Logout
async function handleLogout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error('Fehler beim Abmelden:', error);
            alert('Fehler beim Abmelden. Bitte versuchen Sie es erneut.');
        } else {
            // Lösche Session-Daten
            sessionStorage.clear();
            localStorage.removeItem('lastSchliessplanSession');
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Fehler beim Abmelden:', error);
    }
}

// Initialisiere beim Laden
document.addEventListener('DOMContentLoaded', initDashboard);

