import { logAction, getDB, getAppId, getAuthInstance, getMembers, getCollectionRef, addDoc, updateDoc, where, query, getDocs, SUPER_ADMIN_USERNAME } from './firebase.js';
import { handleHeaderScroll } from './ui.js';

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
    { username: 'julio@uziel.com', password: '1807', name: 'JULIO CÉSAR', role: 'member', whatsapp: '' }
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
        let parsedUsers = JSON.parse(storedUsers);
        userCredentials = parsedUsers.map(u => ({ ...u, whatsapp: u.whatsapp || '' }));
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
}


// --- LOGIN/LOGOUT LOGIC ---
export function setLoggedInState(user) {
    const contentElements = document.querySelectorAll('main, footer, header');
    const mainLoginOverlay = document.getElementById('main-login-overlay');
    const headerCtaBtn = document.getElementById('header-cta-btn');
    const mobileHeaderCtaBtn = document.getElementById('mobile-header-cta-btn');
    const userManagementCard = document.getElementById('user-management-card-wrapper');
    const whatsappConfigCard = document.getElementById('whatsapp-config-card-wrapper');
    const auditLogCard = document.getElementById('audit-log-card-wrapper');

    localStorage.setItem('currentUser', JSON.stringify(user));
    mainLoginOverlay.classList.add('hidden');
    contentElements.forEach(el => el.classList.remove('content-hidden'));
    
    const isCurrentUserSuperAdmin = isSuperAdmin(user);

    if (user.role === 'admin' || isCurrentUserSuperAdmin) {
        userManagementCard.classList.remove('hidden', 'filtered-out');
    } else {
        userManagementCard.classList.add('hidden', 'filtered-out');
    }

    if (isCurrentUserSuperAdmin) {
        whatsappConfigCard.classList.remove('hidden', 'filtered-out');
        auditLogCard.classList.remove('hidden', 'filtered-out');
        if (typeof window.initializeWhatsAppConfig === 'function') window.initializeWhatsAppConfig();
    } else {
        whatsappConfigCard.classList.add('hidden', 'filtered-out');
        auditLogCard.classList.add('hidden', 'filtered-out');
    }
    
    const logoutAction = (evt) => { evt.preventDefault(); logout(); };
    
    headerCtaBtn.textContent = 'Sair';
    headerCtaBtn.href = '#';
    headerCtaBtn.removeAttribute('target');
    headerCtaBtn.onclick = logoutAction;

    mobileHeaderCtaBtn.textContent = 'Sair';
    mobileHeaderCtaBtn.href = '#';
    mobileHeaderCtaBtn.removeAttribute('target');
    mobileHeaderCtaBtn.onclick = logoutAction;

    handleHeaderScroll();
}

export function logout() {
    localStorage.removeItem('currentUser');
    const auth = getAuthInstance();
    if (auth) {
        signOut(auth).catch(error => console.error("Error signing out from Firebase:", error));
    }
    window.location.reload(); 
}

export function initializeLoginForm() {
    const mainLoginForm = document.getElementById('main-login-form');
    const mainLoginError = document.getElementById('main-login-error');
    
    mainLoginForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        mainLoginError.textContent = '';
        
        const usernameInput = mainLoginForm['main-username'].value.trim().toLowerCase();
        const username = usernameInput.includes('@') ? usernameInput : `${usernameInput}@uziel.com`;
        const password = mainLoginForm['main-password'].value;
        
        const user = userCredentials.find(u => u.username === username && u.password === password);

        if (user) {
            setLoggedInState(user);
            logAction('Login', 'Autenticação', `Usuário ${user.name} entrou.`);
            mainLoginForm.reset();
        } else {
            mainLoginError.textContent = 'Usuário ou senha inválidos.';
        }
    });
}

// --- USER CRUD (Used by admin.js) ---
export async function createNewUser(name, usernamePrefix, password, role, errorEl) {
    const db = getDB();
    const appId = getAppId();
    if (!name || !usernamePrefix || !password) { errorEl.textContent = 'Todos os campos são obrigatórios.'; return; }
    const username = `${usernamePrefix}@uziel.com`;
    if (userCredentials.some(u => u.username === username)) { errorEl.textContent = 'Este usuário já existe.'; return; }
    
    const newUser = { name: name.toUpperCase().trim(), username, password, role, whatsapp: '' };
    userCredentials.push(newUser);
    saveUserCredentials();
    logAction('Usuário Criado', 'Gestão de Usuários', `Usuário criado: ${newUser.name} (${username})`);
    
    try {
        const membersCol = getCollectionRef(`artifacts/${appId}/public/data/members`);
        await addDoc(membersCol, { name: newUser.name, totalPoints: 0 });
    } catch (error) { console.error("Erro ao adicionar membro ao Firestore: ", error); }
    
    return true;
}

export async function deleteUser(usernameToDelete, userToDelete) {
    const db = getDB();
    const appId = getAppId();
    userCredentials = userCredentials.filter(u => u.username !== usernameToDelete);
    saveUserCredentials();
    logAction('Usuário Excluído', 'Gestão de Usuários', `Usuário excluído: ${userToDelete.name} (${userToDelete.username})`);
    
    try {
        const membersCol = getCollectionRef(`artifacts/${appId}/public/data/members`);
        const attendanceCol = getCollectionRef(`artifacts/${appId}/public/data/attendance`);
        
        // Find member ID based on name
        const memberQuery = query(membersCol, where("name", "==", userToDelete.name));
        const memberSnapshot = await getDocs(memberQuery);
        
        if (!memberSnapshot.empty) {
            const memberDoc = memberSnapshot.docs[0];
            const memberId = memberDoc.id;
            const batch = writeBatch(db);
            
            // Delete all attendance records for this member
            const attendanceQuery = query(attendanceCol, where("memberId", "==", memberId));
            const attendanceSnapshot = await getDocs(attendanceQuery);
            attendanceSnapshot.forEach(doc => batch.delete(doc.ref));
            
            // Delete member document
            batch.delete(memberDoc.ref);
            await batch.commit();
        }
    } catch (error) { console.error("Erro ao excluir usuário do Firestore: ", error); }
}

export async function updateUser(originalUsername, newName, newRole, newPassword, errorEl) {
    const db = getDB();
    const appId = getAppId();
    const userToEditIndex = userCredentials.findIndex(u => u.username === originalUsername);

    if (userToEditIndex === -1) { errorEl.textContent = 'Usuário não encontrado.'; return false; }
    
    const userToEdit = userCredentials[userToEditIndex];
    const originalName = userToEdit.name;
    
    userCredentials[userToEditIndex].name = newName;
    userCredentials[userToEditIndex].role = newRole;
    if (newPassword.trim() !== '') {
        userCredentials[userToEditIndex].password = newPassword.trim();
    }

    saveUserCredentials();
    logAction('Usuário Atualizado', 'Gestão de Usuários', `Detalhes atualizados para ${newName}`);

    if (originalName !== newName) {
        try {
            const membersCol = getCollectionRef(`artifacts/${appId}/public/data/members`);
            const q = query(membersCol, where("name", "==", originalName));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const memberDocRef = querySnapshot.docs[0].ref;
                await updateDoc(memberDocRef, { name: newName });
            }
        } catch (error) {
            console.error("Erro ao atualizar o nome do membro no Firestore:", error);
        }
    }
    return true;
}