// ============================================
// DASHBOARD LOGIK
// ============================================

const RESUME_SESSION_KEY = 'resumeSchliessplanSession';
const RESUME_PLAN_ID_KEY = 'resumeSchliessplanId';
const LOCAL_SESSION_KEY = 'lastSchliessplanSession';
const START_NEW_CONFIG_KEY = 'startNewConfig';

let currentUser = null;
let currentKunde = null;
let savedPlans = [];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function statusClass(status) {
    if (status === 'abgeschlossen' || status === 'erstellt') return 'bg-green-100 text-green-800';
    if (status === 'in_bearbeitung') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
}

function isDashboardSupabaseReady() {
    return supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.getUser === 'function';
}

async function initDashboard() {
    if (!isDashboardSupabaseReady()) {
        window.location.href = 'login.html';
        return;
    }

    const { data: { user }, error } = await supabaseClient.auth.getUser();

    if (error || !user) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;
    await loadUserData();
    initializeEventListeners();
    await loadSavedPlans();
}

async function loadUserData() {
    try {
        const { data: kundeData, error: kundeError } = await supabaseClient
            .from('kunden')
            .select('id, vorname, nachname, email')
            .eq('user_id', currentUser.id)
            .single();

        currentKunde = kundeError ? null : kundeData;
        const nameElement = document.getElementById('user-menu-name');
        const emailElement = document.getElementById('user-menu-email');

        const vorname = currentKunde?.vorname || currentUser.user_metadata?.vorname || '';
        const nachname = currentKunde?.nachname || currentUser.user_metadata?.nachname || '';

        if (nameElement) nameElement.textContent = `${vorname} ${nachname}`.trim() || 'Benutzer';
        if (emailElement) emailElement.textContent = currentKunde?.email || currentUser.email || '';
    } catch (error) {
        console.warn('Fehler beim Laden der Benutzerdaten:', error);
    }
}

function initializeEventListeners() {
    const newConfigBtn = document.getElementById('new-config-btn');
    if (newConfigBtn) {
        newConfigBtn.addEventListener('click', () => {
            sessionStorage.setItem(START_NEW_CONFIG_KEY, 'true');
            sessionStorage.removeItem(RESUME_SESSION_KEY);
            sessionStorage.removeItem(RESUME_PLAN_ID_KEY);
            window.location.href = 'start.html';
        });
    }

    const continueSessionBtn = document.getElementById('continue-session-btn');
    if (continueSessionBtn) {
        continueSessionBtn.addEventListener('click', () => {
            const latest = savedPlans[0];
            if (latest) {
                continuePlan(latest.id);
                return;
            }

            const lastSession = localStorage.getItem(LOCAL_SESSION_KEY);
            if (lastSession) {
                sessionStorage.setItem(RESUME_SESSION_KEY, lastSession);
                window.location.href = 'start.html';
            } else {
                alert('Keine gespeicherte Session gefunden. Starten Sie einen neuen Konfigurator.');
            }
        });
    }

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
        userLogoutBtn.addEventListener('click', handleLogout);
    }
}

