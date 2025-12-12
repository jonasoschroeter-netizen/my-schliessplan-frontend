// ============================================
// LOGIN SEITE LOGIK
// ============================================

// Prüfe ob bereits eingeloggt
async function checkAuthState() {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    
    if (!error && user) {
        // Bereits eingeloggt → Weiterleitung zu Dashboard
        window.location.href = '/dashboard';
    }
}

// Login-Funktion
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value;
    const submitBtn = document.getElementById('login-submit-btn');
    const statusDiv = document.getElementById('login-status');
    
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
        showLoginStatus('success', 'Erfolgreich eingeloggt! Weiterleitung...');
        
        // Weiterleitung zu Dashboard
        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 500);
        
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

// Zeige Status-Meldung
function showLoginStatus(type, message) {
    const statusDiv = document.getElementById('login-status');
    if (!statusDiv) return;
    
    statusDiv.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-red-100', 'text-red-700');
    
    if (type === 'success') {
        statusDiv.classList.add('bg-green-100', 'text-green-700');
        statusDiv.innerHTML = `<i class="fas fa-check-circle mr-2"></i>${message}`;
    } else {
        statusDiv.classList.add('bg-red-100', 'text-red-700');
        statusDiv.innerHTML = `<i class="fas fa-exclamation-circle mr-2"></i>${message}`;
    }
}

// E-Mail-Validierung
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Initialisiere Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    checkAuthState();
    
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

