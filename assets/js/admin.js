import { 
    logAction, 
    getDB, 
    getAppId, 
    getAuditLogs, 
    getMembers, 
    getCollectionRef, 
    writeBatch, 
    getDocs,
    getDocRef
} from './firebase.js';
import { 
    getCurrentUser, 
    isSuperAdmin, 
    getUserCredentials, 
    saveUserCredentials, 
    updateUser, 
    createNewUser, 
    deleteUser,
    updateNotificationConfig,
    getSenderUsername,
    isAutoNotifyEnabled
} from './auth.js';
import { setupModalInteraction, openConfirmationModal, showFeedback } from './ui.js';

const ATTENDANCE_FEEDBACK = 'attendance-feedback';


// ===================================
// USER MANAGEMENT (UI Logic)
// ===================================

export function initializeUserManagement() {
    setupModalInteraction('user-management-modal', 'open-user-management-modal', 'close-user-management-modal', populateUsersTable);
    setupModalInteraction('edit-user-modal', null, 'close-edit-user-modal');

    const createUserForm = document.getElementById('create-user-form');
    const usersTableBody = document.getElementById('users-table-body');
    
    // Listener for Create User
    createUserForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('create-user-error');
        errorEl.textContent = '';
        
        const name = document.getElementById('new-user-name').value.trim();
        const usernamePrefix = document.getElementById('new-user-username').value.trim();
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;
        
        const success = await createNewUser(name, usernamePrefix, password, role, errorEl);
        
        if (success) {
            createUserForm.reset();
            populateUsersTable();
        }
    });

    // Listener for Edit/Delete actions (Delegated from table body)
    usersTableBody?.addEventListener('click', (e) => {
        const target = e.target;
        const username = target.dataset.username;
        const user = getUserCredentials().find(u => u.username === username);
        
        if (!user || !getCurrentUser()) return;
        
        const loggedInUserIsSuperAdmin = isSuperAdmin(getCurrentUser());
        const userToEditIsAdmin = user.role === 'admin' || user.role === 'super-admin';
        
        if (target.matches('.delete-user-btn')) {
            if (!target.disabled) {
                openConfirmationModal(
                    `Tem a certeza que deseja excluir ${user.name}? Esta ação irá remover também todo o seu histórico de presenças e é irreversível.`,
                    async () => {
                        await deleteUser(username, user);
                        populateUsersTable();
                    }
                );
            }
        } else if (target.matches('.edit-user-btn')) {
            if (!target.disabled) {
                openEditUserModal(user);
            }
        }
    });
    
    // Listener for Save Edit User
    document.getElementById('edit-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const originalUsername = form.querySelector('#edit-user-original-username').value;
        const newName = form.querySelector('#edit-user-name').value.toUpperCase().trim();
        const newRole = form.querySelector('#edit-user-role').value;
        const newPassword = form.querySelector('#edit-user-password').value;
        const errorEl = form.querySelector('#edit-user-error');
        errorEl.textContent = '';
        
        const success = await updateUser(originalUsername, newName, newRole, newPassword, errorEl);
        
        if (success) {
            populateUsersTable();
            closeEditUserModal();
        }
    });
}

function openEditUserModal(user) {
    const editUserModal = document.getElementById('edit-user-modal');
    const currentUser = getCurrentUser();
    if (!user || !editUserModal || !currentUser) return;

    const loggedInUserIsSuperAdmin = isSuperAdmin(currentUser);
    const userToEditIsAdmin = user.role === 'admin' || user.role === 'super-admin'; 

    editUserModal.querySelector('#edit-user-original-username').value = user.username;
    editUserModal.querySelector('#edit-user-name').value = user.name;
    editUserModal.querySelector('#edit-user-username-display').value = user.username;
    
    const roleSelect = editUserModal.querySelector('#edit-user-role');
    const passwordInput = editUserModal.querySelector('#edit-user-password');
    
    roleSelect.value = user.role;
    passwordInput.value = '';
    editUserModal.querySelector('#edit-user-error').textContent = '';

    const canChangeRole = loggedInUserIsSuperAdmin || !userToEditIsAdmin;
    roleSelect.disabled = !canChangeRole || (user.username === currentUser.username && loggedInUserIsSuperAdmin); // Cannot change own role if Super Admin
    
    passwordInput.parentElement.style.display = 'block'; // Always show for super-admin or if editing non-admin
    if (!loggedInUserIsSuperAdmin && userToEditIsAdmin) {
         passwordInput.parentElement.style.display = 'none'; // Restrict password change if non-SA tries to edit admin/SA
    }


    passwordInput.setAttribute('placeholder', loggedInUserIsSuperAdmin ? `Senha atual: ${user.password}` : '••••••••');

    editUserModal.classList.remove('hidden');
    editUserModal.classList.add('is-open');
    setTimeout(() => { editUserModal.classList.remove('opacity-0'); editUserModal.querySelector('.modal-content').classList.remove('scale-95', 'opacity-0'); }, 10);
}

