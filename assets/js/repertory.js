import { logAction, getDB, getAppId, getRepertories, getCollectionRef, addDoc, updateDoc, deleteDoc, getDocRef, getDocs, writeBatch } from './firebase.js';
import { getCurrentUser, isSuperAdmin } from './auth.js';
import { showFeedback, openConfirmationModal } from './ui.js';

// Configuração da API Gemini - CHAVE OBRIGATORIAMENTE VAZIA
const GEMINI_API_KEY = "AIzaSyA9dNxKWFBESy2BZhB__sT5AAr9ZhFqgJU"; // 🔑 Usando chave vazia para o ambiente Canvas
// *** ATUALIZADO PARA O MODELO PRO (Nome de endpoint correto) ***
const GEMINI_MODEL = "gemini-2.5-pro"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const MAX_RETRIES = 3;

const songFields = [
    { id: 'antes-da-missa', title: 'Antes da Missa' }, { id: 'entrada', title: 'Entrada' }, { id: 'entrada-especial', title: 'Entradas Especiais' },
    { id: 'perdao', title: 'Ato Penitencial' }, { id: 'gloria', title: 'Glória' }, { id: 'salmo', title: 'Salmo Responsorial' },
    { id: 'aclamacao', title: 'Aclamação ao Evangelho' }, { id: 'ofertorio', 'title': 'Ofertório' }, { id: 'santo', title: 'Santo' },
    { id: 'comunhao', title: 'Comunhão' }, { id: 'final', title: 'Final' }, { id: 'adoracao', title: 'Adoração' },
];

let songFieldCounter = 0;

function showGeneratorFeedback(message, isError = true, duration = 4000) {
    // Usamos duration = -1 para feedback que deve ser mantido na tela (e fechado por outra função)
    showFeedback('generator-feedback', message, isError, duration === 0 ? -1 : duration); 
}

function setGeneratorButtonsLoading(isLoading) {
    const buttons = ['generate-pptx-btn', 'generate-pdf-btn', 'save-repertory-btn', 'clear-form-btn', 'clear-repertory-history-btn'];
    buttons.forEach(btnId => {
        const button = document.getElementById(btnId);
        if (!button) return;
        button.disabled = isLoading;
        const icon = button.querySelector('i');
        if (isLoading) {
            if (icon) icon.className = 'fas fa-spinner fa-spin mr-2';
        } else {
            if (icon) {
                const originalIcons = { 
                    'generate-pptx-btn': 'fa-file-powerpoint', 
                    'generate-pdf-btn': 'fa-file-pdf', 
                    'save-repertory-btn': 'fa-save',
                    'clear-form-btn': 'fa-undo',
                    'clear-repertory-history-btn': 'fa-trash-alt'
                };
                icon.className = `fas ${originalIcons[btnId]} mr-2`;
            }
        }
    });
}

// --- Dynamic Song Field Generation ---

function populateSongTypeSelector() {
    const selector = document.getElementById('song-type-selector');
    if (!selector) return;
    selector.innerHTML = songFields
        .map(field => `<option value="${field.title}">${field.title}</option>`)
        .join('') + '<option value="custom">Outro (Personalizado)...</option>';
}

function createSongFieldHTML(title, lyrics = '', link = '') {
    songFieldCounter++;
    const uniqueId = `song-${songFieldCounter}`;
    const currentUser = getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'admin' || isSuperAdmin(currentUser));

    // APLICANDO rounded-3xl no card e rounded-2xl nos elementos internos
    return `
    <div class="dynamic-song-card bg-white dark:bg-darkcard p-5 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xl transition-all duration-300 hover:shadow-2xl hover:ring-2 hover:ring-brand-blue" data-song-title="${title}" draggable="true" id="song-card-${songFieldCounter}">
        
        <div class="flex items-center mb-4 border-b pb-3 border-slate-100 dark:border-slate-700">
            
            <!-- Ícone de Arrastar (Drag Handle) -->
            <span class="drag-handle-icon text-slate-400 dark:text-slate-600 mr-4 cursor-grab admin-only-input-area ${!isAdmin ? 'hidden' : ''}" title="Arraste para reordenar">
                <i class="fas fa-grip-lines-vertical text-2xl"></i>
            </span>

            <!-- Título (com flex-grow) -->
            <input type="text" value="${title}" class="song-title-input text-2xl font-extrabold text-brand-text dark:text-white flex-grow bg-transparent border-0 p-0 focus:outline-none focus:ring-0 placeholder-gray-500 disabled:cursor-auto" ${!isAdmin ? 'disabled' : ''}>
            
            <!-- Botão de Remover -->
            <button type="button" class="remove-song-btn text-red-600 hover:text-white bg-red-100 hover:bg-red-700 font-semibold transition-all duration-200 p-2 rounded-2xl shadow-md admin-only-input transform hover:scale-110 ml-4" title="Remover Cântico" ${!isAdmin ? 'disabled' : ''}>
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
        <div class="space-y-4">
            <div class="border-l-4 border-brand-blue/50 pl-3">
                <label for="lyrics-${uniqueId}" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Letra</label>
                <!-- NOTE: Usamos font-mono para alinhar cifras quando elas estão presentes -->
                <textarea id="lyrics-${uniqueId}" rows="4" class="lyrics-input admin-only-input mt-1 block w-full rounded-2xl border-slate-300 dark:border-slate-600 bg-brand-light-gray dark:bg-slate-700 text-slate-900 dark:text-white shadow-inner focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition-colors p-3 font-mono" ${!isAdmin ? 'disabled' : ''}>${lyrics}</textarea>
            </div>
            <div class="border-l-4 border-slate-500/50 pl-3">
                <label for="link-${uniqueId}" class="block text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Link (YouTube/Spotify)</label>
                <input type="url" id="link-${uniqueId}" value="${link}" class="link-input admin-only-input mt-1 block w-full rounded-2xl border-slate-300 dark:border-slate-600 bg-brand-light-gray dark:bg-slate-700 text-slate-900 dark:text-white shadow-inner focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition-colors text-sm p-3" placeholder="https://..." ${!isAdmin ? 'disabled' : ''}>
            </div>
        </div>
        <!-- Contêiner AI/Gemini será anexado aqui por attachGeminiButtons -->
    </div>
    `;
}

function getSongDataFromForm() {
    const songCards = document.querySelectorAll('#dynamic-song-fields-container .dynamic-song-card');
    
    const songs = Array.from(songCards).map((card) => {
        const title = card.querySelector('.song-title-input').value.trim();
        const lyrics = card.querySelector('.lyrics-input').value.trim();
        const link = card.querySelector('.link-input').value.trim();
        return { title, lyrics, link };
    });

    const dateInput = document.getElementById('mass-date').value;
    const theme = document.getElementById('mass-theme').value.trim();
    const id = document.getElementById('repertory-id').value;
    const isPrivate = document.getElementById('repertory-private-toggle')?.checked || false;
    const createdBy = document.getElementById('repertory-created-by').value;

    return { id, songs, theme, date: dateInput, isPrivate, createdBy };
}

export function clearRepertoryForm() {
    document.getElementById('pptx-form').reset();
    document.getElementById('repertory-id').value = '';
    document.getElementById('repertory-created-by').value = '';
    document.getElementById('mass-date').value = new Date().toISOString().split('T')[0];
    
    const container = document.getElementById('dynamic-song-fields-container');
    if (container) container.innerHTML = '';
    songFieldCounter = 0;

    const privacyToggle = document.getElementById('repertory-private-toggle');
    const privacyLabel = document.getElementById('repertory-privacy-label');
    if (privacyToggle) {
        privacyToggle.checked = false;
        privacyLabel.textContent = 'Este repertório é Público (visível para todos).';
    }

    const viewTabBtn = document.querySelector('[data-tab="visualizar"]');
    if (viewTabBtn) {
        viewTabBtn.classList.add('hidden');
    }
}

// --- Generator UI & Event Listeners ---

