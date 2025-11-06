import { logAction, getDB, getAppId, getMembers, getRecords, getCollectionRef, getDocRef, updateDoc, increment, runTransaction, getDocs, writeBatch } from './firebase.js';
import { getCurrentUser, isSuperAdmin, isAutoNotifyEnabled, getSenderUsername, getUserCredentials } from './auth.js';
import { setupModalInteraction, showFeedback, openConfirmationModal } from './ui.js';

let currentEvent = null; 
let currentDate = null;

function showAttendanceFeedback(message, isError = true, duration = 4000) {
    // Usamos duration = -1 para feedback que deve ser mantido na tela (e fechado por outra função)
    showFeedback('attendance-feedback', message, isError, duration === 0 ? -1 : duration);
}

// Anexado à window para que o listener do Firebase possa chamá-lo
window.renderAttendanceUI = renderAttendanceUI;

export function openAttendanceModal() {
    const modal = document.getElementById('attendance-modal');
    const content = modal.querySelector('.modal-content');
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { modal.classList.add('is-open'); modal.classList.remove('opacity-0'); content.classList.remove('scale-95', 'opacity-0'); }, 10);
    renderAttendanceUI();
}

function renderAttendanceUI() {
    const container = document.getElementById('attendance-content-area');
    const currentUser = getCurrentUser();
    if (!currentUser || !container) { container.innerHTML = ''; return; }
    
    // Tenta manter a aba ativa, ou volta para 'dashboard'
    const activeTabName = container.querySelector('.attendance-tab-button.active')?.dataset.tab || 'dashboard';

    if (currentUser.role === 'admin' || isSuperAdmin(currentUser)) { 
        renderAdminView(container, activeTabName); 
    } else { 
        renderMemberView(container); 
    }
}