function closeEditUserModal() {
    const editUserModal = document.getElementById('edit-user-modal');
    if(!editUserModal) return;
    const content = editUserModal.querySelector('.modal-content');
    content.classList.add('scale-95', 'opacity-0');
    editUserModal.classList.add('opacity-0');
    editUserModal.classList.remove('is-open');
    setTimeout(() => editUserModal.classList.add('hidden'), 300);
}


export function populateUsersTable() {
    const usersTableBody = document.getElementById('users-table-body');
    const currentUser = getCurrentUser();
    const userCredentials = getUserCredentials();
    if (!usersTableBody || !currentUser) return;
    usersTableBody.innerHTML = '';

    const loggedInUserIsSuperAdmin = isSuperAdmin(currentUser);

    userCredentials.forEach(user => {
        const userInRowIsAdmin = user.role === 'admin' || user.role === 'super-admin';
        const userInRowIsSelf = user.username === currentUser.username;
        
        // Can edit if SA, or if editing a non-admin user
        const canEdit = loggedInUserIsSuperAdmin || !userInRowIsAdmin;
        // Can delete if not self, and (SA OR non-admin)
        const canDelete = !userInRowIsSelf && (loggedInUserIsSuperAdmin || !userInRowIsAdmin);

        const editButton = `<button data-username="${user.username}" class="edit-user-btn text-sm font-semibold ${canEdit ? 'text-brand-blue hover:text-brand-dark-blue' : 'text-slate-400 cursor-not-allowed'}" ${!canEdit ? 'disabled' : ''}>Editar</button>`;
        const deleteButton = `<button data-username="${user.username}" class="delete-user-btn text-sm font-semibold ${canDelete ? 'text-red-500 hover:text-red-700' : 'text-slate-400 cursor-not-allowed'}" ${!canDelete ? 'disabled' : ''}>Excluir</button>`;
        
        usersTableBody.innerHTML += `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700">
                <td class="p-3">${user.name}</td>
                <td class="p-3">${user.username}</td>
                <td class="p-3"><span class="px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'admin' || user.role === 'super-admin' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' : 'bg-slate-100 text-slate-800 dark:bg-slate-600 dark:text-slate-200'}">${user.role}</span></td>
                <td class="p-3 flex gap-4">
                    ${editButton}
                    ${deleteButton}
                </td>
            </tr>
        `;
    });
}


// ===================================
// WHATSAPP CONFIGURATION (Super Admin)
// ===================================

export function initializeWhatsAppConfig() {
    setupModalInteraction('whatsapp-config-modal', 'open-whatsapp-config-modal', 'close-whatsapp-config-modal', populateWhatsAppConfigModal);
    document.getElementById('save-whatsapp-config-btn')?.addEventListener('click', saveWhatsAppConfig);
}

function populateWhatsAppConfigModal() {
    const senderSelect = document.getElementById('notification-sender-select');
    const tableBody = document.getElementById('whatsapp-numbers-table-body');
    const toggle = document.getElementById('notification-toggle');
    const toggleLabel = document.getElementById('notification-toggle-label');
    const userCredentials = getUserCredentials();
    
    if (!senderSelect || !tableBody || !toggle || !toggleLabel) return;
    
    // Set toggle state
    const enabled = isAutoNotifyEnabled();
    toggle.checked = enabled;
    toggleLabel.textContent = enabled ? 'Notificações automáticas estão ativadas.' : 'Notificações automáticas estão desativadas.';

    // Setup toggle listener (only runs once as part of initializeWhatsAppConfig)
    if (!toggle.hasAttribute('data-listener-attached')) {
         toggle.onchange = () => {
             toggleLabel.textContent = toggle.checked ? 'Notificações automáticas estão ativadas.' : 'Notificações automáticas estão desativadas.';
             updateNotificationConfig(senderSelect.value, toggle.checked); // Save immediately
         };
         toggle.setAttribute('data-listener-attached', 'true');
    }
    
    senderSelect.innerHTML = '<option value="">-- Selecione um Remetente --</option>';
    tableBody.innerHTML = '';

    userCredentials.forEach(user => {
        senderSelect.innerHTML += `<option value="${user.username}">${user.name}</option>`;
        tableBody.innerHTML += `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-700">
                <td class="font-semibold">${user.name}</td>
                <td>${user.username}</td>
                <td>
                    <input type="tel" 
                            data-username="${user.username}" 
                            class="whatsapp-number-input mt-1 block w-full rounded-lg border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm focus:ring focus:ring-opacity-50" 
                            placeholder="55119..." 
                            value="${user.whatsapp || ''}">
                </td>
            </tr>
        `;
    });

    // Set saved sender
    const savedSender = getSenderUsername();
    if (savedSender) {
        senderSelect.value = savedSender;
    }
}

