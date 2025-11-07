import { logAction, getDB, getAppId, getRepertories, getCollectionRef, addDoc, updateDoc, deleteDoc, getDocRef, getDocs, writeBatch } from './firebase.js';
import { getCurrentUser, isSuperAdmin } from './auth.js';
import { showFeedback, openConfirmationModal } from './ui.js';

const songFields = [
    { id: 'antes-da-missa', title: 'Antes da Missa' }, { id: 'entrada', title: 'Entrada' }, { id: 'entrada-especial', title: 'Entradas Especiais' },
    { id: 'perdao', title: 'Ato Penitencial' }, { id: 'gloria', title: 'Glória' }, { id: 'salmo', title: 'Salmo Responsorial' },
    { id: 'aclamacao', title: 'Aclamação ao Evangelho' }, { id: 'ofertorio', title: 'Ofertório' }, { id: 'santo', title: 'Santo' },
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
    // NOTA: Adicionamos 'draggable="true"' para o D&D de desktop
    return `
    <div class="dynamic-song-card bg-white dark:bg-darkcard p-5 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-xl transition-all duration-300 hover:shadow-2xl hover:ring-2 hover:ring-brand-blue" data-song-title="${title}" draggable="true">
        <!-- Alterado de 'justify-between' para 'items-center' para acomodar o handle -->
        <div class="flex items-center mb-4 border-b pb-3 border-slate-100 dark:border-slate-700">
            
            <!-- Ícone de Arrastar (Drag Handle) - Visível apenas para Admin -->
            <span class="drag-handle-icon text-slate-400 dark:text-slate-600 mr-4 cursor-grab admin-only-input-area" title="Arraste para reordenar" ${!isAdmin ? 'style="display:none;"' : ''}>
                <i class="fas fa-grip-vertical text-xl"></i>
            </span>

            <!-- Título (com flex-grow) -->
            <input type="text" value="${title}" class="song-title-input text-2xl font-extrabold text-brand-text dark:text-white flex-grow bg-transparent border-0 p-0 focus:outline-none focus:ring-0 placeholder-gray-500 disabled:cursor-auto" ${!isAdmin ? 'disabled' : ''}>
            
            <!-- Botão de Remover (com ml-4 para espaçamento) -->
            <button type="button" class="remove-song-btn text-red-600 hover:text-white bg-red-100 hover:bg-red-700 font-semibold transition-all duration-200 p-2 rounded-2xl shadow-md admin-only-input transform hover:scale-110 ml-4" title="Remover Cântico" ${!isAdmin ? 'disabled' : ''}>
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
        <div class="space-y-4">
            <div class="border-l-4 border-brand-blue/50 pl-3">
                <label for="lyrics-${uniqueId}" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Letra</label>
                <textarea id="lyrics-${uniqueId}" rows="4" class="lyrics-input admin-only-input mt-1 block w-full rounded-2xl border-slate-300 dark:border-slate-600 bg-brand-light-gray dark:bg-slate-700 text-slate-900 dark:text-white shadow-inner focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition-colors p-3" ${!isAdmin ? 'disabled' : ''}>${lyrics}</textarea>
            </div>
            <div class="border-l-4 border-slate-500/50 pl-3">
                <label for="link-${uniqueId}" class="block text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Link (YouTube/Spotify)</label>
                <input type="url" id="link-${uniqueId}" value="${link}" class="link-input admin-only-input mt-1 block w-full rounded-2xl border-slate-300 dark:border-slate-600 bg-brand-light-gray dark:bg-slate-700 text-slate-900 dark:text-white shadow-inner focus:ring-2 focus:ring-brand-blue focus:border-brand-blue transition-colors text-sm p-3" placeholder="https://..." ${!isAdmin ? 'disabled' : ''}>
            </div>
        </div>
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
    document.getElementById('generate-pptx-btn')?.addEventListener('click', generatePptx);
    document.getElementById('generate-pdf-btn')?.addEventListener('click', generatePdf);
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
            /* Adicionamos 'scale' para um feedback mais óbvio no mobile */
            transform: scale(0.95); 
        }
        .dynamic-song-card.drag-over-top {
            border-top: 4px solid var(--brand-blue-color, #29aae2); 
        }
        .dynamic-song-card.drag-over-bottom {
            border-bottom: 4px solid var(--brand-blue-color, #29aae2); 
        }
    `;
    document.head.appendChild(style);

    if (songContainer) {
        
        // --- Funções Auxiliares de D&D ---

        // Limpa todos os feedbacks visuais (bordas)
        const clearDragFeedback = () => {
            Array.from(songContainer.children).forEach(child => 
                child.classList.remove('drag-over-top', 'drag-over-bottom')
            );
        };

        // Aplica o feedback visual (borda) com base na posição Y (do mouse ou toque)
        const handleDragOver = (currentY, targetCard) => {
            if (!targetCard || targetCard === draggedItem) return;

            clearDragFeedback(); // Limpa feedbacks antigos

            const rect = targetCard.getBoundingClientRect();
            // Determina se o arraste está na metade superior ou inferior do alvo
            const isNearBottom = (currentY - rect.top) / rect.height > 0.5;
            
            if (isNearBottom) {
                targetCard.classList.add('drag-over-bottom');
            } else {
                targetCard.classList.add('drag-over-top');
            }
        };

        // Lógica de "soltar" o item
        const handleDrop = () => {
            if (!draggedItem) return;

            // Encontra o alvo onde o item deve ser solto
            const dropTarget = songContainer.querySelector('.drag-over-top, .drag-over-bottom');

            if (dropTarget && dropTarget !== draggedItem) {
                const isDroppedBefore = dropTarget.classList.contains('drag-over-top');
                
                if (isDroppedBefore) {
                    songContainer.insertBefore(draggedItem, dropTarget);
                } else {
                    // insertBefore(item, null) funciona como appendChild se nextSibling for null
                    songContainer.insertBefore(draggedItem, dropTarget.nextSibling);
                }
                showGeneratorFeedback('Ordem do cântico atualizada.', false, 2000);
            }
            
            clearDragFeedback(); // Limpa feedback após o drop
        };

        // Limpeza final ao terminar ou cancelar o arraste
        const handleDragEnd = () => {
            if (draggedItem) {
                draggedItem.classList.remove('dragging-visual');
            }
            draggedItem = null;
            clearDragFeedback();
        };

        // --- Eventos de MOUSE (Desktop) ---

        songContainer.addEventListener('dragstart', (e) => {
            // Não inicia o drag se estiver em um input, textarea ou botão
            if (e.target.closest('.dynamic-song-card') && !e.target.closest('input, textarea, button')) {
                draggedItem = e.target.closest('.dynamic-song-card');
                // Usamos setTimeout para dar tempo ao navegador de criar o "fantasma" do drag
                setTimeout(() => draggedItem.classList.add('dragging-visual'), 0);
                e.dataTransfer.effectAllowed = 'move';
            } else {
                e.preventDefault(); // Impede o drag em inputs
            }
        });

        songContainer.addEventListener('dragover', (e) => {
            e.preventDefault(); // Necessário para permitir o drop
            if (!draggedItem) return;
            const target = e.target.closest('.dynamic-song-card');
            handleDragOver(e.clientY, target); // Passa a posição Y do mouse
        });

        songContainer.addEventListener('dragenter', (e) => e.preventDefault());

        songContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            handleDrop();
            handleDragEnd(); // Limpa no final
        });

        songContainer.addEventListener('dragend', handleDragEnd);
        
        songContainer.addEventListener('dragleave', (e) => {
            // Limpa feedback se o mouse sair do card específico (opcional, mas bom)
            const target = e.target.closest('.dynamic-song-card');
            if (target) {
                target.classList.remove('drag-over-top', 'drag-over-bottom');
            }
        });

        // --- Eventos de TOQUE (Mobile) ---

        songContainer.addEventListener('touchstart', (e) => {
            // Apenas inicia o drag se o toque for no card, não nos inputs/textarea/botões
            if (e.target.closest('.dynamic-song-card') && !e.target.closest('input, textarea, button')) {
                draggedItem = e.target.closest('.dynamic-song-card');
                draggedItem.classList.add('dragging-visual');
            }
        }, { passive: true }); // passive: true permite o scroll padrão se o drag não for iniciado

        songContainer.addEventListener('touchmove', (e) => {
            if (!draggedItem) return;
            
            // Previne o scroll da página *enquanto* o usuário está arrastando o item
            e.preventDefault(); 

            const touch = e.touches[0];
            // Encontra o elemento (card) que está debaixo do dedo do usuário
            const elementOver = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetCard = elementOver ? elementOver.closest('.dynamic-song-card') : null;
            
            handleDragOver(touch.clientY, targetCard); // Passa a posição Y do toque
        }, { passive: false }); // { passive: false } é CRUCIAL para o e.preventDefault() funcionar no touchmove

        // touchend é o "drop" no mobile
        songContainer.addEventListener('touchend', (e) => {
            if (!draggedItem) return;
            handleDrop();
            handleDragEnd(); // Limpa tudo
        });

        // touchcancel ocorre se o sistema interromper o toque (ex: alerta do celular)
        songContainer.addEventListener('touchcancel', (e) => {
            handleDragEnd(); // Apenas limpa
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
        
        // CORREÇÃO CRÍTICA: Se for privado, só mostra para o criador OU Super Admin.
        return (rep.createdBy === currentUser.username) || isCurrentUserSuperAdmin;
    });

    if (filteredRepertories.length === 0) {
        contentDiv.innerHTML = `<div class="text-center text-slate-500 dark:text-slate-400 py-10"><i class="fas fa-history fa-2x mb-3"></i><p>Nenhum repertório salvo encontrado.</p></div>`;
        return;
    }

    contentDiv.innerHTML = filteredRepertories.map(rep => {
        const formattedDate = rep.date ? new Date(rep.date + 'T00:00:00').toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric'}) : 'Sem data';
        const title = rep.theme || `Celebração de ${formattedDate}`;
        
        const isCreator = currentUser && rep.createdBy === currentUser.username;
        const canEditOrDelete = isAdmin && (isCreator || isCurrentUserSuperAdmin);

        // OBTENDO O NOME COMPLETO DO CRIADOR A PARTIR DO USERNAME
        const creatorName = rep.createdBy ? rep.createdBy.split('@')[0].toUpperCase() : 'Desconhecido';
        
        // APLICANDO CLASSES PREMIUM DE ARREDONDAMENTO
        const adminButtons = canEditOrDelete ? `
            <button data-id="${rep.id}" class="edit-repertory-btn bg-slate-100 text-slate-700 font-semibold py-1.5 px-3 rounded-2xl hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 text-xs shadow-md transform hover:scale-[1.02] transition-all">Editar</button>
            <button data-id="${rep.id}" class="delete-repertory-btn text-red-500 hover:text-red-700 text-lg p-1 transition-colors" title="Excluir"><i class="fas fa-trash-alt"></i></button>
        ` : '';
        
        const privacyTag = rep.isPrivate ? '<span class="ml-2 px-2 py-0.5 text-xs font-semibold rounded-2xl bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 shadow-sm">Privado</span>' : '';

        return `
            <div class="bg-white dark:bg-darkcard p-4 rounded-3xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4 shadow-xl hover:shadow-2xl transition-all duration-300">
                <div>
                    <p class="font-bold text-brand-text dark:text-white">${title}${privacyTag}</p>
                    <p class="text-sm text-slate-500 dark:text-slate-400">
                        ${formattedDate} 
                        <span class="ml-3 text-xs italic text-brand-blue/70">por ${creatorName}</span>
                    </p>
                </div>
                <div class="flex items-center gap-2">
                    <button data-id="${rep.id}" class="view-repertory-btn bg-sky-100 text-sky-700 font-semibold py-1.5 px-3 rounded-2xl hover:bg-sky-200 dark:bg-sky-900 dark:text-sky-300 dark:hover:bg-sky-800 text-xs shadow-md transform hover:scale-[1.02] transition-all">Visualizar</button>
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
            // Usar a função createSongFieldHTML para recriar o visual aprimorado
            container.insertAdjacentHTML('beforeend', createSongFieldHTML(song.title, song.lyrics, song.link));
        });
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
        // Fallback to current form data if not found in history (e.g., viewing unsaved work)
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
    const creatorName = createdBy ? createdBy.split('@')[0].toUpperCase() : 'Desconhecido';

    if (songsWithContent.length === 0) {
        contentDiv.innerHTML = `<div class="text-center text-slate-500 dark:text-slate-400 py-10"><i class="fas fa-music fa-2x mb-3"></i><p>Este repertório está vazio.</p></div>`;
        return;
    }

    const formattedDate = date ? new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric'}) : '';

    let html = `<div class="text-center mb-6">
                            <h3 class="text-3xl font-bold text-brand-text dark:text-white">Roteiro de Cânticos</h3>
                            <p class="text-brand-blue font-semibold text-lg">${theme || formattedDate}</p>
                            <p class="text-sm italic text-slate-500 dark:text-slate-400 mt-1">Criado por: ${creatorName}</p>
                        </div>
                        <div id="repertory-accordion" class="space-y-4">`;

    songsWithContent.forEach((song) => {
        const embedHtml = getEmbedHtml(song.link);
        html += `
            <div class="accordion-item bg-white dark:bg-darkcard rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xl hover:shadow-2xl transition-shadow">
                <button class="accordion-header w-full flex justify-between items-center text-left p-5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors focus:outline-none border-l-4 border-brand-blue">
                    <span class="font-bold text-xl text-brand-text dark:text-white">${song.title}</span>
                    <i class="fas fa-chevron-down transition-transform text-brand-blue text-lg"></i>
                </button>
                <div class="accordion-content">
                   <div class="p-6 border-t border-slate-200 dark:border-slate-600 bg-brand-light-gray dark:bg-darkcard">
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                            <div class="lyrics-container">
                                <h5 class="font-bold text-brand-blue mb-3 text-center text-md uppercase tracking-wider border-b pb-1">Letra</h5>
                                <pre class="text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans text-base leading-relaxed text-left p-4 rounded-2xl bg-brand-light-gray dark:bg-slate-800 shadow-inner border border-slate-200 dark:border-slate-700">${song.lyrics || 'Letra não disponível.'}</pre>
                            </div>
                            <div class="player-container">
                                <h5 class="font-bold text-brand-blue mb-3 text-center text-md uppercase tracking-wider border-b pb-1">Mídia</h5>
                                ${embedHtml}
                            </div>
                        </div>
                   </div>
                </div>
            </div>`;
    });

    html += `</div>`;
    contentDiv.innerHTML = html;
    
    // ATENÇÃO: Corrigido o evento de clique e a manipulação do maxHeight/padding
    contentDiv.querySelectorAll('.accordion-header').forEach(button => {
        button.addEventListener('click', () => {
            const content = button.nextElementSibling;
            const contentInner = content.querySelector('div');
            
            button.classList.toggle('active');
            
            if (content.style.maxHeight && content.style.maxHeight !== '0px') {
                // Fechando
                content.style.maxHeight = '0px';
                // Remove padding da div interna
                contentInner.style.paddingTop = '0';
                contentInner.style.paddingBottom = '0';
                button.querySelector('i').classList.remove('rotate-180');
            } else {
                // Abrindo
                // Adiciona padding
                contentInner.style.paddingTop = '1.5rem';
                contentInner.style.paddingBottom = '1.5rem';
                // Define maxHeight baseado no scrollHeight do conteúdo interno mais o padding
                const padding = 50; 
                content.style.maxHeight = (contentInner.scrollHeight + padding) + "px"; 
                button.querySelector('i').classList.add('rotate-180');
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
                const db = getDB();
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
                // CORREÇÃO CRÍTICA: Reabilitar botões AQUI
                setGeneratorButtonsLoading(false);
            }
        }
    );
}

// --- File Generation Logic ---

async function generatePptx() {
    setGeneratorButtonsLoading(true);
    showGeneratorFeedback('Gerando PPTX, por favor aguarde...', false, -1);

    try {
        const { songs, theme, date, createdBy } = getSongDataFromForm();
        const songsWithLyrics = songs.filter(s => s.lyrics);
        
        // Adiciona feedback se não for Admin
        const currentUser = getCurrentUser();
        if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) {
            showGeneratorFeedback("Você não tem permissão de administrador para gerar arquivos.", true);
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
        const creatorName = createdBy ? createdBy.split('@')[0].toUpperCase() : 'Desconhecido';
        
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

        const linesPerSlide = 5;

        songsWithLyrics.forEach(song => {
            const allLines = song.lyrics.split('\n').filter(line => line.trim() !== '');
            if (allLines.length === 0) return;

            const totalChunks = Math.ceil(allLines.length / linesPerSlide);

            for (let i = 0; i < allLines.length; i += linesPerSlide) {
                const chunk = allLines.slice(i, i + linesPerSlide);
                const slideLyrics = chunk.join('\n');
                const currentChunkIndex = (i / linesPerSlide) + 1;

                let slide = pptx.addSlide({ masterName: 'SONG_MASTER' });

                let slideTitle = song.title.toUpperCase();
                if (totalChunks > 1) {
                    slideTitle += ` (${currentChunkIndex}/${totalChunks})`;
                }
                
                slide.addText(slideTitle, { 
                    x: 0, y: 0.3, w: '100%', h: 1, 
                    align: 'center',
                    fontFace: 'Poppins', fontSize: 28, color: '29aae2', bold: true 
                });
                
                slide.addText(slideLyrics, { 
                    x: 0.5, y: 1.5, w: '90%', h: 3.0, 
                    fontFace: 'Poppins', fontSize: 32, 
                    color: 'FFFFFF', 
                    align: 'center',
                    valign: 'middle',
                    lineSpacing: 40,
                    bold: true
                });
            }
        });

        const fileNameDate = date || 'data';
        const filename = `Canticos_Uziel_${theme.replace(/\s+/g, '_') || fileNameDate}.pptx`;
        await pptx.writeFile({ fileName: filename });
        logAction('Gerou PPTX', 'Gerador de Repertório', `PPTX gerado para ${theme || formattedDate}`);
        showGeneratorFeedback('PPTX gerado com sucesso!', false);

    } catch (error) {
        console.error("Erro ao gerar PPTX:", error);
        showGeneratorFeedback('Ocorreu um erro ao gerar o PPTX.', true);
    } finally {
        setGeneratorButtonsLoading(false);
    }
}


function generatePdf() {
    setGeneratorButtonsLoading(true);
    showGeneratorFeedback('Gerando PDF, por favor aguarde...', false, -1);

    try {
        const { songs, theme, date, createdBy } = getSongDataFromForm();
        const songsWithLyrics = songs.filter(s => s.lyrics);
        
        // Adiciona feedback se não for Admin
        const currentUser = getCurrentUser();
        if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) {
            showGeneratorFeedback("Você não tem permissão de administrador para gerar arquivos.", true);
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
        const creatorName = createdBy ? createdBy.split('@')[0].toUpperCase() : 'Desconhecido';

        const addHeaderFooter = (docInstance) => {
            const pageCount = docInstance.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                docInstance.setPage(i);
                docInstance.setFontSize(9);
                docInstance.setTextColor(150);
                // Adiciona o nome do criador no footer/header
                docInstance.text(`Criado por: ${creatorName}`, margin, margin - 10);
                docInstance.text(formattedDate, pageWidth - margin, margin - 10, { align: 'right' });
                docInstance.text(`Página ${i} de ${pageCount}`, pageWidth / 2, pageHeight - (margin / 2), { align: 'center' });
            }
        };
        
        let y = margin + 20;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor('#334155');
        doc.text('Roteiro de Cânticos', pageWidth / 2, y, { align: 'center' });
        y += 30;
        
        if (theme) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(16);
            doc.setTextColor('#29aae2');
            doc.text(theme, pageWidth / 2, y, { align: 'center' });
            y += 30;
        }
        
        y += 10;
        
        songsWithLyrics.forEach((song) => {
            const requiredSpaceForTitleAndFirstLine = 45; // Approx space for title + gap + first line
            
            if (y + requiredSpaceForTitleAndFirstLine > pageHeight - margin) {
                doc.addPage();
                y = margin + 20;
            } else {
                if(y > margin + 21) y += 30;
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor('#29aae2');
            doc.text(song.title.toUpperCase(), pageWidth / 2, y, { align: 'center' });
            y += 25;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(12);
            doc.setTextColor('#334155');
            
            // Use splitTextToSize to handle wrapping
            const splitLyrics = doc.splitTextToSize(song.lyrics, pageWidth - (margin * 2));
            
            splitLyrics.forEach(line => {
                if (y > pageHeight - margin) {
                    doc.addPage();
                    y = margin + 20;
                }
                doc.text(line, pageWidth / 2, y, { align: 'center' });
                y += 15;
            });
        });

        addHeaderFooter(doc);
        const fileNameDate = date || 'data';
        const filename = `Roteiro_Uziel_${theme.replace(/\s+/g, '_') || fileNameDate}.pdf`;
        doc.save(filename);
        logAction('Gerou PDF', 'Gerador de Repertório', `PDF gerado para ${theme || formattedDate}`);
        showGeneratorFeedback('PDF gerado com sucesso!', false);

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
        return `<p class="text-sm text-center text-slate-400 italic mt-4">Nenhum player de mídia adicionado.</p>`;
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

        return `<div class="aspect-w-16 aspect-h-9 w-full h-full relative" style="padding-bottom: 56.25%; height: 0;"><iframe src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="absolute top-0 left-0 w-full h-full rounded-3xl shadow-xl"></iframe></div>`;
    }

    // Spotify Match
    const spotifyMatch = url.match(/https?:\/\/open\.spotify\.com\/(?:[a-zA-Z0-9\-_]+\/)?(track|playlist|album)\/([a-zA-Z0-9]{22})/);
    if (spotifyMatch && spotifyMatch[1] && spotifyMatch[2]) {
        const type = spotifyMatch[1];
        const id = spotifyMatch[2];
        const themeParam = document.documentElement.classList.contains('dark') ? '&theme=0' : '';
        const spotifyUri = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator${themeParam}`;
        return `<iframe style="border-radius:12px" src="${spotifyUri}" width="100%" height="352" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
    }
    
    // Fallback/Generic Link
    return `<div class="mt-4 text-center"><a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 bg-slate-500 text-white font-semibold py-1.5 px-3 rounded-2xl text-sm hover:bg-slate-600 transition-colors shadow-md"><i class="fas fa-link"></i>Acessar Link Externo</a></div>`;
}