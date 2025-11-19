import { logAction } from './firebase.js';
import { getCurrentUser, isSuperAdmin } from './auth.js';

// --- MODAL & CONFIRMATION HELPERS ---

/**
 * Attaches opening/closing logic to a modal element.
 * @param {string} modalId O ID do elemento modal.
 * @param {string} openBtnId O ID do botão que abre o modal.
 * @param {string} closeBtnId O ID do botão que fecha o modal.
 * @param {function} onOpen Função de callback executada ao abrir o modal.
 * @returns {function} A função de fechar o modal.
 */
export function setupModalInteraction(modalId, openBtnId, closeBtnId, onOpen) {
    const modal = document.getElementById(modalId);
    const openBtn = document.getElementById(openBtnId);
    const closeBtn = document.getElementById(closeBtnId);
    
    if (!modal || (!openBtn && openBtnId) || !closeBtn) return;
    
    // Adiciona classes de transição ao modal e ao conteúdo para melhor aparência
    modal.classList.add('fixed', 'inset-0', 'bg-black/50', 'z-50', 'modal-overlay', 'transition-opacity', 'duration-300', 'flex', 'items-center', 'justify-center', 'opacity-0', 'hidden');
    
    const content = modal.querySelector('.modal-content');
    if (content) {
        content.classList.add('transition-all', 'duration-300', 'transform', 'scale-95', 'opacity-0');
    }
    
    const openModal = () => {
        modal.classList.add('is-open'); // Add custom open class for tracking
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        // CORREÇÃO UX: Remove opacity-0 e scale-95 para iniciar a transição
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            if (content) {
                content.classList.remove('scale-95', 'opacity-0');
            }
        }, 10);
        
        // Logging
        const currentUser = getCurrentUser();
        if (currentUser && openBtnId) {
            try {
                const openButtonElement = document.getElementById(openBtnId);
                // Tenta extrair um título mais limpo
                const cardTitle = openButtonElement?.querySelector('h3')?.textContent?.trim() || 
                                  openBtnId.replace(/open-|-modal|-trigger/g, ' ').trim();
                const module = cardTitle || modalId.replace('-modal', '');
                logAction('Abriu Ferramenta', module, `Usuário abriu o modal '${module}'.`);
            } catch (e) {
                console.error("Error during modal open logging:", e);
            }
        }
        
        if (onOpen) onOpen();
    };

    const closeModal = () => {
        if (content) {
            content.classList.add('scale-95', 'opacity-0');
        }
        modal.classList.add('opacity-0');
        modal.classList.remove('is-open');
        
        setTimeout(() => {
            modal.classList.add('hidden');
            // Only re-enable scroll if no other modal is open
            if (!document.querySelector('.modal-overlay.is-open')) {
                document.body.style.overflow = '';
            }
        }, 300);
    };

    if (openBtn) { openBtn.addEventListener('click', openModal); }
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    
    // Return the close function in case an external module needs it
    return closeModal;
}

/**
 * Abre o modal de confirmação com uma mensagem e callback.
 */
export function openConfirmationModal(message, onConfirm) {
    const modal = document.getElementById('confirmation-modal');
    if (!modal) return;
    
    // Assegura que o modal tem as classes de transição
    modal.classList.add('transition-opacity', 'duration-300', 'opacity-0');

    const content = modal.querySelector('.modal-content');
    const confirmMessage = modal.querySelector('#confirmation-message');
    let confirmBtn = modal.querySelector('#confirm-action-btn');
    let cancelBtn = modal.querySelector('#cancel-confirmation-btn');

    // Assegura que o conteúdo tem as classes de transição
    if (content) {
        content.classList.add('transition-all', 'duration-300', 'transform', 'scale-95', 'opacity-0');
    }

    confirmMessage.textContent = message;

    // --- CORREÇÃO DE LISTENERS: Clonagem de nós para evitar empilhamento ---
    
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    confirmBtn = newConfirmBtn; // Reatribui para o novo nó

    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    cancelBtn = newCancelBtn; // Reatribui para o novo nó
    
    // --- Configura Novos Listeners ---

    confirmBtn.onclick = () => {
        onConfirm();
        closeConfirmationModal();
    };

    cancelBtn.onclick = () => {
        closeConfirmationModal();
    };

    modal.onclick = (e) => {
        if (e.target === modal) {
            closeConfirmationModal();
        }
    };

    modal.classList.add('is-open');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        if (content) {
            content.classList.remove('scale-95', 'opacity-0');
        }
    }, 10);
}