function renderAdminView(container, activeTabName) {
    const allMembers = getMembers();
    const allRecords = getRecords();
    
    // Rebuild HTML structure (Mantido no HTML para garantir que todos os elementos estejam no DOM)
    // NOTE: Este HTML deve ser o mesmo injetado no index.html para evitar problemas de re-renderização completa do DOM
    container.innerHTML = `
        <div class="flex flex-col h-full">
            <div id="attendance-tabs" class="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-darkcard flex-shrink-0 shadow-md">
                <nav class="flex flex-wrap items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-full shadow-inner">
                    <button data-tab="dashboard" class="attendance-tab-button px-6 py-2 text-sm font-semibold rounded-full flex items-center gap-2 transition-colors duration-200"><i class="fas fa-chart-line"></i><span>Dashboard</span></button>
                    <button data-tab="setup" class="attendance-tab-button px-6 py-2 text-sm font-semibold rounded-full flex items-center gap-2 transition-colors duration-200"><i class="fas fa-cog"></i><span>Configurar Evento</span></button>
                    <button data-tab="register" class="attendance-tab-button px-6 py-2 text-sm font-semibold rounded-full flex items-center gap-2 transition-colors duration-200"><i class="fas fa-user-check"></i><span>Registrar Presença</span></button>
                    <button data-tab="records" class="attendance-tab-button px-6 py-2 text-sm font-semibold rounded-full flex items-center gap-2 transition-colors duration-200"><i class="fas fa-history"></i><span>Visualizar Registros</span></button>
                </nav>
            </div>
            <div id="tab-content-container" class="p-6 flex-grow overflow-y-auto">
                <div id="tab-dashboard" class="tab-pane">
                    <div class="dashboard-container">
                        <h4 class="text-xl font-bold text-brand-text dark:text-white mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">Dashboard de Participação</h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div class="bg-white dark:bg-darkcard p-5 rounded-xl text-center shadow-lg border border-slate-200 dark:border-slate-700">
                                <h5 class="text-sm font-semibold text-blue-600 dark:text-blue-300 uppercase">Total de Presenças</h5>
                                <p id="stat-total-presence" class="text-4xl font-bold text-blue-600 mt-2">0</p>
                            </div>
                            <div class="bg-white dark:bg-darkcard p-5 rounded-xl text-center shadow-lg border border-slate-200 dark:border-slate-700">
                                <h5 class="text-sm font-semibold text-red-600 dark:text-red-300 uppercase">Total de Faltas</h5>
                                <p id="stat-total-absence" class="text-4xl font-bold text-red-600 mt-2">0</p>
                            </div>
                            <div class="bg-white dark:bg-darkcard p-5 rounded-xl text-center shadow-lg border border-slate-200 dark:border-slate-700">
                                <h5 class="text-sm font-semibold text-green-600 dark:text-green-300 uppercase">Taxa de Presença</h5>
                                <p id="stat-presence-rate" class="text-4xl font-bold text-green-600 mt-2">0%</p>
                            </div>
                        </div>
                        <h4 class="text-xl font-bold text-brand-text dark:text-white mb-4 mt-8 border-b border-slate-200 dark:border-slate-700 pb-2">Ranking de Pontuação (Faltas)</h4>
                        <div class="table-container border dark:border-slate-700 rounded-xl overflow-x-auto shadow-inner">
                            <table class="w-full text-sm text-slate-700 dark:text-slate-300 rota-table">
                                <thead class="sticky top-0 bg-slate-100 dark:bg-slate-700 z-10">
                                    <tr><th>Posição</th><th>Membro</th><th>Pontos de Falta</th></tr>
                                </thead>
                                <tbody id="member-ranking-body" class="bg-white dark:bg-darkcard"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div id="tab-setup" class="tab-pane hidden">
                    <div class="max-w-lg mx-auto bg-white dark:bg-darkcard p-8 rounded-xl shadow-lg border dark:border-slate-700">
                        <h4 class="text-2xl font-bold text-brand-text dark:text-white mb-2 text-center">Configurar o Evento Atual</h4>
                        <p class="text-slate-500 dark:text-slate-400 mb-6 text-center">Selecione o tipo de evento e a data antes de iniciar o registro.</p>
                        <form id="event-setup-form" class="space-y-6">
                            <div>
                                <label for="event-type-selector" class="block text-sm font-medium text-slate-700 dark:text-slate-300 text-left">Tipo de Evento</label>
                                <select id="event-type-selector" class="mt-1 block w-full rounded-lg border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm focus:ring focus:ring-opacity-50">
                                    <option value="Missa">Missa</option>
                                    <option value="Ensaio">Ensaio</option>
                                    <option value="Evento">Evento</option>
                                </select>
                            </div>
                            <div>
                                <label for="event-date-selector" class="block text-sm font-medium text-slate-700 dark:text-slate-300 text-left">Data</label>
                                <input type="date" id="event-date-selector" class="mt-1 block w-full rounded-lg border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm focus:ring focus:ring-opacity-50">
                            </div>
                            <button type="submit" id="event-setup-form-submit-btn" class="w-full bg-brand-blue text-white font-bold py-3 px-6 rounded-lg hover:bg-brand-dark-blue disabled:opacity-50 shadow-md transform hover:scale-[1.02] disabled:hover:scale-100" ${allMembers.length === 0 ? 'disabled' : ''}>
                                <i class="fas ${allMembers.length === 0 ? 'fa-spinner fa-spin' : 'fa-play-circle'} mr-2"></i><span>${allMembers.length === 0 ? 'Carregando Membros...' : 'Iniciar Registro'}</span>
                            </button>
                        </form>
                        <div id="current-event-display" class="mt-6 p-4 rounded-lg bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 hidden font-semibold text-center"></div>
                    </div>
                </div>
                <div id="tab-register" class="tab-pane hidden">
                    <div class="grid-container">
                        <h4 class="text-xl font-bold text-brand-text dark:text-white mb-2 border-b border-slate-200 dark:border-slate-700 pb-2">Registrar Presença ou Falta</h4>
                        <p class="text-slate-500 dark:text-slate-400 mb-6">Clique nos botões para registrar o status de cada membro.</p>
                        <div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" id="members-grid">
                            <div class="text-center col-span-full p-8 text-slate-500 dark:text-slate-400 bg-white dark:bg-darkcard rounded-xl shadow-md border dark:border-slate-700">
                                <i class="fas fa-info-circle mr-2"></i>Por favor, configure um evento.
                            </div>
                        </div>
                    </div>
                </div>
                <div id="tab-records" class="tab-pane hidden">
                    <div class="table-container h-full flex flex-col">
                        <div class="flex flex-wrap items-center justify-between mb-4 gap-4 flex-shrink-0">
                            <div class="flex flex-wrap items-center gap-4">
                                <h4 class="text-xl font-bold text-brand-text dark:text-white">Registros de Presença</h4>
                                <select id="member-filter-select" class="text-sm rounded-lg border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm focus:ring-brand-blue focus:ring-opacity-50"></select>
                            </div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <button id="export-xlsx-btn" class="bg-green-700 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-800 text-sm shadow-md transform hover:scale-[1.02]">
                                    <i class="fas fa-file-excel mr-2"></i>Exportar XLSX
                                </button>
                                <button id="export-pdf-btn" class="bg-red-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-red-700 text-sm shadow-md transform hover:scale-[1.02]">
                                    <i class="fas fa-file-pdf mr-2"></i>Exportar PDF
                                </button>
                                <button id="open-clear-confirmation-btn" class="bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-red-800 text-sm shadow-md transform hover:scale-[1.02]">
                                    <i class="fas fa-trash-alt mr-2"></i>Limpar Registros
                                </button>
                            </div>
                        </div>
                        <div class="table-container flex-grow overflow-y-auto border dark:border-slate-700 rounded-xl shadow-inner">
                            <table class="w-full text-sm text-left text-slate-700 dark:text-slate-300 rota-table">
                                <thead class="sticky top-0 bg-slate-100 dark:bg-slate-700 z-10">
                                    <tr>
                                        <th>Membro</th><th>Data</th><th>Evento</th><th>Status</th><th>Pontos</th><th>Justificativa</th><th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody id="attendance-table-body" class="bg-white dark:bg-darkcard"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
            <div id="attendance-feedback" class="p-4 bg-white dark:bg-darkcard border-t dark:border-slate-700 text-center text-sm h-5 font-medium transition-opacity duration-300 opacity-0 flex-shrink-0 shadow-xl"></div>
        </div>
    `;

    // 3. Apply active tab style and visibility
    container.querySelectorAll('.attendance-tab-button').forEach(btn => {
        btn.classList.remove('active', 'bg-brand-blue', 'text-white', 'text-slate-600', 'hover:bg-slate-200');
        btn.classList.add('text-slate-600', 'hover:bg-slate-200');
    });

    const activeBtn = container.querySelector(`.attendance-tab-button[data-tab="${activeTabName}"]`);
    const activePane = container.querySelector(`#tab-${activeTabName}`);

    if (activeBtn) {
        activeBtn.classList.add('active', 'bg-brand-blue', 'text-white');
        activeBtn.classList.remove('text-slate-600', 'hover:bg-slate-200');
    }
    container.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('hidden'));
    if (activePane) activePane.classList.remove('hidden');

    // 4. Setup all dynamic controls and listeners
    setupDashboard();
    setupDynamicListeners();
    
    // Restore event data if available
    const eventTypeSelector = document.getElementById('event-type-selector');
    const eventDateSelector = document.getElementById('event-date-selector');
    if (currentEvent && currentDate && eventTypeSelector && eventDateSelector) {
        eventTypeSelector.value = currentEvent;
        eventDateSelector.value = currentDate;
        const currentEventDisplay = document.getElementById('current-event-display');
        const formattedDate = new Date(currentDate + 'T00:00:00').toLocaleDateString('pt-BR', {timeZone: 'UTC'});
        currentEventDisplay.innerHTML = `Registro iniciado para: <strong class="font-semibold">${currentEvent}</strong> em <strong class="font-semibold">${formattedDate}</strong>.`;
        currentEventDisplay.classList.remove('hidden');
        populateMembersGrid();
    } else if (eventDateSelector) {
        // Set default date to today if nothing is set
        eventDateSelector.value = new Date().toISOString().split('T')[0];
    }
}

