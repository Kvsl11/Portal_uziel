import { logAction, getDB, getAppId, getAuthInstance, getMembers, getCollectionRef, addDoc, updateDoc, where, query, getDocs, SUPER_ADMIN_USERNAME, writeBatch, doc, deleteDoc as fsDeleteDoc } from './firebase.js';
import { handleHeaderScroll, showFeedback } from './ui.js'; // Adicionei showFeedback aqui para melhor UX

// --- CONFIGURAÇÃO INICIAL (Dados Locais Seguros) ---
let userCredentials = [];
let notificationSenderUsername = null;
let automaticNotificationsEnabled = true;

const initialUserCredentials = [
    { username: 'kaio@uziel.com', password: '1103', name: 'KAIO VINICIUS', role: 'super-admin', whatsapp: '' },
    { username: 'junior@uziel.com', password: '1106', name: 'JUNIOR CAVALCANTE', role: 'admin', whatsapp: '' },
    { username: 'willian@uziel.com', password: '2206', name: 'WILLIAN FALAVINA', role: 'admin', whatsapp: '' },
    { username: 'ana@uziel.com', password: '0603', name: 'ANA BONIN', role: 'member', whatsapp: '' },
    { username: 'enio@uziel.com', password: '0501', name: 'ÊNIO HENRIQUE', role: 'member', whatsapp: '' },
    { username: 'camila@uziel.com', password: '1609', name: 'CAMILA FALAVINA', role: 'member', whatsapp: '' },
    { username: 'karla@uziel.com', password: '1510', name: 'KARLA VANESSA', role: 'member', whatsapp: '' },
    { username: 'mel@uziel.com', password: '1403', name: 'MEL BUZZO', role: 'member', whatsapp: '' },
    { username: 'alexandre@uziel.com', password: '1006', name: 'ALEXANDRE MANDELI', role: 'member', whatsapp: '' },
    { username: 'julio@uziel.com', password: '1807', name: 'JULIO CÉSAR', role: 'admin', whatsapp: '' }
];

// --- PUBLIC GETTERS ---
export const getCurrentUser = () => JSON.parse(localStorage.getItem('currentUser') || 'null');
export const getSenderUsername = () => notificationSenderUsername;
export const isAutoNotifyEnabled = () => automaticNotificationsEnabled;
export const getUserCredentials = () => [...userCredentials];
export const isSuperAdmin = (user) => user && user.username === SUPER_ADMIN_USERNAME;

// --- STATE MANAGEMENT ---
export function loadUserCredentials() {
    const storedUsers = localStorage.getItem('userCredentials');
    notificationSenderUsername = localStorage.getItem('notificationSenderUsername');
    const storedNotificationSetting = localStorage.getItem('automaticNotificationsEnabled');
    automaticNotificationsEnabled = storedNotificationSetting === null ? true : JSON.parse(storedNotificationSetting);

    if (storedUsers) {
        // CORREÇÃO: Garante que todos os campos obrigatórios existam ao carregar (ex: whatsapp)
        let parsedUsers = JSON.parse(storedUsers);
        userCredentials = parsedUsers.map(u => ({ 
            ...u, 
            whatsapp: u.whatsapp || '',
            role: u.role || 'member', // Garante que tenha uma função padrão
            name: u.name || u.username.split('@')[0].toUpperCase() // Garante que tenha um nome
        }));
    } else {
        userCredentials = initialUserCredentials;
        saveUserCredentials();
    }
}

export function saveUserCredentials(newCredentials = userCredentials) {
    userCredentials = newCredentials;
    localStorage.setItem('userCredentials', JSON.stringify(userCredentials));
    if (notificationSenderUsername) {
        localStorage.setItem('notificationSenderUsername', notificationSenderUsername);
    }
    localStorage.setItem('automaticNotificationsEnabled', JSON.stringify(automaticNotificationsEnabled));
}

export function updateNotificationConfig(senderUsername, notificationsEnabled) {
    notificationSenderUsername = senderUsername;
    automaticNotificationsEnabled = notificationsEnabled;
    saveUserCredentials();
    showFeedback('generator-feedback', 'Configurações de notificação salvas.', false);
}


