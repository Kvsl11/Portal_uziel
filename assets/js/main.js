import { initializeFirebase, logAction, getMembers } from './firebase.js';
import { initializeThemeSwitcher, handleHeaderScroll, updateHourlyVerse, setupModalInteraction } from './ui.js';
// CORREÇÃO CRÍTICA: Adicionando syncUsersToFirestore à importação
import { initializeLoginForm, loadUserCredentials, setLoggedInState, getCurrentUser, syncUsersToFirestore } from './auth.js'; 
import { initializeUserManagement, initializeWhatsAppConfig, renderAuditLog, clearAuditLog } from './admin.js';
import { initializeRotaModal } from './rota.js';
import { initializePlaylistSystem, renderPlaylistModal } from './playlist.js';
import { initializeGeneratorEventListeners, setupGeneratorModalForUser, renderRepertoryHistory, clearRepertoryForm } from './repertory.js';
import { openAttendanceModal } from './attendance.js'; // Importação essencial para abrir o modal de presença


// --- Global Functions (for cross-module communication) ---
// These are attached to window for functions using onSnapshot listeners in firebase.js
window.updateAttendanceViewIfVisible = () => {
    // A função renderAttendanceUI está no attendance.js e deve ser chamada aqui.
    if (document.getElementById('attendance-modal')?.classList.contains('is-open')) {
        if (typeof window.renderAttendanceUI === 'function') {
            // Chama a função principal de renderização do modal
            window.renderAttendanceUI();
        }
    }
};

window.renderPlaylistModal = renderPlaylistModal;
window.renderRepertoryHistory = renderRepertoryHistory;
window.renderAuditLog = renderAuditLog;
window.clearAuditLog = clearAuditLog; // Expondo a função para uso no listener


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
    await initializeFirebase(async (user) => { // Tornando o callback async
        if (user) {
             // ** CORREÇÃO CRÍTICA **
             // Garante que todos os usuários da lista local (incluindo os iniciais) existam no Firestore
             await syncUsersToFirestore(); 
             
             // Firebase auth status confirmed. Now check local login state
            if (savedUser) {
                setLoggedInState(savedUser);
            } else {
                // Force login overlay if firebase is initialized but no local user logged in
                document.getElementById('main-login-overlay').classList.remove('hidden');
            }
            
            // 4. Initialize all major feature controllers *after* Firebase and Auth setup
            initializeFeatureModules();

            // Ativar listeners globais após a primeira autenticação
            window.addEventListener('scroll', handleHeaderScroll);
            handleHeaderScroll(); 
        }
    });

    // 5. Setup Scroll and Navigation Listeners
    setupMobileMenu();
    setupCategoryFilters();
    addLoggingToLinkCards();
    
    // 6. Setup Modal Interactivity for closing dynamic modals
    // CORREÇÃO CRÍTICA APLICADA: Garantir que o callback de renderização seja passado para 
    // que o conteúdo do modal de Presença seja carregado na abertura.
    setupModalInteraction('attendance-modal', 'open-attendance-trigger', 'close-attendance-modal', openAttendanceModal); 
    setupModalInteraction('pptx-generator-modal', 'open-pptx-generator-modal', 'close-pptx-generator-modal', setupGeneratorModalForUser);

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
});

function initializeFeatureModules() {
    // Only run these once after successful login/auth initialization
    initializeUserManagement();
    initializeWhatsAppConfig();
    initializeRotaModal();
    initializePlaylistSystem(); 
    initializeGeneratorEventListeners();
    
    // CORREÇÃO DE BUG: Liga as funções de limpeza aos botões corretos
    // Botão Limpar Histórico de Logs
    document.getElementById('clear-audit-log-btn')?.addEventListener('click', () => {
        // Chamamos a função global (importada de admin.js)
        window.clearAuditLog(); 
    });

    // Setup modal openers now that firebase data is flowing
    setupModalInteraction('statute-modal', 'open-statute-modal', 'close-statute-modal');
    setupModalInteraction('audit-log-modal', 'open-audit-log-modal', 'close-audit-log-modal', () => { 
        window.renderAuditLog();
        document.getElementById('audit-log-search').value = ''; 
    });
    
    // Setup Modals with dynamic content that need listeners reattached
    setupModalInteraction('justification-modal', null, 'cancel-justification-btn'); 
    setupModalInteraction('edit-record-modal', null, 'close-edit-record-modal'); 

    // Setup reveal animation
    const observer = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); } }); }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
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
            const currentUser = getCurrentUser();
            const isHiddenAdminCard = card.classList.contains('admin-only') && !(currentUser?.role === 'admin' || currentUser?.role === 'super-admin');

            if (isHiddenAdminCard) {
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