// Renomeada a função para evitar conflito de scopo/re-inicialização
function setupDynamicListeners() {
    const allMembers = getMembers();
    const allRecords = getRecords();
    const membersGrid = document.getElementById('members-grid');
    const attendanceTableBody = document.getElementById('attendance-table-body');
    const memberFilterSelect = document.getElementById('member-filter-select');
    const tabsContainer = document.getElementById('attendance-tabs');
    const registerTabBtn = tabsContainer?.querySelector('[data-tab="register"]');
    
    // 1. Tab Switching Listener (Delegate to container)
    // Usamos um listener no container que é reconstruído
    tabsContainer?.removeEventListener('click', handleTabClick); // Remove listener anterior se existir
    tabsContainer?.addEventListener('click', handleTabClick);

    function handleTabClick(e) {
        const targetButton = e.target.closest('.attendance-tab-button');
        if (!targetButton) return;
        
        const tabName = targetButton.dataset.tab;

        // Update active class on buttons (must be done on all buttons)
        tabsContainer.querySelectorAll('.attendance-tab-button').forEach(btn => {
            btn.classList.remove('active', 'bg-brand-blue', 'text-white');
            btn.classList.add('text-slate-600', 'hover:bg-slate-200');
        });
        targetButton.classList.add('active', 'bg-brand-blue', 'text-white');
        targetButton.classList.remove('text-slate-600', 'hover:bg-slate-200');

        // Toggle visibility of panes
        document.querySelectorAll('#tab-content-container .tab-pane').forEach(pane => {
            pane.classList.toggle('hidden', pane.id !== `tab-${tabName}`);
        });
        
        // Re-populate relevant content after switching
        if (tabName === 'dashboard') {
            setupDashboard();
        } else if (tabName === 'register') {
            populateMembersGrid();
        } else if (tabName === 'records') {
            const selectedId = memberFilterSelect?.value === 'all' ? null : memberFilterSelect?.value;
            populateMemberFilter(memberFilterSelect, allMembers);
            populateAttendanceTable(attendanceTableBody, allRecords, allMembers, selectedId);
        }
    }
    
    // 2. Setup/Register Form Logic (Initializes currentEvent/currentDate)
    const eventSetupForm = document.getElementById('event-setup-form');
    eventSetupForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const eventType = document.getElementById('event-type-selector').value;
        const date = document.getElementById('event-date-selector').value;
        if(!date) { showAttendanceFeedback('Por favor, selecione uma data.', true); return; }
        
        currentEvent = eventType;
        currentDate = date;
        
        const currentEventDisplay = document.getElementById('current-event-display');
        const formattedDate = new Date(currentDate + 'T00:00:00').toLocaleDateString('pt-BR', {timeZone: 'UTC'});
        currentEventDisplay.innerHTML = `Registro iniciado para: <strong class="font-semibold">${currentEvent}</strong> em <strong class="font-semibold">${formattedDate}</strong>.`;
        currentEventDisplay.classList.remove('hidden');
        
        populateMembersGrid();
        showAttendanceFeedback('Evento configurado! Pode registar presenças.', false);

        // **Ação Crítica: Transição Automática para a aba 'Registrar Presença'**
        // Simula o clique na aba 'Registrar Presença'
        if (registerTabBtn) {
            registerTabBtn.click();
        }
    });
    
    // 3. Presence Button Clicks (Delegate)
    if(membersGrid) {
        membersGrid.addEventListener('click', (e) => {
            const presenceBtn = e.target.closest('.mark-presence-btn');
            const absenceBtn = e.target.closest('.mark-absence-btn');
            if (presenceBtn) { registerAttendance(presenceBtn.dataset.memberId, 'Presente'); } 
            else if (absenceBtn) { openJustificationModal(absenceBtn.dataset.memberId); }
        });
    }

    // 4. Records Table Clicks (Delegate for Edit/Delete)
    if (attendanceTableBody) {
        attendanceTableBody.addEventListener('click', (e) => { 
            if(e.target.matches('.edit-record-btn')) { 
                 openEditModal(e.target.dataset.recordId); 
            } else if (e.target.matches('.delete-record-btn')) {
                deleteAttendanceRecord(e.target.dataset.recordId);
            }
        });
    }
    
    // 5. Records Filter Change
    if(memberFilterSelect) {
        memberFilterSelect.onchange = (e) => {
            const selectedMemberId = e.target.value;
            populateAttendanceTable(attendanceTableBody, allRecords, allMembers, selectedMemberId === 'all' ? null : selectedMemberId);
        };
    }
    
    // 6. Export / Clear Listeners
    document.getElementById('export-xlsx-btn')?.addEventListener('click', () => exportAttendance('xlsx', memberFilterSelect.value));
    document.getElementById('export-pdf-btn')?.addEventListener('click', () => exportAttendance('pdf', memberFilterSelect.value));
    document.getElementById('open-clear-confirmation-btn')?.addEventListener('click', clearAllAttendanceRecords);

    // 7. Edit Record Form submit handler
    document.getElementById('edit-record-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target;
        const recordId = form.querySelector('#edit-record-id').value;
        const memberId = form.querySelector('#edit-member-id').value;
        const updatedData = {
            date: form.querySelector('#edit-date').value,
            eventType: form.querySelector('#edit-event-type').value,
            status: form.querySelector('#edit-status').value,
            justification: form.querySelector('#edit-justification').value
        };
        updateAttendanceRecord(recordId, memberId, updatedData);
    });
}

