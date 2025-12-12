// ============================================
// CLIENT-SIDE ROUTER
// ============================================

class Router {
    constructor() {
        this.routes = {};
        this.currentRoute = null;
        this.init();
    }

    init() {
        // Prüfe initiale Route
        window.addEventListener('popstate', () => {
            this.handleRoute();
        });
        
        // Initiale Route laden
        this.handleRoute();
    }

    // Route registrieren
    route(path, handler) {
        this.routes[path] = handler;
    }

    // Route navigieren
    navigate(path, replace = false) {
        if (replace) {
            window.history.replaceState({}, '', path);
        } else {
            window.history.pushState({}, '', path);
        }
        this.handleRoute();
    }

    // Aktuelle Route verarbeiten
    handleRoute() {
        const path = window.location.pathname;
        const route = this.routes[path] || this.routes['/'];
        
        if (route) {
            route();
        } else {
            // Fallback zur Startseite
            this.navigate('/', true);
        }
    }

    // Aktuelle Route abrufen
    getCurrentPath() {
        return window.location.pathname;
    }
}

// Globaler Router
const router = new Router();