// --- LOGIN/LOGOUT LOGIC (APARÊNCIA E UX) ---
export function setLoggedInState(user) {
    const contentElements = document.querySelectorAll('main, footer, header');
    const mainLoginOverlay = document.getElementById('main-login-overlay');
    const headerCtaBtn = document.getElementById('header-cta-btn');
    const mobileHeaderCtaBtn = document.getElementById('mobile-header-cta-btn');
    // Adicionei os wrappers para melhor legibilidade
    const userManagementWrapper = document.getElementById('user-management-card-wrapper');
    const whatsappConfigWrapper = document.getElementById('whatsapp-config-card-wrapper');
    const auditLogWrapper = document.getElementById('audit-log-card-wrapper');

    localStorage.setItem('currentUser', JSON.stringify(user));
    
    // Animação de transição para o login (melhor UX)
    mainLoginOverlay.classList.remove('flex');
    mainLoginOverlay.classList.add('opacity-0', 'transition-opacity', 'duration-500');
    setTimeout(() => {
        mainLoginOverlay.classList.add('hidden');
    }, 500);

    contentElements.forEach(el => el.classList.remove('content-hidden'));
    
    const isCurrentUserSuperAdmin = isSuperAdmin(user);

    // Gestão de Permissões (Aparência Funcional)
    const isAdmin = (user.role === 'admin' || isCurrentUserSuperAdmin);

    if (userManagementWrapper) {
        userManagementWrapper.classList.toggle('hidden', !isAdmin);
        userManagementWrapper.classList.toggle('filtered-out', !isAdmin);
    }
    
    if (whatsappConfigWrapper) {
        whatsappConfigWrapper.classList.toggle('hidden', !isCurrentUserSuperAdmin);
        whatsappConfigWrapper.classList.toggle('filtered-out', !isCurrentUserSuperAdmin);
    }
    
    if (auditLogWrapper) {
        auditLogWrapper.classList.toggle('hidden', !isCurrentUserSuperAdmin);
        auditLogWrapper.classList.toggle('filtered-out', !isCurrentUserSuperAdmin);
        if (isCurrentUserSuperAdmin && typeof window.initializeAuditLog === 'function') {
             // Chamada da função de inicialização de logs (Assumindo que está em admin.js)
             window.initializeAuditLog(); 
        }
    }

    if (isCurrentUserSuperAdmin && typeof window.initializeWhatsAppConfig === 'function') {
        window.initializeWhatsAppConfig();
    }

    // Atualiza botões de Sair (Melhor Aparência)
    const logoutAction = (evt) => { evt.preventDefault(); logout(); };
    
    [headerCtaBtn, mobileHeaderCtaBtn].forEach(btn => {
        if (btn) {
            btn.textContent = `Sair (${user.name.split(' ')[0]})`; // Mostra o primeiro nome
            btn.href = '#';
            btn.removeAttribute('target');
            btn.onclick = logoutAction;
            // Adiciona classe de estilo para logout (pode ser útil no CSS global)
            btn.classList.add('bg-red-600', 'hover:bg-red-700', 'text-white', 'font-semibold');
            btn.classList.remove('bg-brand-blue');
        }
    });

    handleHeaderScroll();
}

export function logout() {
    localStorage.removeItem('currentUser');
    const auth = getAuthInstance();
    // Tenta deslogar do Firebase (mantendo a lógica original)
    if (auth && typeof auth.signOut === 'function') {
        // Esta função depende do import correto em firebase.js (não está aqui, mas o fluxo é mantido)
        // auth.signOut();
    } 
    // Atualização da UI para login
    window.location.reload(); 
}

