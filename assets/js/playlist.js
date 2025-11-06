import { logAction, getDB, getAppId, getPlaylists, getCollectionRef, addDoc, deleteDoc, getDocRef, getServerTimestamp } from './firebase.js';
import { getCurrentUser, isSuperAdmin } from './auth.js';
import { setupModalInteraction, openConfirmationModal } from './ui.js';

export function initializePlaylistSystem() {
    const addPlaylistForm = document.getElementById('add-playlist-form');
    setupModalInteraction('playlist-modal', 'open-playlist-modal', 'close-playlist-modal', renderPlaylistModal);

    addPlaylistForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentUser = getCurrentUser();
        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'super-admin')) return;

        const urlInput = document.getElementById('new-playlist-url');
        const feedbackEl = document.getElementById('playlist-form-feedback');
        const url = urlInput.value.trim();

        if (!url) {
            feedbackEl.textContent = 'Por favor, insira um URL.';
            return;
        }
        
        if (!url.includes('spotify.com') && !url.includes('youtube.com') && !url.includes('youtu.be')) {
            feedbackEl.textContent = 'URL inválido. Use um link do Spotify ou YouTube.';
             setTimeout(() => feedbackEl.textContent = '', 3000);
            return;
        }

        try {
            const db = getDB();
            const appId = getAppId();
            await addDoc(getCollectionRef(`artifacts/${appId}/public/data/playlists`), {
                url: url,
                addedBy: currentUser.name,
                createdAt: getServerTimestamp()
            });
            logAction('Playlist Adicionada', 'Playlists', `URL: ${url}`);
            urlInput.value = '';
            feedbackEl.textContent = 'Playlist adicionada com sucesso!';
            setTimeout(() => feedbackEl.textContent = '', 3000);
        } catch (error) {
            console.error("Erro ao adicionar playlist: ", error);
            feedbackEl.textContent = 'Erro ao salvar a playlist.';
        }
    });
}

// Attach to window so Firebase listener can call it
window.renderPlaylistModal = renderPlaylistModal;

export function renderPlaylistModal() {
    const listContainer = document.getElementById('playlist-list-container');
    const embedContainer = document.getElementById('playlist-embed-container');
    const addPlaylistForm = document.getElementById('add-playlist-form');
    const allPlaylists = getPlaylists();
    const currentUser = getCurrentUser();

    if (!listContainer || !currentUser) return;

    addPlaylistForm.classList.toggle('hidden', (currentUser.role !== 'admin' && currentUser.role !== 'super-admin'));

    if (allPlaylists.length === 0) {
        listContainer.innerHTML = `<div class="text-center text-slate-500 dark:text-slate-400 py-8"><i class="fas fa-compact-disc fa-2x mb-3"></i><p>Nenhuma playlist foi adicionada ainda.</p></div>`;
        embedContainer.innerHTML = `<div class="text-center text-slate-400"><i class="fas fa-arrow-left fa-2x mb-3"></i><p class="font-semibold">Selecione uma playlist para visualizar</p></div>`;
        return;
    }

    listContainer.innerHTML = allPlaylists.map(playlist => {
        const urlObj = new URL(playlist.url);
        const hostname = urlObj.hostname.replace('www.', '');

        let iconClass = 'fa-link';
        if (hostname.includes('spotify')) iconClass = 'fa-spotify text-green-500';
        if (hostname.includes('youtube') || hostname.includes('youtu.be')) iconClass = 'fa-youtube text-red-500';

        const adminDeleteButton = (currentUser.role === 'admin' || isSuperAdmin(currentUser)) ? 
            `<button data-id="${playlist.id}" data-url="${playlist.url}" class="delete-playlist-btn text-slate-400 hover:text-red-500 transition-colors ml-auto p-2 rounded-full hover:bg-red-500/10" aria-label="Excluir Playlist"><i class="fas fa-trash-alt"></i></button>` : '';

        return `
            <div id="playlist-item-${playlist.id}" class="playlist-item-container flex items-center gap-3">
                <button data-url="${playlist.url}" class="view-playlist-btn w-full text-left p-3 rounded-xl border dark:border-slate-700 bg-white dark:bg-darkcard flex items-center gap-3 playlist-item shadow-sm">
                    <i class="fab ${iconClass} fa-lg w-5 text-center"></i>
                    <span class="flex-grow text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">${hostname}</span>
                    <i class="fas fa-chevron-right text-slate-400"></i>
                </button>
                ${adminDeleteButton}
            </div>
        `;
    }).join('');
    
    // Clear embed if the currently viewed item was deleted
    const activeItem = listContainer.querySelector('.playlist-item.active');
    if (!activeItem) {
        embedContainer.innerHTML = `<div class="text-center text-slate-400"><i class="fas fa-arrow-left fa-2x mb-3"></i><p class="font-semibold">Selecione uma playlist para visualizar</p></div>`;
    }

    listContainer.querySelectorAll('.view-playlist-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const url = e.currentTarget.dataset.url;
            embedContainer.innerHTML = getEmbedHtml(url, true);
            
            document.querySelectorAll('.playlist-item').forEach(item => item.classList.remove('active'));
            e.currentTarget.classList.add('active');
            logAction('Visualizou Playlist', 'Playlists', `Visualizou a playlist/vídeo no link: ${url}`);
        });
    });

    if (currentUser.role === 'admin' || isSuperAdmin(currentUser)) {
        listContainer.querySelectorAll('.delete-playlist-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const playlistId = e.currentTarget.dataset.id;
                const playlistUrl = e.currentTarget.dataset.url;
                openConfirmationModal(
                    'Tem certeza que deseja excluir esta playlist?',
                    () => deletePlaylist(playlistId, playlistUrl)
                );
            });
        });
    }
}