async function loadSavedPlans() {
    const container = document.getElementById('saved-plans-container');
    if (!container) return;

    if (!currentKunde) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine Kundendaten gefunden.</p>';
        return;
    }

    try {
        let { data: plans, error: plansError } = await supabaseClient
            .from('schliessplaene')
            .select('id, kunde_id, name, objekttyp, technologie, status, erstellt_am, aktualisiert_am, user_answers, plan_data, export_dateien')
            .eq('kunde_id', currentKunde.id)
            .order('aktualisiert_am', { ascending: false })
            .limit(50);

        if (plansError && String(plansError.message || '').includes('export_dateien')) {
            console.warn('Spalte export_dateien fehlt, Dashboard lädt ohne HTML-Link:', plansError);
            const fallbackResult = await supabaseClient
                .from('schliessplaene')
                .select('id, kunde_id, name, objekttyp, technologie, status, erstellt_am, aktualisiert_am, user_answers, plan_data')
                .eq('kunde_id', currentKunde.id)
                .order('aktualisiert_am', { ascending: false })
                .limit(50);
            plans = fallbackResult.data;
            plansError = fallbackResult.error;
        }

        if (plansError) {
            console.error('Fehler beim Laden der Schließpläne:', plansError);
            container.innerHTML = '<p class="text-red-500 text-center py-4">Fehler beim Laden der Schließpläne.</p>';
            return;
        }

        savedPlans = plans || [];

        if (savedPlans.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Noch keine Schließpläne erstellt.</p>';
            return;
        }

        container.innerHTML = savedPlans.map(plan => {
            const rowCount = Array.isArray(plan.plan_data?.rows) ? plan.plan_data.rows.length : 0;
            const lastHtml = Array.isArray(plan.export_dateien) && plan.export_dateien.length > 0
                ? plan.export_dateien[plan.export_dateien.length - 1]?.url
                : null;

            return `
                <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div class="min-w-0">
                            <h4 class="font-semibold text-gray-800">${escapeHtml(plan.name || 'Unbenannter Schließplan')}</h4>
                            <p class="text-sm text-gray-500 mt-1">
                                Aktualisiert: ${formatDate(plan.aktualisiert_am || plan.erstellt_am)}
                                ${rowCount ? ` · ${rowCount} Türen` : ''}
                            </p>
                            <p class="text-xs text-gray-500 mt-1">${escapeHtml([plan.objekttyp, plan.technologie].filter(Boolean).join(' · '))}</p>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="px-2 py-1 text-xs rounded-full ${statusClass(plan.status)}">${escapeHtml(plan.status || 'in_bearbeitung')}</span>
                            <button type="button" onclick="continuePlan('${plan.id}')" class="rounded-lg bg-[#203d5d] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1a344f]">
                                Fortsetzen
                            </button>
                            ${lastHtml ? `<a href="${escapeHtml(lastHtml)}" target="_blank" rel="noopener" class="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">HTML</a>` : ''}
                            <button type="button" onclick="deletePlan('${plan.id}')" class="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                                Löschen
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

function continuePlan(planId) {
    const plan = savedPlans.find(item => item.id === planId);
    if (!plan) {
        sessionStorage.setItem(RESUME_PLAN_ID_KEY, planId);
        window.location.href = 'start.html';
        return;
    }

    const sessionData = {
        schliessplanId: plan.id,
        kundeId: plan.kunde_id,
        userAnswers: plan.user_answers || {},
        planData: plan.plan_data || { rows: [], keys: [] },
        currentQuestionIndex: plan.plan_data?.currentQuestionIndex || 0
    };

    sessionStorage.setItem(RESUME_SESSION_KEY, JSON.stringify(sessionData));
    sessionStorage.setItem(RESUME_PLAN_ID_KEY, plan.id);
    window.location.href = 'start.html';
}

async function deletePlan(planId) {
    const plan = savedPlans.find(item => item.id === planId);
    const name = plan?.name || 'diesen Schließplan';
    if (!confirm(`Möchten Sie ${name} wirklich löschen?`)) return;

    try {
        const { error } = await supabaseClient
            .from('schliessplaene')
            .delete()
            .eq('id', planId);

        if (error) {
            throw error;
        }

        if (sessionStorage.getItem(RESUME_PLAN_ID_KEY) === planId) {
            sessionStorage.removeItem(RESUME_PLAN_ID_KEY);
        }

        await loadSavedPlans();
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        alert(`Fehler beim Löschen: ${error.message}`);
    }
}

async function handleLogout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error('Fehler beim Abmelden:', error);
            alert('Fehler beim Abmelden. Bitte versuchen Sie es erneut.');
        } else {
            sessionStorage.clear();
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error('Fehler beim Abmelden:', error);
    }
}

window.continuePlan = continuePlan;
window.deletePlan = deletePlan;

document.addEventListener('DOMContentLoaded', initDashboard);