// --- Dynamic Grid Population ---
function populateMembersGrid() {
    const allMembers = getMembers();
    const allRecords = getRecords();
    const membersGrid = document.getElementById('members-grid');

    if (!membersGrid) return;

    membersGrid.innerHTML = '';
    if (!currentEvent || !currentDate) { membersGrid.innerHTML = `<div class="text-center col-span-full p-8 text-slate-500 dark:text-slate-400 bg-white dark:bg-darkcard rounded-xl shadow-md border dark:border-slate-700"><i class="fas fa-info-circle mr-2"></i>Por favor, configure um evento para começar.</div>`; return; }
    if (allMembers.length === 0) { membersGrid.innerHTML = `<div class="text-center col-span-full p-8 text-slate-500 dark:text-slate-400 bg-white dark:bg-darkcard rounded-xl shadow-md border dark:border-slate-700"><i class="fas fa-users mr-2"></i>Nenhum membro encontrado. Carregando...</div>`; return; }
    
    allMembers.forEach(member => {
        const card = document.createElement('div');
        card.className = 'member-card p-4 border rounded-xl shadow-lg bg-white dark:bg-darkcard flex flex-col items-center text-center transition-all duration-300 dark:border-slate-700';
        const todaysRecord = allRecords.find(rec => rec.memberId === member.id && rec.date === currentDate && rec.eventType === currentEvent);
        
        let presenceBtnClass = "mark-presence-btn flex-1 bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition-all text-sm shadow-md";
        let absenceBtnClass = "mark-absence-btn flex-1 bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 transition-all text-sm shadow-md";
        let buttonWrapperClass = "mt-4 flex gap-3 attendance-buttons w-full";
        
        if (todaysRecord) {
            buttonWrapperClass += ' selected';
            if (todaysRecord.status === 'Presente') { presenceBtnClass += ' selected-btn'; } 
            else if (todaysRecord.status === 'Ausente') { absenceBtnClass += ' selected-btn'; }
        }
        card.innerHTML = `<h5 class="text-lg font-bold text-brand-text dark:text-white">${member.name}</h5><p class="text-sm text-slate-500 dark:text-slate-400 mb-2">Pontos: <span class="font-bold text-red-600">${member.totalPoints || 0}</span></p><div class="${buttonWrapperClass}"><button data-member-id="${member.id}" class="${presenceBtnClass}"><i class="fas fa-check mr-1"></i> Presente</button><button data-member-id="${member.id}" class="${absenceBtnClass}"><i class="fas fa-times mr-1"></i> Ausente</button></div>`;
        membersGrid.appendChild(card);
    });
}