/**
 * Fecha o modal de confirmação.
 */
export function closeConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    if (!modal || modal.classList.contains('hidden')) return;

    const content = modal.querySelector('.modal-content');
    
    if (content) {
        content.classList.add('scale-95', 'opacity-0');
    }
    modal.classList.add('opacity-0');
    modal.classList.remove('is-open');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        if (!document.querySelector('.modal-overlay.is-open')) {
            document.body.style.overflow = '';
        }
    }, 300);
}

// --- GENERAL UI HELPERS ---

/**
 * Exibe feedback visual no elemento especificado.
 */
export function showFeedback(elementId, message, isError = true, duration = 4000) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    // Garante que o elemento está visível e com classes de cor corretas
    el.textContent = message;
    el.classList.toggle('text-red-600', isError);
    el.classList.toggle('text-green-600', !isError);
    el.classList.remove('opacity-0');
    
    if (duration > 0) {
        setTimeout(() => el.classList.add('opacity-0'), duration);
    }
}


export function updateHourlyVerse() {
    const verses = [
        { text: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.", reference: "João 3:16" },
        { text: "O Senhor é o meu pastor; nada me faltará.", reference: "Salmos 23:1" },
        { text: "Posso todas as coisas em Cristo que me fortalece.", reference: "Filipenses 4:13" },
        { text: "Se, porém, não lhes agrada servir ao Senhor, escolham hoje a quem servirão... Eu e a minha família serviremos ao Senhor.", reference: "Josué 24:15" },
        { text: "Tudo o que fizerem, façam de todo o coração, como para o Senhor, e não para os homens.", reference: "Colossenses 3:23" },
    ];
    
    const seededRandom = (seed) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    };
    
    const now = new Date();
    // Seed changes hourly
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate() * 24 + now.getHours();
    const randomIndex = Math.floor(seededRandom(seed) * verses.length);
    const verse = verses[randomIndex];
    
    if (verse) {
        document.getElementById('verse-text').textContent = verse.text;
        document.getElementById('verse-reference').textContent = verse.reference;
    }
}

export function initializeThemeSwitcher() {
    const desktopToggle = document.getElementById('desktop-theme-toggle');
    const mobileToggle = document.getElementById('mobile-theme-toggle');
    const toggleButtons = [desktopToggle, mobileToggle];

    const updateToggleUI = (isDark) => {
        toggleButtons.forEach(button => {
            if(button) {
                const sunIcon = button.querySelector('.fa-sun');
                const moonIcon = button.querySelector('.fa-moon');
                if(sunIcon && moonIcon) {
                    sunIcon.classList.toggle('hidden', !isDark);
                    moonIcon.classList.toggle('hidden', isDark);
                }
            }
        });
    };

    const toggleTheme = () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.theme = isDark ? 'dark' : 'light';
        updateToggleUI(isDark);
        logAction('Tema Alterado', 'Interface', `Tema alterado para ${isDark ? 'Escuro' : 'Claro'}`);
        // Re-run header scroll to adjust colours immediately
        handleHeaderScroll(); 
    };

    // Set initial theme based on localStorage or system preference
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        updateToggleUI(true);
    } else {
        document.documentElement.classList.remove('dark');
        updateToggleUI(false);
    }
    
    // Add event listeners
    toggleButtons.forEach(button => {
        if(button) button.addEventListener('click', toggleTheme);
    });
}


