import { initializeFirebase, logAction } from './firebase.js';
import { initializeThemeSwitcher, handleHeaderScroll, updateHourlyVerse, setupModalInteraction } from './ui.js';
import { initializeLoginForm, loadUserCredentials, setLoggedInState, getCurrentUser } from './auth.js';
import { initializeUserManagement, initializeWhatsAppConfig, renderAuditLog } from './admin.js';
import { initializeRotaModal } from './rota.js';
import { initializePlaylistSystem, renderPlaylistModal } from './playlist.js';
import { initializeGeneratorEventListeners, setupGeneratorModalForUser, renderRepertoryHistory, clearRepertoryForm } from './repertory.js';
import { openAttendanceModal } from './attendance.js';


// --- Global Functions (for cross-module communication) ---
// These are attached to window for functions using onSnapshot listeners in firebase.js
window.updateAttendanceViewIfVisible = () => {
    if (document.getElementById('attendance-modal')?.classList.contains('is-open')) {
        // We call the external function if the modal is open
        if (typeof window.renderAttendanceUI === 'function') {
            window.renderAttendanceUI();
        }
    }
};

window.renderPlaylistModal = renderPlaylistModal;
window.renderRepertoryHistory = renderRepertoryHistory;
window.renderAuditLog = renderAuditLog;


// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Initial State Check (Auth.js handles saving/loading of LocalStorage credentials)
    loadUserCredentials();
    const savedUser = getCurrentUser();
    
    // 2. Initialize Theme and UI Helpers
    initializeThemeSwitcher();
    initializeLoginForm();
    updateHourlyVerse();
    setInterval(updateHourlyVerse, 3600000);
    
    // 3. Initialize Firebase and Data Listeners (Calls setLoggedInState on success)
    await initializeFirebase((user) => {
        if (user) {
             // Firebase auth status confirmed. Now check local login state
            if (savedUser) {
                setLoggedInState(savedUser);
            } else {
                 // Force login overlay if firebase is initialized but no local user logged in
                document.getElementById('main-login-overlay').classList.remove('hidden');
            }
            
            // 4. Initialize all major feature controllers *after* Firebase and Auth setup
            initializeFeatureModules();
        }
    });

    // 5. Setup Scroll and Navigation Listeners
    window.addEventListener('scroll', handleHeaderScroll);
    setupMobileMenu();
    setupCategoryFilters();
    addLoggingToLinkCards();

});

function initializeFeatureModules() {
    // Only run these once after successful login/auth initialization
    initializeUserManagement();
    initializeWhatsAppConfig();
    initializeRotaModal();
    initializePlaylistSystem(); 
    initializeGeneratorEventListeners();
    
    // Setup modal openers now that firebase data is flowing
    setupModalInteraction('statute-modal', 'open-statute-modal', 'close-statute-modal');
    setupModalInteraction('audit-log-modal', 'open-audit-log-modal', 'close-audit-log-modal', () => { 
        window.renderAuditLog();
        document.getElementById('audit-log-search').value = ''; 
    });
    
    // CORREÇÃO: Usa setupModalInteraction para gerenciar a abertura e fechamento do modal PPTX
    // A função setupGeneratorModalForUser() é chamada como callback ao abrir.
    setupModalInteraction('pptx-generator-modal', 'open-pptx-generator-modal', 'close-pptx-generator-modal', setupGeneratorModalForUser);

    // Special Modal Openers
    document.getElementById('open-attendance-trigger')?.addEventListener('click', openAttendanceModal);
    
    // REMOVIDO: O bloco de código manual que causava problemas no fechamento do modal PPTX.
    /*
    document.getElementById('open-pptx-generator-modal')?.addEventListener('click', () => {
        setupGeneratorModalForUser();
        
        // Lógica manual de abertura (necessária devido à customização do modal)
        const modal = document.getElementById('pptx-generator-modal');
        const content = modal.querySelector('.modal-content');
        modal.classList.add('is-open');
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        setTimeout(() => { 
            modal.classList.remove('opacity-0'); 
            content.classList.remove('scale-95', 'opacity-0'); 
        }, 10);
    });
    */

    // Setup reveal animation
    const observer = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); } }); }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    
    // Setup generic ESC key listener for modals
    document.addEventListener('keydown', (event) => { 
        if (event.key === 'Escape') { 
            const openModals = document.querySelectorAll('.modal-overlay.is-open'); 
            if (openModals.length > 0) { 
                const topModal = openModals[openModals.length - 1]; 
                const closeButton = topModal.querySelector('[id^="close-"]'); 
                if (closeButton) closeButton.click(); 
            } 
        } 
    });
}


// --- DOM/UI Logic ---
function setupMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    const toggleMenu = () => {
        const isOpen = document.body.classList.toggle('menu-open');
        document.body.style.overflow = isOpen ? 'hidden' : '';
        document.getElementById('menu-open-icon').classList.toggle('hidden', isOpen);
        document.getElementById('menu-close-icon').classList.toggle('hidden', !isOpen);
        if (isOpen) { mobileMenu.classList.remove('pointer-events-none', 'opacity-0'); } 
        else { mobileMenu.classList.add('opacity-0'); setTimeout(() => mobileMenu.classList.add('pointer-events-none'), 300); }
    };
    document.getElementById('mobile-menu-button')?.addEventListener('click', toggleMenu);
    document.querySelectorAll('.mobile-nav-link').forEach(link => link.addEventListener('click', () => { if(document.body.classList.contains('menu-open')) { toggleMenu(); } }));
}

function setupCategoryFilters() {
    const filterContainer = document.getElementById('category-filters');
    if (!filterContainer) return;

    filterContainer.addEventListener('click', (e) => { 
        const target = e.target.closest('button'); 
        if (!target) return; 
        
        const category = target.dataset.category; 
        
        // Remove 'active' class from current active button and add to target
        filterContainer.querySelector('.active')?.classList.remove('active'); 
        target.classList.add('active'); 
        
        // Filter cards
        document.querySelectorAll('.portal-card-wrapper').forEach(card => {
             // Ensure admin cards remain hidden if user is not admin
            if (card.classList.contains('hidden') && category !== 'all') {
                card.classList.add('filtered-out');
                return;
            }
            card.classList.toggle('filtered-out', !(category === 'all' || card.dataset.category === category));
        });
        
        // Smooth scroll to the section
        setTimeout(() => document.getElementById('portal').scrollIntoView({ behavior: 'smooth' }), 100); 
    });
}

function addLoggingToLinkCards() {
    const cardGrid = document.getElementById('card-grid');
    if (!cardGrid) return;

    const linkCards = cardGrid.querySelectorAll('.portal-card-wrapper > a.portal-card');
    
    linkCards.forEach(card => {
        card.addEventListener('click', () => {
            const currentUser = getCurrentUser();
            if (!currentUser) return; 

            const titleEl = card.querySelector('h3');
            const moduleName = titleEl ? titleEl.textContent.trim() : 'Link Externo';
            
            const details = `Redirecionado para ${card.href}.`;
            logAction('Acesso a Link Externo', moduleName, details);
        });
    });
}