export function setupGeneratorModalForUser() {
    const currentUser = getCurrentUser();
    const isAdmin = currentUser && (currentUser.role === 'admin' || isSuperAdmin(currentUser));
    const modal = document.getElementById('pptx-generator-modal');
    if (!modal) return;
    
    const montarTabBtn = modal.querySelector('[data-tab="montar"]');
    const historicoTabBtn = modal.querySelector('[data-tab="historico"]');
    const actions = modal.querySelector('#generator-actions');
    const formInputs = modal.querySelectorAll('.admin-only-input');
    // Corrigido para incluir o drag handle e o container da IA
    const adminInputAreas = modal.querySelectorAll('.admin-only-input-area'); 
    const clearHistoryBtn = document.getElementById('clear-repertory-history-btn');

    if (clearHistoryBtn) {
        clearHistoryBtn.style.display = isAdmin ? '' : 'none';
    }
    
    if (isAdmin) {
        montarTabBtn.classList.remove('hidden');
        actions.classList.remove('hidden');
        formInputs.forEach(input => input.disabled = false);
        adminInputAreas.forEach(area => area.classList.remove('hidden'));
        clearRepertoryForm(); 
        montarTabBtn.click();
    } else {
        montarTabBtn.classList.add('hidden');
        actions.classList.add('hidden');
        formInputs.forEach(input => input.disabled = true);
        adminInputAreas.forEach(area => area.classList.add('hidden'));
        // Membros comuns devem ver o Histórico por padrão
        historicoTabBtn.click();
    }
    
    // Força a renderização do histórico na abertura do modal.
    renderRepertoryHistory();

    // Initialize privacy toggle listener
    const privacyToggle = document.getElementById('repertory-private-toggle');
    const privacyLabel = document.getElementById('repertory-privacy-label');
    if (privacyToggle && !privacyToggle.hasAttribute('data-listener-attached')) {
        privacyToggle.addEventListener('change', () => {
            privacyLabel.textContent = privacyToggle.checked ? 'Este repertório é Privado (visível apenas para você e Super Admin).' : 'Este repertório é Público (visível para todos).';
        });
        privacyToggle.setAttribute('data-listener-attached', 'true');
    }
}


export function initializeGeneratorEventListeners() {
    populateSongTypeSelector();

    // Add Song button logic
    document.getElementById('add-song-btn')?.addEventListener('click', () => {
        const selector = document.getElementById('song-type-selector');
        const customInput = document.getElementById('custom-song-type-input');
        if (!selector || !customInput) return;

        let songType = selector.value;
        if (songType === 'custom') {
            songType = customInput.value.trim();
            if (!songType) {
                showGeneratorFeedback("Por favor, digite um nome para o cântico personalizado.", true);
                return;
            }
        }
        
        const container = document.getElementById('dynamic-song-fields-container');
        // Usar a versão aprimorada da função HTML
        container.insertAdjacentHTML('beforeend', createSongFieldHTML(songType));
        attachGeminiButtons(); // Garante que o botão da IA seja anexado ao novo card

        // Reset selector UI
        const selectorWrapper = document.getElementById('song-type-selector-wrapper');
        const customInputWrapper = document.getElementById('custom-song-type-wrapper');
        selector.value = songFields[0]?.title || '';
        selectorWrapper.classList.remove('hidden');
        customInputWrapper.classList.add('hidden');
        customInput.value = '';
    });

    // Custom song type visibility toggle
    const songTypeSelector = document.getElementById('song-type-selector');
    if (songTypeSelector) {
        songTypeSelector.addEventListener('change', () => {
            const customInputWrapper = document.getElementById('custom-song-type-wrapper');
            const selectorWrapper = document.getElementById('song-type-selector-wrapper');
            if (songTypeSelector.value === 'custom') {
                selectorWrapper.classList.add('hidden');
                customInputWrapper.classList.remove('hidden');
                document.getElementById('custom-song-type-input').focus();
            } else {
                selectorWrapper.classList.remove('hidden');
                customInputWrapper.classList.add('hidden');
            }
        });
    }

    // Remove song button logic (Delegated)
    document.getElementById('dynamic-song-fields-container')?.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-song-btn');
        if (removeBtn) {
            removeBtn.closest('.dynamic-song-card').remove();
        }
    });
    
    // Generator action buttons
    document.getElementById('save-repertory-btn')?.addEventListener('click', saveRepertory);
    document.getElementById('clear-repertory-history-btn')?.addEventListener('click', clearAllRepertories);
    // *** CORREÇÃO: Chama as funções sem parâmetro, pois elas lerão o formulário ***
    document.getElementById('generate-pptx-btn')?.addEventListener('click', () => generatePptx());
    document.getElementById('generate-pdf-btn')?.addEventListener('click', () => generatePdf());
    document.getElementById('clear-form-btn')?.addEventListener('click', () => clearRepertoryForm());

    // Tab switching logic
    const tabsContainer = document.getElementById('generator-tabs');
    tabsContainer?.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.generator-tab-btn');
        if (!targetButton) return;
        
        const tabName = targetButton.dataset.tab;
        if (tabName === 'visualizar' && targetButton.classList.contains('hidden')) return; 
        
        tabsContainer.querySelectorAll('.generator-tab-btn').forEach(btn => btn.classList.remove('active'));
        targetButton.classList.add('active');
        
        document.querySelectorAll('.generator-tab-pane').forEach(pane => {
            pane.classList.toggle('hidden', pane.id !== `tab-${tabName}`);
        });

        // Garante que o histórico seja renderizado quando a aba Histórico é clicada.
        if (tabName === 'historico') {
            renderRepertoryHistory();
        }
    });

    // History interaction logic
    const historyContentDiv = document.getElementById('repertory-history-content');
    historyContentDiv?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('.edit-repertory-btn')) {
            loadRepertoryForEditing(target.closest('.edit-repertory-btn').dataset.id);
        } else if (target.closest('.view-repertory-btn')) {
            loadRepertoryForViewing(target.closest('.view-repertory-btn').dataset.id);
        } else if (target.closest('.delete-repertory-btn')) {
            deleteRepertory(target.closest('.delete-repertory-btn').dataset.id);
        
        // *** NOVO: Adicionar listeners para os novos botões de geração direta ***
        } else if (target.closest('.generate-pdf-from-history-btn')) {
            const id = target.closest('.generate-pdf-from-history-btn').dataset.id;
            const repertoryData = getRepertories().find(r => r.id === id);
            if (repertoryData) {
                generatePdf(repertoryData); // Passa o objeto de dados
            }
        } else if (target.closest('.generate-pptx-from-history-btn')) {
            const id = target.closest('.generate-pptx-from-history-btn').dataset.id;
            const repertoryData = getRepertories().find(r => r.id === id);
            if (repertoryData) {
                generatePptx(repertoryData); // Passa o objeto de dados
            }
        }
    });

    // --- Início da Lógica de Drag and Drop (Desktop + Mobile) ---
    const songContainer = document.getElementById('dynamic-song-fields-container');
    let draggedItem = null;

    // Adicionando CSS para o Dragging Visual
    const style = document.createElement('style');
    style.textContent = `
        .dynamic-song-card.dragging-visual {
            opacity: 0.3;
            transform: scale(0.95); 
            transition: none; /* Desabilita transição durante o drag visual */
        }
        .dynamic-song-card.drag-over-top {
            border-top: 4px solid var(--brand-blue-color, #29aae2); 
        }
        .dynamic-song-card.drag-over-bottom {
            border-bottom: 4px solid var(--brand-blue-color, #29aae2); 
        }
        .lyrics-input {
             /* Fonte monoespaçada para alinhar cifras */
            font-family: 'Consolas', 'Courier New', monospace;
        }
        .accordion-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }
        .accordion-content > div {
            padding-top: 0;
            padding-bottom: 0;
            transition: padding-top 0.3s ease-out, padding-bottom 0.3s ease-out;
        }
        .accordion-header.active .fa-chevron-down {
            transform: rotate(180deg);
        }
    `;
    document.head.appendChild(style);

    if (songContainer) {
        
        // --- Funções Auxiliares de D&D ---

        const clearDragFeedback = () => {
            Array.from(songContainer.children).forEach(child => 
                child.classList.remove('drag-over-top', 'drag-over-bottom')
            );
        };

        const handleDragOver = (currentY, targetCard) => {
            if (!targetCard || targetCard === draggedItem) return;

            clearDragFeedback(); 

            const rect = targetCard.getBoundingClientRect();
            // 50% threshold
            const isNearBottom = (currentY - rect.top) / rect.height > 0.5;
            
            if (isNearBottom) {
                targetCard.classList.add('drag-over-bottom');
            } else {
                targetCard.classList.add('drag-over-top');
            }
        };

        const handleDrop = () => {
            if (!draggedItem) return;

            const dropTarget = songContainer.querySelector('.drag-over-top, .drag-over-bottom');

            if (dropTarget && dropTarget !== draggedItem) {
                const isDroppedBefore = dropTarget.classList.contains('drag-over-top');
                
                if (isDroppedBefore) {
                    songContainer.insertBefore(draggedItem, dropTarget);
                } else {
                    songContainer.insertBefore(draggedItem, dropTarget.nextSibling);
                }
                showGeneratorFeedback('Ordem do cântico atualizada.', false, 2000);
            }
            
            clearDragFeedback(); 
        };

        const handleDragEnd = () => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging-visual');
            }
            draggedItem = null;
            clearDragFeedback();
        };

        // --- Eventos de MOUSE (Desktop) ---

        songContainer.addEventListener('dragstart', (e) => {
            // Verifica se o drag handle (ou o card, excluindo inputs) foi clicado
            const isInput = e.target.closest('input, textarea, button');
            const isHandle = e.target.closest('.drag-handle-icon');
            
            if (e.target.closest('.dynamic-song-card') && (isHandle || !isInput)) {
                draggedItem = e.target.closest('.dynamic-song-card');
                setTimeout(() => draggedItem.classList.add('dragging-visual'), 0);
                e.dataTransfer.effectAllowed = 'move';
            } else {
                 // Previne o drag se for um input/textarea e o drag não foi iniciado pelo handle
                 if (isInput) e.preventDefault(); 
            }
        });

        songContainer.addEventListener('dragover', (e) => {
            e.preventDefault(); // Necessário para permitir o drop
            if (!draggedItem) return;
            const target = e.target.closest('.dynamic-song-card');
            handleDragOver(e.clientY, target); 
        });

        songContainer.addEventListener('dragenter', (e) => e.preventDefault());

        songContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            handleDrop();
            handleDragEnd(); 
        });

        songContainer.addEventListener('dragend', handleDragEnd);
        
        songContainer.addEventListener('dragleave', (e) => {
            const target = e.target.closest('.dynamic-song-card');
            if (target) {
                target.classList.remove('drag-over-top', 'drag-over-bottom');
            }
        });

        // --- Eventos de TOQUE (Mobile) ---
        let touchStartCard = null;

        songContainer.addEventListener('touchstart', (e) => {
            // Inicia o drag apenas se o toque for no drag handle
            if (e.target.closest('.drag-handle-icon')) {
                 touchStartCard = e.target.closest('.dynamic-song-card');
                 if (touchStartCard) {
                     draggedItem = touchStartCard;
                     draggedItem.classList.add('dragging-visual');
                 }
            }
        }, { passive: true });

        songContainer.addEventListener('touchmove', (e) => {
            if (!draggedItem) return;
            
            e.preventDefault(); 

            const touch = e.touches[0];
            const elementOver = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetCard = elementOver ? elementOver.closest('.dynamic-song-card') : null;
            
            handleDragOver(touch.clientY, targetCard); 
        }, { passive: false });

        songContainer.addEventListener('touchend', (e) => {
            if (!draggedItem) return;
            handleDrop();
            handleDragEnd(); 
        });

        songContainer.addEventListener('touchcancel', (e) => {
            handleDragEnd(); 
        });
    }
    // --- Fim da Lógica de Drag and Drop ---
}