async function deletePlaylist(playlistId, playlistUrl) {
    const currentUser = getCurrentUser();
    const db = getDB();
    if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser)) || !db) return;
    try {
        const appId = getAppId();
        const playlistRef = getDocRef(`artifacts/${appId}/public/data/playlists`, playlistId);
        await deleteDoc(playlistRef);
        logAction('Playlist Excluída', 'Playlists', `URL: ${playlistUrl}`);
    } catch (error) {
        console.error("Erro ao excluir playlist:", error);
        alert('Ocorreu um erro ao excluir a playlist.');
    }
}

// Helper to generate embed HTML for Spotify or YouTube
function getEmbedHtml(url, isModern = false) {
    if (!url) {
        return `<p class="text-sm text-center text-slate-400 italic mt-4">${isModern ? 'Selecione uma playlist para visualizar' : 'Nenhum player de mídia adicionado.'}</p>`;
    }

    const origin = window.location.origin;

    // YouTube Playlist Match
    const ytPlaylistMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (ytPlaylistMatch && ytPlaylistMatch[1]) {
        const playlistId = ytPlaylistMatch[1];
        const embedUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}&enablejsapi=1&origin=${origin}`;
        return `<div class="aspect-w-16 aspect-h-9 w-full h-full relative" style="padding-bottom: 56.25%; height: 0;"><iframe src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="absolute top-0 left-0 w-full h-full rounded-lg shadow-xl"></iframe></div>`;
    }

    // YouTube Video Match
    const ytVideoMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytVideoMatch && ytVideoMatch[1]) {
        const videoId = ytVideoMatch[1];
        const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${origin}`;
        return `<div class="aspect-w-16 aspect-h-9 w-full h-full relative" style="padding-bottom: 56.25%; height: 0;"><iframe src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen class="absolute top-0 left-0 w-full h-full rounded-lg shadow-xl"></iframe></div>`;
    }

    // Spotify Match
    const spotifyMatch = url.match(/https?:\/\/open\.spotify\.com\/(?:[a-zA-Z0-9\-_]+\/)?(track|playlist|album)\/([a-zA-Z0-9]{22})/);
    if (spotifyMatch && spotifyMatch[1] && spotifyMatch[2]) {
        const type = spotifyMatch[1];
        const id = spotifyMatch[2];
        const height = isModern ? '100%' : '352';
        const themeParam = document.documentElement.classList.contains('dark') ? '&theme=0' : '';
        const spotifyUri = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator${themeParam}`;
        return `<iframe style="border-radius:12px" src="${spotifyUri}" width="100%" height="${height}" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" class="${isModern ? '' : 'mt-4 shadow-xl'}"></iframe>`;
    }
    
    // Fallback/Generic Link
    return `<div class="mt-4 text-center"><a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 bg-slate-500 text-white font-semibold py-1.5 px-3 rounded-full text-sm hover:bg-slate-600 transition-colors shadow-md"><i class="fas fa-link"></i>Acessar Link Externo</a></div>`;
}