// --- Attendance Table Population ---
function populateMemberFilter(selectEl, allMembers) {
    if (!selectEl) return;
    const currentVal = selectEl.value;
    selectEl.innerHTML = `<option value="all">Todos os Membros</option>`;
    allMembers.forEach(member => {
        selectEl.innerHTML += `<option value="${member.id}">${member.name}</option>`;
    });
    selectEl.value = currentVal;
}

function populateAttendanceTable(tableBody, allRecords, allMembers, memberId = null) {
    if (!tableBody) return;
    let filteredRecords = memberId ? allRecords.filter(rec => rec.memberId === memberId) : allRecords;
    
    tableBody.innerHTML = filteredRecords.map(rec => {
        const member = allMembers.find(m => m.id === rec.memberId);
        const statusClass = rec.status === 'Presente' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
        const dateString = rec.date ? new Date(rec.date + 'T00:00:00').toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'Data inválida';
        
        return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-700">
                    <td>${member ? member.name : 'Desconhecido'}</td>
                    <td>${dateString}</td><td>${rec.eventType || 'N/A'}</td>
                    <td><span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">${rec.status}</span></td>
                    <td class="font-bold ${rec.points > 0 ? 'text-red-600' : ''}">${rec.points}</td>
                    <td class="text-xs">${rec.justification || '---'}</td>
                    <td class="flex items-center gap-2">
                        <button data-record-id="${rec.id}" class="edit-record-btn text-brand-blue hover:text-brand-dark-blue text-sm font-semibold transition-colors">Editar</button>
                        <button data-record-id="${rec.id}" class="delete-record-btn text-red-500 hover:text-red-700 text-sm font-semibold transition-colors">Excluir</button>
                    </td>
                </tr>`;
    }).join('');
}

// --- Justification Modal ---
function openJustificationModal(memberId) {
    const allMembers = getMembers();
    const member = allMembers.find(m => m.id === memberId);
    const justificationModal = document.getElementById('justification-modal');
    const confirmJustificationBtn = document.getElementById('confirm-justification-btn');

    if (!member || !justificationModal) return;
    
    justificationModal.querySelector('#justification-title').textContent = `Justificar Ausência: ${member.name}`;
    confirmJustificationBtn.dataset.memberId = member.id;
    justificationModal.querySelector('#justification-text').value = '';
    
    justificationModal.classList.remove('hidden');
    justificationModal.classList.add('is-open'); // Mark as open
    
    setTimeout(() => { 
        justificationModal.classList.remove('opacity-0'); 
        justificationModal.querySelector('.modal-content').classList.remove('scale-95', 'opacity-0'); 
    }, 10);
    
    document.getElementById('cancel-justification-btn').onclick = closeJustificationModal;
    confirmJustificationBtn.onclick = () => {
        const memberId = confirmJustificationBtn.dataset.memberId;
        const justification = justificationModal.querySelector('#justification-text').value;
        registerAttendance(memberId, 'Ausente', justification);
        closeJustificationModal();
    };
}

function closeJustificationModal() {
    const modal = document.getElementById('justification-modal');
    if(!modal) return;
    const content = modal.querySelector('.modal-content');
    content.classList.add('scale-95', 'opacity-0');
    modal.classList.add('opacity-0');
    modal.classList.remove('is-open');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// --- Edit Modal Logic ---

function openEditModal(recordId) {
    const allRecords = getRecords();
    const allMembers = getMembers();
    const record = allRecords.find(r => r.id === recordId);
    const member = allMembers.find(m => m.id === record.memberId);
    const editRecordModal = document.getElementById('edit-record-modal');

    if(!record || !member || !editRecordModal) return;
    
    editRecordModal.querySelector('#edit-record-id').value = record.id;
    editRecordModal.querySelector('#edit-member-id').value = record.memberId;
    editRecordModal.querySelector('#edit-member-name').textContent = member.name;
    editRecordModal.querySelector('#edit-date').value = record.date;
    editRecordModal.querySelector('#edit-event-type').value = record.eventType;
    editRecordModal.querySelector('#edit-status').value = record.status;
    editRecordModal.querySelector('#edit-justification').value = record.justification || '';

    editRecordModal.classList.remove('hidden');
    editRecordModal.classList.add('is-open');
    setTimeout(() => { editRecordModal.classList.remove('opacity-0'); editRecordModal.querySelector('.modal-content').classList.remove('scale-95', 'opacity-0'); }, 10);
    
    document.getElementById('close-edit-record-modal').onclick = closeEditModal;
    document.getElementById('cancel-edit-btn').onclick = closeEditModal;
}

function closeEditModal() {
    const editRecordModal = document.getElementById('edit-record-modal');
    if(!editRecordModal) return;
    const content = editRecordModal.querySelector('.modal-content');
    content.classList.add('scale-95', 'opacity-0');
    editRecordModal.classList.add('opacity-0');
    editRecordModal.classList.remove('is-open');
    setTimeout(() => editRecordModal.classList.add('hidden'), 300);
}

// --- Core CRUD Operations ---

function calculatePoints(eventType, status, justification) {
    if (status === 'Presente') return 0;
    if (justification && justification.trim() !== '') return 0;
    switch (eventType) {
        case 'Missa': return 5; 
        case 'Ensaio': return 4; 
        case 'Evento': return 10; 
        default: return 0;
    }
}

async function registerAttendance(memberId, status, justification = '') {
    if (!currentEvent || !currentDate) { showAttendanceFeedback('Por favor, configure o evento e a data primeiro.', true); return; }
    
    const allMembers = getMembers();
    const member = allMembers.find(m => m.id === memberId);
    if (!member) { showAttendanceFeedback('Membro não encontrado.', true); return; }
    
    const db = getDB();
    const appId = getAppId();

    const recordId = `${currentDate}_${currentEvent}_${memberId}`.replace(/\s+/g, '-');
    const recordRef = getDocRef(`artifacts/${appId}/public/data/attendance`, recordId);
    const memberRef = getDocRef(`artifacts/${appId}/public/data/members`, memberId);
    
    try {
        await runTransaction(db, async (transaction) => {
            const recordDoc = await transaction.get(recordRef);
            const memberDoc = await transaction.get(memberRef);
            
            if (!memberDoc.exists()) { throw "Documento do membro não encontrado!"; }
            
            const oldPoints = recordDoc.exists() ? Number(recordDoc.data().points || 0) : 0;
            const newPoints = calculatePoints(currentEvent, status, justification);
            const pointDifference = newPoints - oldPoints;
            
            transaction.update(memberRef, { totalPoints: increment(pointDifference) });
            
            const recordData = { 
                memberId, 
                memberName: member.name, 
                eventType: currentEvent, 
                date: currentDate, 
                status, 
                justification: justification || '', 
                points: newPoints, 
                createdAt: recordDoc.exists() ? recordDoc.data().createdAt : new Date().toISOString() // Keep original creation date
            };
            transaction.set(recordRef, recordData);
        });
        
        const details = `Definiu ${member.name} como ${status} para ${currentEvent} em ${currentDate}. Justificativa: ${justification || 'nenhuma'}`;
        logAction('Presença Registrada', 'Controle de Presença', details);
        
        showAttendanceFeedback(`Registro de ${member.name} salvo como '${status}'.`, false);
        
        if (status === 'Ausente') {
            triggerWhatsAppNotification(member.name, currentEvent, currentDate, justification);
        }

    } catch (error) { 
        console.error("Erro na transação de presença: ", error); 
        showAttendanceFeedback("Erro ao salvar o registro.", true); 
    } finally {
        // UI re-renders via onSnapshot
    }
}

async function updateAttendanceRecord(recordId, memberId, updatedData) {
    const db = getDB();
    const appId = getAppId();
    const member = getMembers().find(m => m.id === memberId);
    if (!member) { showAttendanceFeedback("Membro não encontrado.", true); return; }

    const recordRef = getDocRef(`artifacts/${appId}/public/data/attendance`, recordId);
    const memberRef = getDocRef(`artifacts/${appId}/public/data/members`, memberId);
    
    try {
        await runTransaction(db, async (transaction) => {
            const originalRecordDoc = await transaction.get(recordRef);
            if (!originalRecordDoc.exists()) { throw "Registro original não encontrado na transação!"; }
            
            const originalRecord = originalRecordDoc.data();
            const newRecordId = `${updatedData.date}_${updatedData.eventType}_${memberId}`.replace(/\s+/g, '-');
            
            const oldPoints = Number(originalRecord.points || 0);
            const newPoints = calculatePoints(updatedData.eventType, updatedData.status, updatedData.justification);
            const pointDifference = newPoints - oldPoints;
            
            transaction.update(memberRef, { totalPoints: increment(pointDifference) });

            if (recordId !== newRecordId) {
                transaction.delete(recordRef);
            }
            
            const newRecordRef = getDocRef(`artifacts/${appId}/public/data/attendance`, newRecordId);
            const newRecordData = { 
                memberId: originalRecord.memberId, 
                memberName: originalRecord.memberName, 
                createdAt: originalRecord.createdAt, 
                ...updatedData, 
                points: newPoints 
            };
            transaction.set(newRecordRef, newRecordData);
        });
        
        const details = `Registro atualizado para ${member.name}. Novo status: ${updatedData.status} em ${updatedData.date}`;
        logAction('Registro de Presença Atualizado', 'Controle de Presença', details);
        showAttendanceFeedback("Registro atualizado com sucesso!", false);
        closeEditModal();
        // UI re-renders via onSnapshot
        
    } catch (error) {
        console.error("Erro ao atualizar registro:", error);
        showAttendanceFeedback("Falha ao atualizar o registro. Tente novamente.", true);
    }
}

async function deleteAttendanceRecord(recordId) {
    const currentUser = getCurrentUser();
    if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) return;

    openConfirmationModal(
        "Tem certeza que deseja excluir este registro de presença? Os pontos serão revertidos. Esta ação é irreversível.",
        async () => {
            const db = getDB();
            const appId = getAppId();
            const recordRef = getDocRef(`artifacts/${appId}/public/data/attendance`, recordId);
            const recordToDelete = getRecords().find(r => r.id === recordId);
            
            try {
                await runTransaction(db, async (transaction) => {
                    const recordDoc = await transaction.get(recordRef);
                    if (!recordDoc.exists()) { throw "Registro não encontrado."; }

                    const recordData = recordDoc.data();
                    const pointsToReverse = Number(recordData.points || 0);
                    const memberId = recordData.memberId;
                    
                    if (memberId && pointsToReverse !== 0) {
                        const memberRef = getDocRef(`artifacts/${appId}/public/data/members`, memberId);
                        transaction.update(memberRef, { totalPoints: increment(-pointsToReverse) });
                    }
                    
                    transaction.delete(recordRef);
                });
                
                logAction('Registro de Presença Excluído', 'Controle de Presença', `Registro excluído de ${recordToDelete.memberName} para ${recordToDelete.date}`);
                showAttendanceFeedback("Registro excluído e pontos revertidos com sucesso.", false);
                // UI re-renders via onSnapshot
                
            } catch (error) {
                console.error("Error deleting attendance record:", error);
                showAttendanceFeedback("Erro ao excluir o registro.", true);
            }
        }
    );
}

async function clearAllAttendanceRecords() {
    const currentUser = getCurrentUser();
    if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) return;

    openConfirmationModal(
        'Tem a certeza que deseja apagar TODOS os registos de presença? Esta ação é irreversível e irá ZERAR as pontuações de todos os membros.',
        async () => {
            showAttendanceFeedback("A limpar registos...", false, -1);
            try {
                const db = getDB();
                const appId = getAppId();
                const attendanceSnapshot = await getDocs(getCollectionRef(`artifacts/${appId}/public/data/attendance`));
                const batch1 = writeBatch(db);
                attendanceSnapshot.forEach(doc => batch1.delete(doc.ref));
                await batch1.commit();
                
                const membersSnapshot = await getDocs(getCollectionRef(`artifacts/${appId}/public/data/members`));
                const batch2 = writeBatch(db);
                membersSnapshot.forEach(doc => { 
                    batch2.update(doc.ref, { totalPoints: 0 }); 
                });
                await batch2.commit();
                
                logAction('Limpou Históricos de Presença', 'Controle de Presença');
                showAttendanceFeedback("Todos os registos foram apagados!", false);
            } catch(error) { 
                console.error("Error clearing records:", error); 
                showAttendanceFeedback("Erro ao limpar registos.", true); 
            } 
        }
    );
}


// --- Export Logic ---
function exportAttendance(format, memberId) {
    const allRecords = getRecords();
    const allMembers = getMembers();
    let recordsToExport = allRecords;
    let memberName = 'Todos';

    if (memberId !== 'all') {
        recordsToExport = allRecords.filter(rec => rec.memberId === memberId);
        const member = allMembers.find(m => m.id === memberId);
        if (member) memberName = member.name.replace(/\s+/g, '_');
    }

    if (recordsToExport.length === 0) { showAttendanceFeedback(`Não há registros para exportar para ${memberName}.`, true); return; }

    const data = recordsToExport.map(rec => { 
        const member = allMembers.find(m => m.id === rec.memberId); 
        return { 
            'Membro': member ? member.name : 'Desconhecido', 
            'Data': rec.date ? new Date(rec.date + 'T00:00:00').toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'Data inválida', 
            'Evento': rec.eventType, 
            'Status': rec.status, 
            'Pontos': rec.points, 
            'Justificativa': rec.justification || '---' 
        }; 
    });

    if (format === 'xlsx') {
        if (typeof XLSX === 'undefined') { showAttendanceFeedback('Erro: A biblioteca XLSX não está carregada.', true); return; }
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Presença");
        XLSX.writeFile(workbook, `Registros_Presenca_Uziel_${memberName}.xlsx`);
        logAction('Exportação', 'Controle de Presença', `Exportou dados para XLSX para ${memberName}.`);
    } else if (format === 'pdf') {
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') { showAttendanceFeedback('Erro: A biblioteca jsPDF não está carregada.', true); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'pt', 'a4');
        const tableData = data.map(row => Object.values(row)); 
        
        doc.autoTable({ 
            head: [['Membro', 'Data', 'Evento', 'Status', 'Pontos', 'Justificativa']], 
            body: tableData, 
            startY: 60, 
            headStyles: { fillColor: '#29aae2' } 
        });
        
        doc.setFontSize(18); 
        doc.setTextColor('#334155'); 
        doc.text('Relatório de Presença e Pontuação', 40, 40);
        doc.save(`Registros_Uziel_${memberName}.pdf`);
        logAction('Exportação', 'Controle de Presença', `Exportou dados para PDF para ${memberName}.`);
    }
}


// --- WHATSAPP NOTIFICATION LOGIC ---

function triggerWhatsAppNotification(absentMemberName, eventType, eventDate, justification) {
    if (!isAutoNotifyEnabled()) {
        console.log("Notificação não enviada: O envio automático está desativado pelo Super Admin.");
        return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) {
        console.warn("Notificação não enviada: Apenas administradores podem enviar notificações.");
        return;
    }

    const senderUsername = getSenderUsername();
    const userCredentials = getUserCredentials();
    const sender = userCredentials.find(u => u.username === senderUsername);
    const recipient = userCredentials.find(u => u.name === absentMemberName);

    if (!sender || !sender.whatsapp) {
        console.warn('Remetente do WhatsApp não configurado ou sem número.');
        showAttendanceFeedback("Aviso: Remetente do WhatsApp não configurado. Notificação não enviada.", true);
        return;
    }
    if (!recipient || !recipient.whatsapp) {
        console.warn(`Membro ${absentMemberName} não possui número de WhatsApp cadastrado.`);
        showAttendanceFeedback(`Aviso: O membro ${absentMemberName} não possui número de WhatsApp cadastrado. Notificação não enviada.`, true);
        return;
    }

    const formattedDate = new Date(eventDate + 'T00:00:00').toLocaleDateString('pt-BR', {timeZone: 'UTC'});
    const justificationText = justification ? `Justificativa: "${justification}"` : "Falta sem justificativa.";

    const message = `Olá, ${recipient.name.split(' ')[0]}! Paz e bem.

Este é um aviso automático do Portal do Ministério Uziel.
Foi registrada uma falta para você no evento *${eventType}* do dia *${formattedDate}*.

Status: ${justificationText}

Qualquer dúvida, por favor, entre em contato com a liderança.
Deus abençoe!`;

    const whatsappUrl = `https://wa.me/${recipient.whatsapp}?text=${encodeURIComponent(message)}`;
    
    logAction('Notificação WhatsApp', 'Controle de Presença', `Tentativa de notificar ${recipient.name} (${recipient.whatsapp}) sobre falta em ${eventDate}.`);

    window.open(whatsappUrl, '_blank');
}

function setupDashboard() {
    const allRecords = getRecords();
    const allMembers = getMembers();
    
    const totalPresence = allRecords.filter(r => r.status === 'Presente').length;
    const totalAbsence = allRecords.filter(r => r.status === 'Ausente').length;
    const total = totalPresence + totalAbsence;
    const presenceRate = total === 0 ? 0 : Math.round((totalPresence / total) * 100);
    
    const statPresenceEl = document.getElementById('stat-total-presence');
    if (statPresenceEl) {
         statPresenceEl.textContent = totalPresence;
         document.getElementById('stat-total-absence').textContent = totalAbsence;
         document.getElementById('stat-presence-rate').textContent = `${presenceRate}%`;
    }

    const sortedMembers = [...allMembers].sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
    const memberRankingBody = document.getElementById('member-ranking-body');
    if(memberRankingBody) { 
        memberRankingBody.innerHTML = sortedMembers.map((member, index) => 
            `<tr class="hover:bg-slate-50 dark:hover:bg-slate-700"><td>${index + 1}º</td><td class="font-semibold">${member.name}</td><td class="font-bold text-red-600">${member.totalPoints || 0}</td></tr>`
        ).join(''); 
    }
}