function saveWhatsAppConfig() {
    const feedbackEl = document.getElementById('whatsapp-config-feedback');
    try {
        const senderSelect = document.getElementById('notification-sender-select');
        const newSenderUsername = senderSelect.value;
        const notificationsEnabled = document.getElementById('notification-toggle').checked;
        
        // 1. Update WhatsApp numbers in local credentials array
        let updatedCredentials = getUserCredentials().map(user => {
            const input = document.querySelector(`.whatsapp-number-input[data-username="${user.username}"]`);
            if (input) {
                user.whatsapp = input.value.replace(/\D/g, ''); // Remove non-digits
            }
            return user;
        });

        // 2. Update global configuration in auth.js and save local credentials
        updateNotificationConfig(newSenderUsername, notificationsEnabled);
        saveUserCredentials(updatedCredentials); 
        
        // 3. Logging and Feedback
        const notificationsStatus = notificationsEnabled ? 'Ativadas' : 'Desativadas';
        logAction('Config. do WhatsApp Salva', 'Notificações do WhatsApp', `Remetente: ${newSenderUsername}, Auto-Notificações: ${notificationsStatus}`);

        feedbackEl.textContent = 'Configurações salvas com sucesso!';
        feedbackEl.className = 'text-green-600 text-sm font-medium h-5 transition-opacity duration-300 opacity-100';
    } catch (error) {
        console.error("Erro ao salvar config. do WhatsApp:", error);
        feedbackEl.textContent = 'Erro ao salvar configurações.';
        feedbackEl.className = 'text-red-600 text-sm font-medium h-5 transition-opacity duration-300 opacity-100';
    } finally {
        setTimeout(() => { feedbackEl.classList.add('opacity-0'); }, 3000);
    }
}


// ===================================
// AUDIT LOG (Super Admin)
// ===================================

export function renderAuditLog() {
    const tableBody = document.getElementById('audit-log-table-body');
    const searchInput = document.getElementById('audit-log-search');
    const allAuditLogs = getAuditLogs();
    if (!tableBody || !searchInput) return;

    const searchTerm = searchInput.value.toLowerCase();

    // Filter logs based on search term
    const filteredLogs = allAuditLogs.filter(log => {
        if (!searchTerm) return true;
        const timestamp = log.timestamp ? log.timestamp.toDate().toLocaleString('pt-BR') : '';
        // Check all relevant fields for the search term
        return (
            log.user?.toLowerCase().includes(searchTerm) ||
            log.module?.toLowerCase().includes(searchTerm) ||
            log.action?.toLowerCase().includes(searchTerm) ||
            log.details?.toLowerCase().includes(searchTerm) ||
            timestamp.toLowerCase().includes(searchTerm)
        );
    });

    if (filteredLogs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-8 text-slate-500 dark:text-slate-400">${searchTerm ? 'Nenhum log corresponde à sua pesquisa.' : 'Nenhum log de atividade encontrado.'}</td></tr>`;
        return;
    }

    tableBody.innerHTML = filteredLogs.map(log => {
        const timestamp = log.timestamp ? log.timestamp.toDate().toLocaleString('pt-BR') : 'N/A';
        return `
            <tr class="hover:bg-slate-100 dark:hover:bg-slate-700">
                <td class="whitespace-nowrap">${timestamp}</td>
                <td>${log.user}</td>
                <td>${log.module}</td>
                <td class="font-semibold">${log.action}</td>
                <td class="text-xs">${log.details || '---'}</td>
            </tr>
        `;
    }).join('');
}

export async function clearAuditLog() {
    const currentUser = getCurrentUser();
    if (!currentUser || !isSuperAdmin(currentUser)) return;
    
    openConfirmationModal(
        "Tem certeza que deseja apagar TODO o histórico de rastreabilidade? Esta ação é irreversível.",
        async () => {
            try {
                const db = getDB();
                const appId = getAppId();
                const logsCol = getCollectionRef(`artifacts/${appId}/public/data/audit_logs`);
                const snapshot = await getDocs(logsCol);
                const batch = writeBatch(db);
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                await logAction('Limpou Log de Rastreabilidade', 'Rastreabilidade', 'Todos os logs foram excluídos.');
                // The onSnapshot will automatically clear the table
            } catch (error) {
                console.error("Erro ao limpar o log de auditoria:", error);
                alert("Erro ao limpar o histórico de logs.");
            }
        }
    );
}