// --- Data Persistence and Loading ---

async function saveRepertory() {
    const currentUser = getCurrentUser();
    // Adiciona feedback se não for Admin
    if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) {
        showGeneratorFeedback("Você não tem permissão de administrador para salvar repertórios.", true);
        return;
    }

    const dataToSave = getSongDataFromForm();
    if (!dataToSave.date) {
        showGeneratorFeedback("A data da missa é obrigatória para salvar.", true);
        return;
    }
    
    setGeneratorButtonsLoading(true);
    // Usamos duration = -1 para manter a mensagem de loading visível
    showGeneratorFeedback("Salvando repertório...", false, -1); 

    const repertoryId = dataToSave.id;
    const isUpdating = !!repertoryId;
    
    const existingRepertory = getRepertories().find(r => r.id === repertoryId);
    
    // Set createdBy (preserve if updating, set if creating)
    dataToSave.createdBy = existingRepertory ? existingRepertory.createdBy : currentUser.username;

    delete dataToSave.id;

    const appId = getAppId();
    const repertoryCol = getCollectionRef(`artifacts/${appId}/public/data/repertory`);
    let savedId = repertoryId;

    try {
        const action = isUpdating ? 'Repertório Atualizado' : 'Repertório Criado';
        const details = `${dataToSave.theme || 'Repertório'} de ${dataToSave.date}`;

        if (isUpdating) {
            const repertoryRef = getDocRef(`artifacts/${appId}/public/data/repertory`, repertoryId);
            await updateDoc(repertoryRef, dataToSave);
            showGeneratorFeedback("Repertório atualizado com sucesso!", false);
        } else {
            const newDocRef = await addDoc(repertoryCol, dataToSave);
            savedId = newDocRef.id;
            showGeneratorFeedback("Salvo! Clique em 'Novo' para criar outro.", false, 6000);
        }
        logAction(action, 'Gerador de Repertório', details);
        loadRepertoryForViewing(savedId);
    } catch (error) {
        console.error("Erro ao salvar repertório: ", error);
        showGeneratorFeedback("Erro ao salvar o repertório.", true);
    } finally {
        setGeneratorButtonsLoading(false);
    }
}

async function clearAllRepertories() {
    const currentUser = getCurrentUser();
    if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) return;

    openConfirmationModal(
        "Tem certeza que deseja apagar TODO o histórico de repertórios? Esta ação é irreversível.",
        async () => {
            setGeneratorButtonsLoading(true);
            showGeneratorFeedback("Limpando histórico...", false, -1); // -1 to keep visible
            try {
                const db = getDB();
                const appId = getAppId();
                const repertoryCol = getCollectionRef(`artifacts/${appId}/public/data/repertory`);
                const snapshot = await getDocs(repertoryCol);
                const batch = writeBatch(db);
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                logAction('Limpou Histórico de Repertórios', 'Gerador de Repertório');
                showGeneratorFeedback("Histórico de repertórios limpo com sucesso.", false);
            } catch (error) {
                console.error("Error clearing repertory history: ", error);
                showGeneratorFeedback("Erro ao limpar o histórico.", true);
            } finally {
                setGeneratorButtonsLoading(false);
            }
        }
    );
}