export function handleHeaderScroll() {
    const header = document.getElementById('header');
    const currentUser = getCurrentUser();
    if (!currentUser || !header) return;

    const scrolled = window.scrollY > 10;
    header.classList.toggle('header-scrolled', scrolled);
    
    // Color changes based on scroll and theme
    const isDark = document.documentElement.classList.contains('dark');
    
    // Header Background
    if (scrolled) {
         header.classList.remove('bg-transparent');
         header.classList.add('bg-white/95', 'dark:bg-darkbg/95', 'shadow-md'); // Adicionado shadow
    } else {
         header.classList.remove('bg-white/95', 'dark:bg-darkbg/95', 'shadow-md');
         header.classList.add('bg-transparent');
    }
    
    // Text/Logo Colors
    const h1 = header.querySelector('h1');
    const p = header.querySelector('p');
    const mobileButton = document.getElementById('mobile-menu-button');
    const mobileThemeButton = document.getElementById('mobile-theme-toggle');
    const desktopThemeButton = document.getElementById('desktop-theme-toggle');


    h1.classList.toggle('text-white', !scrolled);
    h1.classList.toggle('text-brand-blue', scrolled);
    
    p.classList.toggle('text-slate-300', !scrolled);
    p.classList.toggle('text-gray-500', scrolled && !isDark);
    p.classList.toggle('dark:text-slate-400', scrolled && isDark);

    mobileButton.classList.toggle('text-white', !scrolled);
    mobileButton.classList.toggle('text-brand-text', scrolled && !isDark);
    mobileButton.classList.toggle('dark:text-white', scrolled && isDark);

    mobileThemeButton.classList.toggle('text-white', !scrolled);
    mobileThemeButton.classList.toggle('text-brand-text', scrolled && !isDark);
    mobileThemeButton.classList.toggle('dark:text-white', scrolled && isDark);


    // Ajustando links de navegação para mobile (se estiverem visíveis)
    header.querySelectorAll('nav.hidden a:not(#header-cta-btn)').forEach(link => {
        link.classList.toggle('text-slate-200', !scrolled);
        link.classList.toggle('hover:text-white', !scrolled);
        link.classList.toggle('text-slate-600', scrolled && !isDark);
        link.classList.toggle('hover:text-brand-blue', scrolled);
        link.classList.toggle('dark:text-slate-300', scrolled && isDark);
        link.classList.toggle('dark:hover:text-white', scrolled && isDark);
    });
    
    // Ajustando botão de tema desktop
    desktopThemeButton.classList.toggle('text-slate-200', !scrolled);
    desktopThemeButton.classList.toggle('hover:text-white', !scrolled);
    desktopThemeButton.classList.toggle('text-slate-600', scrolled && !isDark);
    desktopThemeButton.classList.toggle('hover:text-brand-blue', scrolled);
    desktopThemeButton.classList.toggle('dark:text-slate-300', scrolled && isDark);
    desktopThemeButton.classList.toggle('dark:hover:text-white', scrolled && isDark);
}

// --- NOVO: Logging de Atividade de Rolagem para Análise de Engajamento ---

/**
 * Loga a rolagem do usuário a cada 500px, para medir engajamento.
 */
let lastScrollLogPosition = 0;
const SCROLL_LOG_THRESHOLD = 500; // Loga a cada 500 pixels de distância

export function logScroll() {
    // Calcula a posição atual de rolagem vertical
    const currentScrollPosition = window.scrollY || document.documentElement.scrollTop;
    
    // Verifica se a distância percorrida é maior que o threshold
    if (Math.abs(currentScrollPosition - lastScrollLogPosition) >= SCROLL_LOG_THRESHOLD) {
        
        // Determina a direção da rolagem
        const direction = currentScrollPosition > lastScrollLogPosition ? 'Down' : 'Up';
        
        // O log de ação é crucial aqui
        logAction(
            'Rolagem de Conteúdo', 
            'Interface', 
            `Rolou ${direction} para a posição Y: ${currentScrollPosition.toFixed(0)}px`
        );
        
        // Atualiza a última posição registrada
        lastScrollLogPosition = currentScrollPosition;
    }
}

// Inicializa o listener de rolagem (deve ser chamado uma única vez, ex: em main.js)
// window.addEventListener('scroll', logScroll);