export function initializeLoginForm() {
    const mainLoginForm = document.getElementById('main-login-form');
    const mainLoginError = document.getElementById('main-login-error');
    const loginButton = document.getElementById('main-login-btn');
    
    mainLoginForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        mainLoginError.textContent = '';
        
        // Ativar estado de carregamento
        loginButton.disabled = true;
        loginButton.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Entrando...`;

        const usernameInput = mainLoginForm['main-username'].value.trim().toLowerCase();
        // Permite login apenas com prefixo ou com o @uziel.com completo
        const username = usernameInput.includes('@') ? usernameInput : `${usernameInput}@uziel.com`;
        const password = mainLoginForm['main-password'].value;
        
        const user = userCredentials.find(u => u.username === username && u.password === password);

        if (user) {
            setLoggedInState(user);
            logAction('Login', 'Autenticação', `Usuário ${user.name} entrou.`);
            mainLoginForm.reset();
        } else {
            mainLoginError.textContent = 'Usuário ou senha inválidos.';
            mainLoginError.classList.add('text-red-500');
            
            // Reverter estado do botão após falha
            loginButton.disabled = false;
            loginButton.innerHTML = 'Entrar'; 
        }
    });
}

/**
 * Verifica se todos os usuários locais (incluindo os iniciais) existem como 'membros' no Firestore.
 * Se não, cria o documento para garantir que o Controle de Presença funcione.
 */
export async function syncUsersToFirestore() {
    const db = getDB();
    const appId = getAppId();
    // Assume que getMembers() é um getter que retorna a lista de membros sincronizada do Firestore
    const currentMembers = getMembers() || []; 
    const localUsers = getUserCredentials(); 

    if (!db || localUsers.length === 0) return;

    const membersCol = getCollectionRef(`artifacts/${appId}/public/data/members`);
    const batch = writeBatch(db);
    let syncCount = 0;
    
    // CORREÇÃO: Garante que apenas a primeira ocorrência de cada nome seja mantida
    const uniqueUsersMap = new Map();
    localUsers.forEach(user => {
        if (!uniqueUsersMap.has(user.name)) {
            uniqueUsersMap.set(user.name, user);
        }
    });
    const uniqueLocalUsers = Array.from(uniqueUsersMap.values());
    
    uniqueLocalUsers.forEach(localUser => {
        // Verificamos se o membro já existe na lista sincronizada do Firebase
        const isMember = currentMembers.some(member => member.name === localUser.name);
        
        if (!isMember) {
            // Membro não encontrado no Firestore, precisa ser criado
            const memberDocRef = doc(membersCol); 
            
            batch.set(memberDocRef, { 
                name: localUser.name.toUpperCase().trim(), 
                totalPoints: 0 
            });
            syncCount++;
        }
    });

    if (syncCount > 0) {
        try {
            await batch.commit();
            console.log(`[SYNC] ${syncCount} membros criados/sincronizados no Firestore.`);
            logAction('Sincronização de Membros', 'Inicialização', `${syncCount} usuários locais adicionados ao Firestore.`);
        } catch (error) {
            console.error("Erro ao sincronizar usuários para o Firestore:", error);
        }
    }
}


// --- USER CRUD (Used by admin.js) ---

/**
 * Cria um novo usuário localmente e o sincroniza com o Firestore.
 * @param {string} name Nome completo do usuário.
 * @param {string} usernamePrefix Prefixo do nome de usuário (ex: 'joao').
 * @param {string} password Senha.
 * @param {string} role Função (role).
 * @param {HTMLElement} errorEl Elemento para exibir erros.
 * @returns {Promise<boolean>} Retorna true se o usuário foi criado com sucesso.
 */
export async function createNewUser(name, usernamePrefix, password, role, errorEl) {
    const db = getDB();
    const appId = getAppId();
    if (!name || !usernamePrefix || !password || !role) { 
        errorEl.textContent = 'Todos os campos são obrigatórios.'; 
        return false; 
    }
    
    const username = `${usernamePrefix}@uziel.com`;
    if (userCredentials.some(u => u.username === username)) { 
        errorEl.textContent = 'Este usuário já existe.'; 
        return false; 
    }
    
    const newUser = { name: name.toUpperCase().trim(), username, password, role, whatsapp: '' };
    userCredentials.push(newUser);
    saveUserCredentials();
    logAction('Usuário Criado', 'Gestão de Usuários', `Usuário criado: ${newUser.name} (${username})`);
    
    // Sincroniza com o Firestore para Controle de Presença
    try {
        const membersCol = getCollectionRef(`artifacts/${appId}/public/data/members`);
        await addDoc(membersCol, { name: newUser.name, totalPoints: 0 });
    } catch (error) { 
        console.error("Erro ao adicionar membro ao Firestore: ", error); 
        errorEl.textContent = 'Usuário criado localmente, mas falha ao sincronizar com o Controle de Presença.';
    }
    
    return true;
}

/**
 * Exclui um usuário localmente e remove todos os seus registros no Firestore.
 * @param {string} usernameToDelete Nome de usuário completo a ser excluído.
 * @param {Object} userToDelete Objeto do usuário a ser excluído (para logs e nome).
 */
export async function deleteUser(usernameToDelete, userToDelete) {
    const db = getDB();
    const appId = getAppId();
    
    // 1. Exclusão Local
    userCredentials = userCredentials.filter(u => u.username !== usernameToDelete);
    saveUserCredentials();
    logAction('Usuário Excluído', 'Gestão de Usuários', `Usuário excluído: ${userToDelete.name} (${userToDelete.username})`);
    
    // 2. Exclusão no Firestore (Membros e Presenças)
    try {
        const membersCol = getCollectionRef(`artifacts/${appId}/public/data/members`);
        const attendanceCol = getCollectionRef(`artifacts/${appId}/public/data/attendance`);
        
        // Encontra o documento do membro baseado no nome
        const memberQuery = query(membersCol, where("name", "==", userToDelete.name));
        const memberSnapshot = await getDocs(memberQuery);
        
        if (!memberSnapshot.empty) {
            const memberDoc = memberSnapshot.docs[0];
            const memberId = memberDoc.id;
            const batch = writeBatch(db);
            
            // Deleta todos os registros de presença (attendance)
            const attendanceQuery = query(attendanceCol, where("memberId", "==", memberId));
            const attendanceSnapshot = await getDocs(attendanceQuery);
            attendanceSnapshot.forEach(doc => batch.delete(doc.ref));
            
            // Deleta o documento do membro
            batch.delete(memberDoc.ref);
            await batch.commit();
            console.log(`[Firestore] Dados de ${userToDelete.name} e ${attendanceSnapshot.size} registros de presença excluídos.`);
        } else {
             console.log(`[Firestore] Membro ${userToDelete.name} não encontrado para exclusão.`);
        }
    } catch (error) { 
        console.error("Erro ao excluir usuário do Firestore: ", error); 
        // Usar showFeedback() aqui seria bom, mas esta função é chamada de um modal que já lida com o feedback.
    }
}

/**
 * Atualiza os detalhes de um usuário localmente e sincroniza as mudanças de nome no Firestore.
 * @param {string} originalUsername Nome de usuário original (chave primária).
 * @param {string} newName Novo nome completo.
 * @param {string} newRole Nova função (role).
 * @param {string} newPassword Nova senha (opcional).
 * @param {HTMLElement} errorEl Elemento para exibir erros.
 * @returns {Promise<boolean>} Retorna true se o usuário foi atualizado com sucesso.
 */
export async function updateUser(originalUsername, newName, newRole, newPassword, errorEl) {
    const db = getDB();
    const appId = getAppId();
    const userToEditIndex = userCredentials.findIndex(u => u.username === originalUsername);

    if (userToEditIndex === -1) { 
        errorEl.textContent = 'Usuário não encontrado.'; 
        return false; 
    }
    
    if (!newName || !newRole) {
        errorEl.textContent = 'Nome e função são obrigatórios.';
        return false;
    }

    const userToEdit = userCredentials[userToEditIndex];
    const originalName = userToEdit.name;
    
    // 1. Atualização Local
    userCredentials[userToEditIndex].name = newName.toUpperCase().trim();
    userCredentials[userToEditIndex].role = newRole;
    if (newPassword.trim() !== '') {
        // CORREÇÃO: Garante que a senha não seja salva vazia se não foi alterada
        userCredentials[userToEditIndex].password = newPassword.trim();
    }

    // Se o usuário atualizou a si mesmo, o localStorage precisa ser refrescado.
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.username === originalUsername) {
        // Atualiza apenas os campos relevantes no currentUser
        currentUser.name = userCredentials[userToEditIndex].name;
        currentUser.role = userCredentials[userToEditIndex].role;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        // Nota: setLoggedInState não é chamado aqui, para evitar recarregar toda a UI,
        // mas as permissões baseadas em 'currentUser' serão atualizadas no próximo refresh.
    }

    saveUserCredentials();
    logAction('Usuário Atualizado', 'Gestão de Usuários', `Detalhes atualizados para ${newName}`);

    // 2. Sincronização de Nome no Firestore
    if (originalName !== newName.toUpperCase().trim()) {
        try {
            const membersCol = getCollectionRef(`artifacts/${appId}/public/data/members`);
            const q = query(membersCol, where("name", "==", originalName));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const memberDocRef = querySnapshot.docs[0].ref;
                // CORREÇÃO: Usar updateDoc na referência do documento, e garantir nome em maiúsculas
                await updateDoc(memberDocRef, { name: newName.toUpperCase().trim() });
            }
        } catch (error) {
            console.error("Erro ao atualizar o nome do membro no Firestore:", error);
            errorEl.textContent += ' Erro ao sincronizar o novo nome com o Controle de Presença.';
            return false;
        }
    }
    return true;
}

// --- NOVO: Funções para Gerenciamento de WhatsApp (UX Aprimorada) ---

/**
 * Atualiza o número de WhatsApp de um usuário (usado no modal de Perfil/Configurações).
 * @param {string} username O username do usuário.
 * @param {string} whatsapp O novo número de WhatsApp.
 * @returns {boolean} Sucesso.
 */
export function updateWhatsApp(username, whatsapp) {
    const userToEditIndex = userCredentials.findIndex(u => u.username === username);

    if (userToEditIndex === -1) {
        console.error('Usuário não encontrado para atualização de WhatsApp.');
        return false;
    }

    userCredentials[userToEditIndex].whatsapp = whatsapp.trim();
    saveUserCredentials();

    // Atualiza o estado local do usuário logado se for o caso
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.username === username) {
        currentUser.whatsapp = whatsapp.trim();
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
    }

    logAction('WhatsApp Atualizado', 'Gestão de Usuários', `WhatsApp atualizado para ${username}`);
    return true;
}