export function renderRepertoryHistory() {
    const contentDiv = document.getElementById('repertory-history-content');
    const allRepertories = getRepertories();
    const currentUser = getCurrentUser();
    if (!contentDiv || !currentUser) return;

    const isCurrentUserSuperAdmin = isSuperAdmin(currentUser);
    const isAdmin = currentUser.role === 'admin' || isCurrentUserSuperAdmin;

    // Lógica de filtro para garantir que os repertórios sejam visíveis.
    const filteredRepertories = allRepertories.filter(rep => {
        // Se isPrivate não estiver definido ou for explicitamente false, é público.
        if (!rep.isPrivate || rep.isPrivate === false) return true; 
        
        // Se for privado, só mostra para o criador OU Super Admin.
        return (rep.createdBy === currentUser.username) || isCurrentUserSuperAdmin;
    });

    if (filteredRepertories.length === 0) {
        contentDiv.innerHTML = `<div class="text-center text-slate-500 dark:text-slate-400 py-10"><i class="fas fa-history fa-3x mb-3"></i><p>Nenhum repertório salvo encontrado.</p></div>`;
        return;
    }

    contentDiv.innerHTML = filteredRepertories.map(rep => {
        const formattedDate = rep.date ? new Date(rep.date + 'T00:00:00').toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric'}) : 'Sem data';
        const title = rep.theme || `Celebração de ${formattedDate}`;
        
        const isCreator = currentUser && rep.createdBy === currentUser.username;
        const canEditOrDelete = isAdmin && (isCreator || isCurrentUserSuperAdmin);

        // OBTENDO O NOME COMPLETO DO CRIADOR A PARTIR DO USERNAME
        const creatorName = rep.createdBy ? rep.createdBy.split('@')[0].toUpperCase() : 'Desconhecido';
        
        // *** CORREÇÃO: BOTÕES DE AÇÃO AGORA SÃO APENAS ÍCONES GRANDES ***
        
        // Botões de Geração e Visualização (para todos)
        const viewAndGenerationButtons = `
            <!-- Botão VISUALIZAR (ícone) -->
            <button data-id="${rep.id}" class="view-repertory-btn text-sky-600 hover:text-sky-800 transition-colors p-2 rounded-full" title="Visualizar roteiro">
                <i class="fas fa-eye fa-lg"></i>
            </button>
            
            ${isAdmin ? `
            <!-- Botão GERAR PDF (ícone) -->
            <button data-id="${rep.id}" class="generate-pdf-from-history-btn text-red-600 hover:text-red-800 transition-colors p-2 rounded-full" title="Gerar PDF deste repertório">
                <i class="fas fa-file-pdf fa-lg"></i>
            </button>
           <!-- Botão GERAR PPTX (ícone) -->
            <button data-id="${rep.id}" class="generate-pptx-from-history-btn transition-colors p-2 rounded-full" title="Gerar PPTX deste repertório" style="color:#29aae2;">
                <i class="fas fa-file-powerpoint fa-lg"></i>
            </button>
            ` : ''}
        `;

        // Botões de Edição e Exclusão (Apenas para Admin/Criador)
        const adminButtons = canEditOrDelete ? `
            <!-- Botão EDITAR (ícone) -->
            <button data-id="${rep.id}" class="edit-repertory-btn text-slate-600 hover:text-slate-800 transition-colors p-2 rounded-full" title="Editar repertório">
                <i class="fas fa-edit fa-lg"></i>
            </button>
            <!-- Botão EXCLUIR (ícone) -->
            <button data-id="${rep.id}" class="delete-repertory-btn text-red-500 hover:text-red-700 text-lg p-2 transition-colors" title="Excluir">
                <i class="fas fa-trash-alt fa-lg"></i>
            </button>
        ` : '';
        
        const privacyTag = rep.isPrivate ? '<span class="ml-2 px-2 py-0.5 text-xs font-semibold rounded-2xl bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 shadow-sm"><i class="fas fa-lock mr-1"></i>Privado</span>' : '';

        return `
            <div class="bg-white dark:bg-darkcard p-4 rounded-3xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4 shadow-xl hover:shadow-2xl transition-all duration-300">
                <div class="truncate">
                    <p class="font-bold text-brand-text dark:text-white truncate">${title}${privacyTag}</p>
                    <p class="text-sm text-slate-500 dark:text-slate-400">
                        <i class="fas fa-calendar-alt mr-1"></i> ${formattedDate} 
                        <span class="ml-3 text-xs italic text-brand-blue/70"><i class="fas fa-user-circle mr-1"></i>por ${creatorName}</span>
                    </p>
                </div>
                <!-- Agrupando todos os botões de ação -->
                <div class="flex items-center gap-1 flex-shrink-0">
                    ${viewAndGenerationButtons}
                    ${adminButtons}
                </div>
            </div>
        `;
    }).join('');
}


function loadRepertoryForEditing(repertoryId) {
    const repertory = getRepertories().find(r => r.id === repertoryId);
    if (!repertory) return;
    
    clearRepertoryForm();

    const form = document.getElementById('pptx-form');
    form['mass-date'].value = repertory.date || '';
    form['mass-theme'].value = repertory.theme || '';
    document.getElementById('repertory-id').value = repertoryId;
    document.getElementById('repertory-created-by').value = repertory.createdBy || '';

    const container = document.getElementById('dynamic-song-fields-container');
    if (repertory.songs && container) {
        repertory.songs.forEach(song => {
            container.insertAdjacentHTML('beforeend', createSongFieldHTML(song.title, song.lyrics, song.link));
        });
        attachGeminiButtons(); // Garante que os botões da IA sejam anexados aos cards carregados
    }

    const privacyToggle = document.getElementById('repertory-private-toggle');
    const privacyLabel = document.getElementById('repertory-privacy-label');
    const currentUser = getCurrentUser(); // Obtém o usuário atual novamente
    const isCurrentUserSuperAdmin = isSuperAdmin(currentUser);
    const isCreator = currentUser && repertory.createdBy === currentUser.username;

    if (privacyToggle) {
        privacyToggle.checked = repertory.isPrivate || false;
        privacyLabel.textContent = privacyToggle.checked ? 'Este repertório é Privado (visível apenas para você e Super Admin).' : 'Este repertório é Público (visível para todos).';
        privacyToggle.disabled = !(isCreator || isCurrentUserSuperAdmin);
    }
    
    document.querySelector('[data-tab="montar"]').click();
    showGeneratorFeedback(`Repertório "${repertory.theme || repertory.date}" carregado para edição.`, false);
}

function loadRepertoryForViewing(repertoryId) {
    const repertory = getRepertories().find(r => r.id === repertoryId);
    let repertoryData;
    
    if (!repertory) {
        repertoryData = getSongDataFromForm();
        if (!repertoryData.date && repertoryData.songs.length === 0) return; // Cannot view empty form
    } else {
        repertoryData = repertory;
    }
    
    renderSingleRepertoryView(repertoryData);
    
    const viewTabBtn = document.querySelector('[data-tab="visualizar"]');
    viewTabBtn.classList.remove('hidden');
    viewTabBtn.click();
}

