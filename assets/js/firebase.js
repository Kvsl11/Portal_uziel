import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, updateDoc, increment, getDocs, writeBatch, where, runTransaction, setDoc, deleteDoc, addDoc, getDoc, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CORE GLOBAL STATE (Private) ---
let allMembers = [];
let allRecords = [];
let allRepertories = [];
let allPlaylists = [];
let allAuditLogs = [];
let db;
let appId;
let firebaseAuth;

export const SUPER_ADMIN_USERNAME = 'kaio@uziel.com';

// --- GETTERS (Public Access to Data) ---
export const getDB = () => db;
export const getAppId = () => appId;
export const getAuthInstance = () => firebaseAuth;
export const getMembers = () => [...allMembers];
export const getRecords = () => [...allRecords];
export const getRepertories = () => [...allRepertories];
export const getPlaylists = () => [...allPlaylists];
export const getAuditLogs = () => [...allAuditLogs];
export const getServerTimestamp = () => serverTimestamp();
export const getDocRef = (path, docId) => doc(db, path, docId);
export const getCollectionRef = (path) => collection(db, path);
export { updateDoc, increment, writeBatch, runTransaction, setDoc, deleteDoc, addDoc, getDoc, getDocs, query, where, orderBy };

// --- FIREBASE INITIALIZATION ---
export async function initializeFirebase(onAuthChangeCallback) {
    try {
        const fallbackConfig = { apiKey: "AIzaSyASN-L5S6-KexN4OtKUOUrGDU1JaMuVsMY", authDomain: "portal-uziel-295cb.firebaseapp.com", projectId: "portal-uziel-295cb", storageBucket: "portal-uziel-295cb.firebasestorage.app", messagingSenderId: "98540572300", appId: "1:98540572300:web:1277c0ed3a69442d8975a9", measurementId: "G-1RTQ4KYFTE" };
        const firebaseConfigStr = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
        let firebaseConfig = JSON.parse(firebaseConfigStr);
        if (!firebaseConfig.apiKey) { firebaseConfig = fallbackConfig; }
        
        // Define APP ID globally
        appId = typeof __app_id !== 'undefined' ? __app_id : 'portal-uziel-v1-fallback';
        
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        firebaseAuth = getAuth(app);

        // Initial sign in using token or anonymously
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
             await signInWithCustomToken(firebaseAuth, __initial_auth_token);
        } else {
             await signInAnonymously(firebaseAuth);
        }

        // Set up Auth State Observer
        onAuthStateChanged(firebaseAuth, (user) => {
             // onAuthChangeCallback handles the actual UI logic based on currentUser in auth.js
             if (user) {
                 setupDataListeners();
             }
             onAuthChangeCallback(user);
        });
    } catch (error) {
        console.error("Error initializing Firebase:", error);
    }
}

// --- DATA LISTENERS ---
function setupDataListeners() {
    if (!db || !appId) { console.error("Database not ready for listeners."); return; }
    
    const membersCol = collection(db, `artifacts/${appId}/public/data/members`);
    onSnapshot(query(membersCol), (snapshot) => {
        allMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allMembers.sort((a, b) => a.name.localeCompare(b.name));
        // Trigger a UI update for attendance if the modal is open (handled by external module)
        if (typeof window.updateAttendanceViewIfVisible === 'function') {
            window.updateAttendanceViewIfVisible();
        }
    }, (error) => { console.error("Erro ao buscar membros: ", error); });

    const attendanceCol = collection(db, `artifacts/${appId}/public/data/attendance`);
    onSnapshot(query(attendanceCol), (snapshot) => {
        allRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allRecords.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""));
        if (typeof window.updateAttendanceViewIfVisible === 'function') {
            window.updateAttendanceViewIfVisible();
        }
    }, (error) => { console.error("Erro ao buscar registros de presença: ", error); });

    const repertoryCol = collection(db, `artifacts/${appId}/public/data/repertory`);
    onSnapshot(query(repertoryCol, orderBy("date", "desc")), (snapshot) => {
        allRepertories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (document.getElementById('pptx-generator-modal')?.classList.contains('is-open')) {
            // Trigger an external function to re-render the history
            if (typeof window.renderRepertoryHistory === 'function') {
                window.renderRepertoryHistory();
            }
        }
    });

    const playlistsCol = collection(db, `artifacts/${appId}/public/data/playlists`);
    onSnapshot(query(playlistsCol, orderBy("createdAt", "desc")), (snapshot) => {
        allPlaylists = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (document.getElementById('playlist-modal')?.classList.contains('is-open')) {
            if (typeof window.renderPlaylistModal === 'function') {
                window.renderPlaylistModal();
            }
        }
    });
    
    const auditLogsCol = collection(db, `artifacts/${appId}/public/data/audit_logs`);
    onSnapshot(query(auditLogsCol, orderBy("timestamp", "desc")), (snapshot) => {
        allAuditLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(document.getElementById('audit-log-modal')?.classList.contains('is-open')) {
            if (typeof window.renderAuditLog === 'function') {
                window.renderAuditLog();
            }
        }
    });
}

// --- AUDIT LOGGING ---
export async function logAction(action, module, details = '') {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (!user || !db) return; 
    try {
        const logsCol = collection(db, `artifacts/${appId}/public/data/audit_logs`);
        await addDoc(logsCol, {
            user: user.name,
            action,
            module,
            details,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error("Erro ao registrar ação:", error);
    }
}