function renderSingleRepertoryView(repertoryData) {
    const contentDiv = document.getElementById('repertory-viewer-content');
    if (!contentDiv) return;

    const { songs, theme, date, createdBy } = repertoryData;
    const songsWithContent = songs ? songs.filter(s => s.lyrics || s.link) : [];
    
    // CORREÇÃO: Usar o nome do criador do repertório, ou o usuário atual se for um repertório novo
    const currentUser = getCurrentUser();
    const creatorUsername = createdBy || (currentUser ? currentUser.username : '');
    const creatorName = creatorUsername ? creatorUsername.split('@')[0].toUpperCase() : 'Desconhecido';

    if (songsWithContent.length === 0) {
        contentDiv.innerHTML = `<div class="text-center text-slate-500 dark:text-slate-400 py-10"><i class="fas fa-music fa-3x mb-3"></i><p>Este roteiro de cânticos não contém letras ou links de mídia.</p></div>`;
        return;
    }

    const formattedDate = date ? new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric'}) : '';

    let html = `<div class="text-center mb-6">
                            <h3 class="text-3xl font-bold text-brand-text dark:text-white">Roteiro de Cânticos</h3>
                            <p class="text-brand-blue font-semibold text-xl">${theme || formattedDate}</p>
                            <p class="text-sm italic text-slate-500 dark:text-slate-400 mt-1">Criado por: ${creatorName}</p>
                        </div>
                        <div id="repertory-accordion" class="space-y-4">`;

    songsWithContent.forEach((song, index) => {
        const embedHtml = getEmbedHtml(song.link);
        const lyricContent = song.lyrics || 'Letra não disponível.';
        
        html += `
            <div class="accordion-item bg-white dark:bg-darkcard rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl hover:shadow-2xl transition-shadow">
                <button id="header-${index}" class="accordion-header w-full flex justify-between items-center text-left p-5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors focus:outline-none border-l-4 border-brand-blue">
                    <span class="font-bold text-xl text-brand-text dark:text-white">${song.title}</span>
                    <i class="fas fa-chevron-down transition-transform text-brand-blue text-lg"></i>
                </button>
                <div class="accordion-content" aria-labelledby="header-${index}" role="region">
                   <div class="p-6 border-t border-slate-200 dark:border-slate-600 bg-brand-light-gray dark:bg-darkcard">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            <div class="lyrics-container">
                                <h5 class="font-bold text-brand-blue mb-3 text-center text-md uppercase tracking-wider border-b pb-1"><i class="fas fa-file-alt mr-1"></i> Letra e Cifras</h5>
                                <pre class="text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono text-base leading-relaxed text-left p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-inner border border-slate-200 dark:border-slate-700">${lyricContent}</pre>
                            </div>
                            <div class="player-container">
                                <h5 class="font-bold text-brand-blue mb-3 text-center text-md uppercase tracking-wider border-b pb-1"><i class="fas fa-headphones-alt mr-1"></i> Mídia (Player)</h5>
                                ${embedHtml}
                            </div>
                        </div>
                   </div>
                </div>
            </div>`;
    });

    html += `</div>`;
    contentDiv.innerHTML = html;
    
    // Lógica de Acordeão com transição de altura
    contentDiv.querySelectorAll('.accordion-header').forEach(button => {
        button.addEventListener('click', () => {
            const content = button.nextElementSibling;
            const contentInner = content.querySelector('div');
            
            // Toggle active class on header for rotation and state
            button.classList.toggle('active');
            
            if (content.style.maxHeight && content.style.maxHeight !== '0px') {
                // Fechando
                content.style.maxHeight = '0px';
                // Remove padding da div interna
                contentInner.style.paddingTop = '0';
                contentInner.style.paddingBottom = '0';
            } else {
                // Abrindo
                // Adiciona padding no contentInner ANTES de medir o scrollHeight
                contentInner.style.paddingTop = '1.5rem';
                contentInner.style.paddingBottom = '1.5rem';
                
                // Mede o scrollHeight do conteúdo interno e aplica no wrapper
                content.style.maxHeight = contentInner.scrollHeight + "px"; 
                // Nota: O scrollHeight é medido apenas depois que o padding é aplicado.
            }
        });
    });
}

async function deleteRepertory(repertoryId) {
    const currentUser = getCurrentUser();
    if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) return;

    openConfirmationModal(
        "Tem certeza que deseja excluir este repertório? Esta ação não pode ser desfeita.",
        async () => {
            setGeneratorButtonsLoading(true);
            showGeneratorFeedback("Excluindo...", false, -1); // -1 to keep visible
            try {
                const appId = getAppId();
                const repertoryRef = getDocRef(`artifacts/${appId}/public/data/repertory`, repertoryId);
                const repertoryToDelete = getRepertories().find(r => r.id === repertoryId);

                await deleteDoc(repertoryRef);

                logAction('Repertório Excluído', 'Gerador de Repertório', `Excluído: ${repertoryToDelete.theme || repertoryToDelete.date}`);
                showGeneratorFeedback("Repertório excluído.", false);
            } catch (error) {
                console.error("Erro ao excluir repertório: ", error);
                showGeneratorFeedback("Erro ao excluir repertório.", true);
            } finally {
                setGeneratorButtonsLoading(false);
            }
        }
    );
}

// --- File Generation Logic ---

// *** NOVO: Aceita repertoryData opcional ***
async function generatePptx(repertoryData = null) {
    setGeneratorButtonsLoading(true);
    showGeneratorFeedback('Gerando PPTX, por favor aguarde...', false, -1);

    try {
        // *** LÓGICA DE DECISÃO: Usar dados do parâmetro ou do formulário ***
        const data = repertoryData ? repertoryData : getSongDataFromForm();
        const { songs, theme, date, createdBy } = data;
        
        const songsWithLyrics = songs.filter(s => s.lyrics);
        
        const currentUser = getCurrentUser();
        if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) {
            showGeneratorFeedback("Você não tem permissão de administrador para gerar arquivos.", true);
            setGeneratorButtonsLoading(false); // Libera o botão se a permissão falhar
            return;
        }

        if (songsWithLyrics.length === 0) {
            showGeneratorFeedback('Nenhum cântico preenchido para gerar o PPTX.', true);
            setGeneratorButtonsLoading(false);
            return;
        }

        // Verifica se PptxGenJS está disponível
        if (typeof PptxGenJS === 'undefined') {
            showGeneratorFeedback('Erro: A biblioteca PptxGenJS não está carregada.', true);
            return;
        }

        let pptx = new PptxGenJS();
        const formattedDate = date ? new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric'}) : '';
        
        // CORREÇÃO "CRIADO POR"
        const creatorUsername = createdBy || (currentUser ? currentUser.username : '');
        const creatorName = creatorUsername ? creatorUsername.split('@')[0].toUpperCase() : 'Desconhecido';
        
        // Define o layout widescreen
        pptx.defineLayout({ name: 'SONG_LAYOUT', width: 16, height: 9 });
        pptx.defineSlideMaster({
            title: 'SONG_MASTER',
            background: { color: '000000' },
            objects: [
                { 'text': { text: `Ministério Uziel (Criado por: ${creatorName})`, options: { x: 0.5, y: 8.2, w: '90%', fontFace: 'Poppins', fontSize: 14, color: 'FFFFFF', align: 'left', opacity: 0.7 } } },
                { 'text': { text: formattedDate, options: { x: 0.5, y: 8.2, w: '90%', fontFace: 'Poppins', fontSize: 14, color: 'FFFFFF', align: 'right', opacity: 0.7 } } },
            ],
        });

        let titleSlide = pptx.addSlide({ masterName: 'SONG_MASTER' });
        titleSlide.addText('Cânticos da Celebração', { y: '40%', w: '100%', h: 1, align: 'center', fontFace: 'Poppins', fontSize: 44, color: 'FFFFFF', bold: true });
        if(theme) {
            titleSlide.addText(theme, { y: '55%', w: '100%', h: 1, align: 'center', fontFace: 'Poppins', fontSize: 32, color: '29aae2' });
        }

        // *** CORREÇÃO DE LAYOUT: MUDANÇA DE 3 PARA 2 SEGMENTOS ***
        const segmentsPerSlide = 2; // Mantido em 2

        songsWithLyrics.forEach(song => {
            // Lógica para separar cifras (envolvidas em **) da letra
            const lines = song.lyrics.split('\n');
            const songSegments = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === '') continue; // Ignora linhas vazias

                // *** CORREÇÃO DE LÓGICA DE CIFRA/LETRA ***
                // A linha é cifra SE: ela bate o regex de **...** E a próxima linha existe E a próxima linha NÃO é vazia
                const chordMatch = line.match(/^\*\*(.*)\*\*$/); 

                if (chordMatch && i + 1 < lines.length && lines[i+1].trim() !== '') {
                    // É um par Cifra/Letra
                    const chordLine = chordMatch[1].trim(); // Pega o conteúdo DENTRO dos **
                    const lyricLine = lines[i+1].trim();
                    songSegments.push({ chords: chordLine, lyrics: lyricLine.replace(/\*\*/g, '') }); // Remove ** da letra
                    i++; // Pula a próxima linha que foi usada como letra
                } else {
                    // É uma linha de letra (remove qualquer negrito que o usuário tenha colocado)
                    songSegments.push({ chords: null, lyrics: line.replace(/\*\*/g, '') });
                }
            }
            
            // Lógica de paginação em slides
            for (let i = 0; i < songSegments.length; i += segmentsPerSlide) {
                const chunk = songSegments.slice(i, i + segmentsPerSlide);
                let slide = pptx.addSlide({ masterName: 'SONG_MASTER' });

                let slideTitle = song.title.toUpperCase();
                const totalSlidesForSong = Math.ceil(songSegments.length / segmentsPerSlide);
                const currentSlideIndex = (i / segmentsPerSlide) + 1;
                
                if (totalSlidesForSong > 1) {
                    slideTitle += ` (${currentSlideIndex}/${totalSlidesForSong})`;
                }
                
                // Adiciona título do cântico no topo
                slide.addText(slideTitle, { 
                    x: 0, y: 0.3, w: '100%', h: 1, 
                    align: 'center',
                    fontFace: 'Poppins', fontSize: 28, color: '29aae2', bold: true 
                });
                
                // *** CORREÇÃO: Lógica de Posição Y e Altura do PPTX ***
                
                let currentY = 1.5; // Posição Y inicial para o primeiro segmento
                
                // *** AJUSTE DE TAMANHO/ESPAÇAMENTO PARA EVITAR TRANSBORDAMENTO ***
                const chordFontSize = 16; // Reduzido de 18
                const lyricFontSize = 26; // Reduzido de 28
                const segmentSpacing = 3.0; // Reduzido de 3.3 (Espaço total para um Cifra+Letra)
                const chordBoxHeight = 0.4; // Reduzido de 0.5

                chunk.forEach(segment => {
                    if (segment.chords) {
                        // Adiciona Cifra
                        slide.addText(segment.chords.toUpperCase(), { 
                            x: 0.5, y: currentY, w: '90%', h: chordBoxHeight, // Aplicado
                            fontFace: 'Poppins', fontSize: chordFontSize, // Aplicado
                            color: '29aae2', 
                            align: 'center',
                            valign: 'top', 
                            bold: true,
                        });
                    }
                    
                    if (segment.lyrics) {
                         // Adiciona Letra
                         const lyricY = segment.chords ? (currentY + chordBoxHeight) : currentY;
                         const effectiveLyricHeight = segment.chords ? (segmentSpacing - chordBoxHeight) : segmentSpacing; // Agora é 2.6 ou 3.0

                        slide.addText(segment.lyrics, { 
                            x: 0.5, y: lyricY, w: '90%', h: effectiveLyricHeight, // Aplicado
                            fontFace: 'Poppins', fontSize: lyricFontSize, // Aplicado
                            color: 'FFFFFF', 
                            align: 'center',
                            valign: 'top', 
                            bold: true,
                            fit: true // ESSENCIAL: Encolhe o texto para caber na altura
                        });
                    }
                    
                    // Avance Y para o PRÓXIMO segmento
                    currentY += segmentSpacing; // Aplicado
                });
            }
        });


        const fileNameDate = date || 'data';
        const filename = `Canticos_Uziel_${theme.replace(/\s+/g, '_') || fileNameDate}.pptx`;
        await pptx.writeFile({ fileName: filename });
        logAction('Gerou PPTX', 'Gerador de Repertório', `PPTX gerado para ${theme || formattedDate}`);
        showGeneratorFeedback('PPTX gerado com sucesso! Verifique seus downloads.', false);

    } catch (error) {
        console.error("Erro ao gerar PPTX:", error);
        showGeneratorFeedback('Ocorreu um erro ao gerar o PPTX.', true);
    } finally {
        setGeneratorButtonsLoading(false);
    }
}

// *** NOVO: Aceita repertoryData opcional ***
function generatePdf(repertoryData = null) {
    setGeneratorButtonsLoading(true);
    showGeneratorFeedback('Gerando PDF, por favor aguarde...', false, -1);

    try {
        // *** LÓGICA DE DECISÃO: Usar dados do parâmetro ou do formulário ***
        const data = repertoryData ? repertoryData : getSongDataFromForm();
        const { songs, theme, date, createdBy } = data;
        
        const songsWithLyrics = songs.filter(s => s.lyrics);
        
        const currentUser = getCurrentUser();
        if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) {
            showGeneratorFeedback("Você não tem permissão de administrador para gerar arquivos.", true);
            setGeneratorButtonsLoading(false); // Libera o botão se a permissão falhar
            return;
        }

        if (songsWithLyrics.length === 0) {
            showGeneratorFeedback('Nenhum cântico preenchido para gerar o PDF.', true);
            setGeneratorButtonsLoading(false);
            return;
        }
        
        // Verifica se jsPDF está disponível
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
            showGeneratorFeedback('Erro: A biblioteca jsPDF não está carregada.', true);
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 40;
        const formattedDate = date ? new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric'}) : '';
        const brandBlue = '#29aae2'; // Cor azul padrão

        // *** CORREÇÃO "CRIADO POR" (Garantir que os dados sejam lidos do form/histórico) ***
        const creatorUsername = createdBy || (currentUser ? currentUser.username : '');
        const creatorName = creatorUsername ? creatorUsername.split('@')[0].toUpperCase() : 'Desconhecido';

        // Lógica para Header/Footer
        // *** CORREÇÃO: A função agora RECEBE o nome do criador e a data como parâmetros, garantindo que usem o valor correto do repertório. ***
        const addHeaderFooter = (docInstance, creator, dateText) => {
            const pageCount = docInstance.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                docInstance.setPage(i);
                docInstance.setFont('helvetica', 'normal');
                docInstance.setFontSize(9);
                docInstance.setTextColor(150);
                // Usa os parâmetros passados
                docInstance.text(`Criado por: ${creator}`, margin, margin - 10);
                docInstance.text(dateText, pageWidth - margin, margin - 10, { align: 'right' });
                docInstance.text(`Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - (margin / 2), { align: 'center' });
            }
        };
        
        let y = margin + 20;

        // Título Principal
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor('#334155');
        doc.text('Roteiro de Cânticos', pageWidth / 2, y, { align: 'center' });
        y += 30;
        
        if (theme) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(16);
            doc.setTextColor(brandBlue);
            doc.text(theme, pageWidth / 2, y, { align: 'center' });
            y += 30;
        }
        
        y += 10;
        
        songsWithLyrics.forEach((song) => {
            const requiredSpaceForTitleAndFirstLine = 45; 
            
            // Verifica quebra de página
            if (y + requiredSpaceForTitleAndFirstLine > pageHeight - margin) {
                doc.addPage();
                y = margin + 20;
            } else {
                // Se não é a primeira página, adiciona um espaço entre os cânticos
                if(y > margin + 21) y += 30; 
            }

            // Título do Cântico
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(brandBlue);
            doc.text(song.title.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 25;

            // Letra/Cifra
            const lines = song.lyrics.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                const trimmedLine = lines[i].trim();
                if (trimmedLine === '') {
                    y += 15; // Adiciona espaço extra para quebra de estrofe
                    continue;
                }
                
                // Limpa a linha de * (para ter o conteúdo) - O TEXTO FINAL DA LINHA
                const lineContentWithoutBoldMarkers = trimmedLine.replace(/\*\*/g, '').trim();

                // Verifica se a linha original (trimmedLine) é SÓ cifras (marcada com **)
                const chordMatch = trimmedLine.match(/^\*\*(.*)\*\*$/); 

                // *** CORREÇÃO DE LÓGICA DE CIFRA/LETRA ***
                // É um par Cifra/Letra se: a linha atual é cifra (chordMatch) E a próxima linha existe E a próxima linha NÃO é vazia
                if (chordMatch && i + 1 < lines.length && lines[i+1].trim() !== '') {
                    const chordLine = lineContentWithoutBoldMarkers; // Pega a cifra LIMPA
                    
                    // Se for cifra, usa uma cor/estilo diferente e um espaço menor
                    doc.setFont('helvetica', 'bold'); // Em negrito (como solicitado)
                    doc.setFontSize(10);
                    doc.setTextColor(brandBlue); // Cor azul (como solicitado)
                    
                    const splitChords = doc.splitTextToSize(chordLine, pageWidth - (margin * 2)); 
                    
                    splitChords.forEach(chordChunk => {
                         if (y > pageHeight - margin) { doc.addPage(); y = margin + 20; }
                         doc.text(chordChunk, pageWidth / 2, y, { align: 'center' });
                         y += 12; // Espaço menor para cifra
                    });
                    
                    // Reseta para letra
                    doc.setFont('helvetica', 'normal'); 
                    doc.setFontSize(12);
                    doc.setTextColor('#334155');

                    // Pula a próxima linha (letra) e a processa imediatamente
                    i++;
                    const lyricLine = lines[i].trim().replace(/\*\*/g, ''); // Pega a letra e limpa negrito
                     const splitLyrics = doc.splitTextToSize(lyricLine, pageWidth - (margin * 2));
                    
                    splitLyrics.forEach(lyricChunk => {
                        if (y > pageHeight - margin) { doc.addPage(); y = margin + 20; }
                        doc.text(lyricChunk, pageWidth / 2, y, { align: 'center' });
                        y += 15; // Espaço normal para letra
                    });

                } else {
                    // É uma linha de letra (ou cifra órfã) - trata como letra
                    const splitLyrics = doc.splitTextToSize(lineContentWithoutBoldMarkers, pageWidth - (margin * 2));
                    
                    splitLyrics.forEach(lyricChunk => {
                        if (y > pageHeight - margin) { doc.addPage(); y = margin + 20; }
                        doc.text(lyricChunk, pageWidth / 2, y, { align: 'center' });
                        y += 15; // Espaço normal para letra
                    });
                }
            }
        });

        // *** CORREÇÃO: Passa as variáveis para a função addHeaderFooter ***
        addHeaderFooter(doc, creatorName, formattedDate); 

        const fileNameDate = date || 'data';
        const filename = `Roteiro_Uziel_${theme.replace(/\s+/g, '_') || fileNameDate}.pdf`;
        doc.save(filename);
        logAction('Gerou PDF', 'Gerador de Repertório', `PDF gerado para ${theme || formattedDate}`);
        showGeneratorFeedback('PDF gerado com sucesso! Verifique seus downloads.', false);

    } catch(error) {
        console.error("Erro ao gerar PDF:", error);
        showGeneratorFeedback('Ocorreu um erro ao gerar o PDF.', true);
    } finally {
        setGeneratorButtonsLoading(false);
    }
}


// Helper to generate embed HTML for Spotify or YouTube
function getEmbedHtml(url) {
    if (!url) {
        return `<div class="p-6 text-center rounded-2xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 shadow-inner"><i class="fas fa-link-slash fa-2x text-slate-400 mb-3"></i><p class="text-sm text-center text-slate-400 italic">Nenhum player de mídia adicionado.</p></div>`;
    }

    const origin = window.location.origin;

    // YouTube Playlist/Video Match
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/) || url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    
    if (ytMatch) {
        let embedUrl;
        if (url.includes('list=')) {
            const playlistId = url.match(/[?&]list=([a-zA-Z0-9_-]+)/)[1];
            embedUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}&enablejsapi=1&origin=${origin}`;
        } else {
            const videoId = ytMatch[1];
            embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${origin}`;
        }

        // Corrigido para garantir que o iframe seja responsivo.
        return `<div class="aspect-w-16 aspect-h-9 w-full h-full relative" style="padding-bottom: 56.25%; height: 0;"><iframe src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="absolute top-0 left-0 w-full h-full rounded-2xl shadow-xl border border-slate-200 dark:border-slate-600"></iframe></div>`;
    }

    // Spotify Match
    const spotifyMatch = url.match(/https?:\/\/open\.spotify\.com\/(?:[a-zA-Z0-9\-_]+\/)?(track|playlist|album)\/([a-zA-Z0-9]{22})/);
    if (spotifyMatch && spotifyMatch[1] && spotifyMatch[2]) {
        const type = spotifyMatch[1];
        const id = spotifyMatch[2];
        const themeParam = document.documentElement.classList.contains('dark') ? '&theme=0' : '&theme=1'; // Corrected Spotify theme logic
        const spotifyUri = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&view=compact${themeParam}`;
        // Altura fixa para o widget do Spotify
        return `<iframe style="border-radius:12px; border: 1px solid #e2e8f0;" src="${spotifyUri}" width="100%" height="200" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
    }
    
    // Fallback/Generic Link
    return `<div class="mt-4 text-center"><a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 bg-slate-500 text-white font-semibold py-1.5 px-3 rounded-2xl text-sm hover:bg-slate-600 transition-colors shadow-md"><i class="fas fa-external-link-alt"></i> Acessar Link Externo</a></div>`;
}

// ===================== INTEGRAÇÃO GEMINI (IA DO GOOGLE) =====================

/**
 * Constrói a query de busca final a ser enviada para o Gemini.
 */
function buildSearchQuery(cardTitle, customPrompt) {
    const genericTitles = songFields.map(f => f.title.toLowerCase());
    const cleanTitle = cardTitle.trim();
    const cleanPrompt = customPrompt.trim();

    const isGeneric = genericTitles.some(t => t === cleanTitle.toLowerCase());
    
    let baseQuery;

    if (isGeneric && cleanPrompt) {
        // Se o título é genérico ('Entrada'), use o prompt como a base da query.
        baseQuery = cleanPrompt;
    } else if (cleanTitle) {
        // Se o título é específico, use o título e o prompt como modificador.
        baseQuery = `${cleanTitle} ${cleanPrompt}`.trim();
    } else if (cleanPrompt) {
        // Somente prompt disponível.
        baseQuery = cleanPrompt;
    } else {
        return '';
    }

    return baseQuery;
}

// NOVO: Função para renderizar botões de busca manual
function renderMediaSearchButtons(searchQuery, card) {
    // Remove qualquer widget de seleção anterior
    card.querySelectorAll('.media-selection-widget').forEach(w => w.remove());

    const aiToolsContainer = card.querySelector('.ai-tools-container');
    if (!aiToolsContainer) return;

    const widget = document.createElement('div');
    widget.className = "media-selection-widget mt-4 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-brand-blue/50 shadow-inner text-center";
    
    // Codifica a query para ser usada em URLs de busca
    const encodedQuery = encodeURIComponent(searchQuery);

    widget.innerHTML = `
        <h6 class="text-sm font-bold text-brand-text dark:text-white mb-4">
            <i class="fas fa-search-plus mr-2"></i> Mídia: Busque Manualmente
        </h6>
        <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">A IA não sugeriu links, ou você precisa de outro. Clique para buscar. Depois, **cole o link no campo "Link"**.</p>
        
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="https://open.spotify.com/search/${encodedQuery}" target="_blank" rel="noopener noreferrer" 
               class="flex items-center justify-center p-3 rounded-2xl bg-green-600 text-white font-extrabold shadow-md hover:bg-green-700 transition-colors transform hover:scale-[1.01]">
                <i class="fab fa-spotify mr-2"></i> Buscar no Spotify
            </a>
            <a href="https://www.youtube.com/results?search_query=${encodedQuery}" target="_blank" rel="noopener noreferrer" 
               class="flex items-center justify-center p-3 rounded-2xl bg-red-600 text-white font-extrabold shadow-md hover:bg-red-700 transition-colors transform hover:scale-[1.01]">
                <i class="fab fa-youtube mr-2"></i> Buscar no YouTube
            </a>
        </div>
    `;

    aiToolsContainer.insertAdjacentElement('afterend', widget);
}


// Função para buscar letra (agora com negrito)
async function fetchSongWithGemini(searchQuery, includeChords = false) {
    
    // *** CORREÇÃO: Removemos a restrição a cânticos católicos. O assistente é agora UNIVERSAL. ***
    const systemInstruction = `Você é um assistente de música universal, conciso e objetivo. Sua única função é fornecer a letra formatada para a música solicitada. 
NUNCA inclua links, introduções, saudações, despedidas, resumos, ou qualquer texto além da letra formatada.
O formato da letra DEVE ser: a cifra na linha de cima, imediatamente seguida pela linha da letra, com as cifras alinhadas horizontalmente à sílaba ou palavra correspondente.
As linhas de cifras DEVEM SER ENVOLVIDAS em marcadores de negrito Markdown (**) do início ao fim da linha, para que a aplicação possa diferenciá-las da letra. Ex: **Cifra 1 Cifra 2**.`;

    const chordRequest = includeChords ? 'com cifras, formatadas na linha de cima, separadas da letra por uma quebra de linha, e as cifras ENVOLVIDAS em negrito markdown (**cifra**)' : 'sem cifras';

    // Construção de prompt mais robusta (usando searchQuery completo)
    const prompt = `Forneça a letra ${chordRequest} para a música: "${searchQuery}". Use o formato estrito: SOMENTE A LETRA COMPLETA E FORMATADA.`;

    let response;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const delay = Math.pow(2, attempt) * 1000;

        try {
            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                },
                tools: [{ "google_search": {} }], 
            };
            
            // *** CORREÇÃO: A URL agora usa o nome correto do modelo 'gemini-2.5-pro' ***
            response = await fetch(GEMINI_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                break; 
            }

            if (attempt < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        } catch(e) {
            if (attempt < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                 console.error("Erro na tentativa de fetch (após retries): ", e);
                 throw new Error("Falha na comunicação com a API de letras.");
            }
        }
    }
    
    if (!response || !response.ok) {
        throw new Error(`API call failed with status: ${response ? response.status : 'No response'}`);
    }


    const data = await response.json();
    const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Não foi possível obter a letra. Tente refinar o título da música.";
    return resultText;
}


// Adiciona botão IA e campo de prompt aos blocos de cântico
function attachGeminiButtons() {
    const container = document.getElementById("dynamic-song-fields-container");
    if (!container) return;

    // Filtra apenas os cards que ainda não têm o contêiner da IA
    container.querySelectorAll(".dynamic-song-card:not(:has(> .ai-tools-container))").forEach((card, index) => {
        // Garantir ID único
        if (!card.id) card.id = `song-card-${Date.now()}-${index}`;

        // Verifica se o contêiner de ferramentas da IA já existe
        if (card.querySelector(".ai-tools-container")) return; 

        // Cria o contêiner de ferramentas da IA com o campo de prompt e o botão
        const uniqueId = `ai-tools-${card.id}`; 
        const aiToolsContainer = document.createElement("div");
        aiToolsContainer.className = "ai-tools-container mt-4 p-4 rounded-2xl bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 admin-only-input-area";
        
        const currentUser = getCurrentUser();
        const isAdmin = currentUser && (currentUser.role === 'admin' || isSuperAdmin(currentUser));
        if (!isAdmin) {
             // Esconde a área de IA para não-admins
            aiToolsContainer.classList.add('hidden'); 
            card.appendChild(aiToolsContainer);
            return;
        }

        // Estrutura de UI aprimorada
        aiToolsContainer.innerHTML = `
            <div class="flex items-center justify-between mb-3 border-b pb-2 border-gray-200 dark:border-slate-600">
                <h6 class="text-sm font-extrabold text-brand-blue dark:text-brand-blue-light"><i class="fas fa-magic mr-2"></i> BUSCA INTELIGENTE (IA)</h6>
            </div>

            <div class="mb-3">
                <!-- Checkbox para Cifras -->
                <label for="chords-toggle-${uniqueId}" class="flex items-center cursor-pointer mb-2">
                    <input type="checkbox" id="chords-toggle-${uniqueId}" class="include-chords-toggle mr-2 h-4 w-4 text-brand-blue rounded border-gray-300 focus:ring-brand-blue dark:bg-slate-800 dark:border-slate-600" checked>
                    <span class="text-sm font-semibold text-slate-700 dark:text-slate-300"><i class="fas fa-guitar mr-1"></i> Incluir Cifras (Recomendado)</span>
                </label>
                
                <!-- Campo de Prompt Personalizado -->
                <label for="custom-prompt-${uniqueId}" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <i class="fas fa-feather-alt mr-1"></i> Prompt Personalizado (Opcional)
                </label>
                <textarea id="custom-prompt-${uniqueId}" class="custom-prompt-input w-full p-2 text-sm rounded-lg border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white shadow-inner focus:ring-1 focus:ring-brand-blue" rows="2" placeholder="Ex: 'Quero a letra na tonalidade de G e o link do YouTube'."></textarea>
            </div>
            
            <button type="button" class="gemini-btn w-full bg-brand-blue hover:bg-brand-blue/90 text-white px-3 py-2 rounded-2xl shadow-lg text-sm font-extrabold transition-colors duration-200 flex items-center justify-center transform hover:scale-[1.01]">
                <i class="fas fa-search-dollar mr-2"></i> <span class="gemini-btn-text">Buscar Letra e Mídia</span>
            </button>
        `;

        card.appendChild(aiToolsContainer);

        const btn = aiToolsContainer.querySelector(".gemini-btn");
        const btnText = aiToolsContainer.querySelector(".gemini-btn-text");
        const promptInput = aiToolsContainer.querySelector(".custom-prompt-input");
        const chordsToggle = aiToolsContainer.querySelector(".include-chords-toggle");
        const loadingIcon = aiToolsContainer.querySelector('.fas.fa-search-dollar'); 
        
        // Adiciona o listener de clique
        btn.addEventListener("click", async () => {
            const title = card.querySelector(".song-title-input")?.value.trim();
            const lyricsInput = card.querySelector(".lyrics-input");
            const linkInput = card.querySelector(".link-input");
            const customPrompt = promptInput.value.trim();
            const includeChords = chordsToggle.checked; 
            
            const queryForIA = buildSearchQuery(title, customPrompt);
            
            const originalButtonText = btnText.textContent;
            const originalIconClass = loadingIcon.className;
            const originalLyrics = lyricsInput.value;

            if (!queryForIA) {
                showGeneratorFeedback("Por favor, digite o nome da música no campo de Título ou no Prompt Personalizado.", true);
                return;
            }

            // Mostrar estado de carregamento
            btn.disabled = true;
            btnText.textContent = "Buscando...";
            loadingIcon.className = 'fas fa-spinner fa-spin mr-2';
            lyricsInput.value = "🎧 Buscando Letra com IA...";
            linkInput.value = ""; 
            
            // Remove qualquer widget de seleção anterior
            card.querySelectorAll('.media-selection-widget').forEach(w => w.remove());

            try {
                // 1. CHAMA A IA (PEGA A LETRA) - Usando queryForIA
                const lyricsResult = await fetchSongWithGemini(queryForIA, includeChords); 
                
                // 2. POPULA A LETRA
                lyricsInput.value = lyricsResult;
                
                // 3. RENDERIZA OS BOTÕES DE BUSCA MANUAL
                renderMediaSearchButtons(queryForIA, card); 
                
            } catch (error) {
                console.error("Erro ao buscar com IA:", error);
                showGeneratorFeedback(`Falha ao buscar letra com IA. Verifique a consulta: ${error.message}`, true, 8000);
                lyricsInput.value = originalLyrics; // Restaura a letra original se falhar
                renderMediaSearchButtons(queryForIA, card); // Adiciona os botões de busca manual mesmo em caso de erro na letra
            } finally {
                // Restaurar estado do botão
                btn.disabled = false;
                btnText.textContent = originalButtonText;
                loadingIcon.className = originalIconClass;
            }
        });
    });
}

// Observa mudanças no container e adiciona botões automaticamente
document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("dynamic-song-fields-container");
    if (!container) return;

    // Garante que o attachGeminiButtons seja chamado sempre que um card é adicionado ou o DOM é modificado.
    const observer = new MutationObserver(() => attachGeminiButtons());
    // Observa adição de novos elementos filhos
    observer.observe(container, { childList: true }); 
    attachGeminiButtons(); // aplica nos existentes também
});