import { logAction, getDB, getAppId, getPlaylists, getCollectionRef, addDoc, deleteDoc, getDocRef, getServerTimestamp } from './firebase.js';
import { getCurrentUser, isSuperAdmin } from './auth.js';
import { setupModalInteraction, openConfirmationModal, showFeedback } from './ui.js'; 

const PLAYLIST_COLLECTION_PATH = (appId) => `artifacts/${appId}/public/data/playlists`;

/**
 * Define o estado de carregamento e feedback do formulário de adição de playlist.
 * @param {boolean} isLoading Se o formulário está processando.
 * @param {string} message Mensagem de feedback a ser exibida.
 * @param {boolean} isError Se a mensagem é um erro.
 */
function setLoadingState(isLoading, message = '', isError = false) {
    const btn = document.getElementById('add-playlist-btn');
    const feedbackEl = document.getElementById('playlist-form-feedback');
    
    if (!btn || !feedbackEl) return;

    btn.disabled = isLoading;
    feedbackEl.textContent = message;
    feedbackEl.classList.toggle('text-red-500', isError);
    feedbackEl.classList.toggle('text-green-500', !isError && message);

    if (isLoading) {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Adicionando...`;
    } else {
        btn.innerHTML = `<i class="fas fa-plus mr-2"></i> Adicionar Playlist`;
        if (message) {
             setTimeout(() => feedbackEl.textContent = '', 3000);
        }
    }
}

export function initializePlaylistSystem() {
    const addPlaylistForm = document.getElementById('add-playlist-form');
    // Assume que 'renderPlaylistModal' está anexada ao listener do Firebase no seu arquivo principal
    setupModalInteraction('playlist-modal', 'open-playlist-modal', 'close-playlist-modal', renderPlaylistModal);

    addPlaylistForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentUser = getCurrentUser();
        
        if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser))) {
            setLoadingState(false, 'Você não tem permissão para adicionar playlists.', true);
            return;
        }

        const urlInput = document.getElementById('new-playlist-url');
        const url = urlInput.value.trim();

        if (!url) {
            setLoadingState(false, 'Por favor, insira um URL.', true);
            return;
        }
        
        // Validação de URL robusta
        if (!url.includes('spotify.com') && !url.includes('youtube.com') && !url.includes('youtu.be')) {
            setLoadingState(false, 'URL inválido. Use um link do Spotify, YouTube ou vídeo/playlist.', true);
            return;
        }

        setLoadingState(true, 'Processando...', false);

        try {
            const appId = getAppId();
            await addDoc(getCollectionRef(PLAYLIST_COLLECTION_PATH(appId)), {
                url: url,
                addedBy: currentUser.username, // Usando username para consistência com repertory.js
                createdAt: getServerTimestamp()
            });
            
            logAction('Playlist Adicionada', 'Playlists', `URL: ${url}`);
            urlInput.value = '';
            setLoadingState(false, 'Playlist adicionada com sucesso!', false);
        } catch (error) {
            console.error("Erro ao adicionar playlist: ", error);
            setLoadingState(false, 'Erro ao salvar a playlist. Tente novamente.', true);
        }
    });
    
    // *** NOVO: Adicionar listener para o campo de busca/filtro ***
    document.getElementById('playlist-search-input')?.addEventListener('input', renderPlaylistModal);
}

// Attach to window so Firebase listener can call it
window.renderPlaylistModal = renderPlaylistModal;

export function renderPlaylistModal() {
    const listContainer = document.getElementById('playlist-list-container');
    const embedContainer = document.getElementById('playlist-embed-container');
    const addPlaylistForm = document.getElementById('add-playlist-form');
    const searchInput = document.getElementById('playlist-search-input'); // Novo input de busca
    let allPlaylists = getPlaylists();
    const currentUser = getCurrentUser();
    
    if (!listContainer || !currentUser) return;

    // *** CORREÇÃO: Adiciona padding horizontal e força o overflow-x a ser hidden no contêiner da lista ***
    listContainer.style.paddingLeft = '8px'; // px-2
    listContainer.style.paddingRight = '8px'; // px-2
    listContainer.style.overflowX = 'hidden'; 
    
    // 1. FILTRAGEM (NOVA FUNCIONALIDADE)
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    if (searchTerm) {
        allPlaylists = allPlaylists.filter(playlist => {
            const creatorName = playlist.addedBy ? playlist.addedBy.split('@')[0].toLowerCase() : '';
            return playlist.url.toLowerCase().includes(searchTerm) || creatorName.includes(searchTerm);
        });
    }

    // Aprimoramento: Garante que o estado de carregamento seja liberado na renderização.
    setLoadingState(false); 

    addPlaylistForm.classList.toggle('hidden', (currentUser.role !== 'admin' && !isSuperAdmin(currentUser)));

    if (allPlaylists.length === 0) {
        // Altera a mensagem se for por causa do filtro
        const emptyMessage = searchTerm 
            ? `<p>Nenhuma playlist encontrada para o termo: "${searchTerm}".</p>`
            : `<p>Nenhuma playlist foi adicionada ainda.</p>`;

        listContainer.innerHTML = `<div class="text-center text-slate-500 dark:text-slate-400 py-8"><i class="fas fa-compact-disc fa-2x mb-3"></i>${emptyMessage}</div>`;
        embedContainer.innerHTML = `<div class="text-center text-slate-400"><i class="fas fa-arrow-left fa-2x mb-3"></i><p class="font-semibold">Selecione uma playlist para visualizar</p></div>`;
        return;
    }

    listContainer.innerHTML = allPlaylists.map(playlist => {
        const urlObj = new URL(playlist.url);
        const hostname = urlObj.hostname.replace('www.', '');

        let iconClass = 'fa-link text-slate-500';
        if (hostname.includes('spotify')) iconClass = 'fa-spotify text-green-500';
        if (hostname.includes('youtube') || hostname.includes('youtu.be')) iconClass = 'fa-youtube text-red-500';
        
        const creatorName = playlist.addedBy ? playlist.addedBy.split('@')[0].toUpperCase() : 'DESCONHECIDO';

        // *** CORREÇÃO: Adicionada margem à esquerda do botão de exclusão (ml-3) ***
        const adminDeleteButton = (currentUser.role === 'admin' || isSuperAdmin(currentUser)) ? 
            `<button data-id="${playlist.id}" data-url="${playlist.url}" class="delete-playlist-btn text-slate-400 hover:text-red-500 transition-colors flex-shrink-0 p-2 rounded-full hover:bg-red-500/10 ml-3" aria-label="Excluir Playlist"><i class="fas fa-trash-alt"></i></button>` : '';

        // *** CORREÇÃO: Removido `w-full` do item-container para permitir o padding do listContainer ***
        return `
            <div id="playlist-item-${playlist.id}" class="playlist-item-container flex items-center gap-3">
                <button data-url="${playlist.url}" class="view-playlist-btn flex-grow text-left p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-darkcard flex items-center gap-3 playlist-item shadow-md hover:shadow-2xl hover:border-brand-blue transition-all min-w-0 hover:ring-2 hover:ring-brand-blue/30">
                    <div class="flex items-center flex-shrink-0">
                        <i class="fab ${iconClass} fa-lg w-5 text-center mr-2"></i>
                        <span class="text-sm font-semibold text-brand-blue dark:text-brand-blue-light">${hostname.includes('spotify') ? 'Spotify' : hostname.includes('youtube') ? 'YouTube' : 'Link'}</span>
                    </div>
                    <div class="flex-grow min-w-0">
                         <span class="text-xs text-slate-600 dark:text-slate-400 truncate w-full block">${playlist.url}</span>
                         <span class="text-xs italic text-slate-400 dark:text-slate-500 block">Adicionado por: ${creatorName}</span>
                    </div>
                    <i class="fas fa-chevron-right text-slate-400 flex-shrink-0 ml-auto"></i>
                </button>
                ${adminDeleteButton}
            </div>
        `;
    }).join('');
    
    // Clear embed if the currently viewed item was deleted
    const activeItem = listContainer.querySelector('.playlist-item.active');
    if (!activeItem) {
        embedContainer.innerHTML = `<div class="text-center text-slate-400 py-8"><i class="fas fa-compact-disc fa-2x mb-3"></i><p class="font-semibold">Selecione uma playlist para visualizar</p></div>`;
    }

    listContainer.querySelectorAll('.view-playlist-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const url = e.currentTarget.dataset.url;
            embedContainer.innerHTML = getEmbedHtml(url, true);
            
            // Remove a classe 'active' de todos os itens e adiciona ao clicado
            document.querySelectorAll('.playlist-item').forEach(item => {
                // Limpa todos os estilos de hover/active
                item.classList.remove('active', 'border-brand-blue', 'shadow-xl', 'bg-brand-light-gray', 'dark:bg-slate-700', 'ring-2', 'ring-brand-blue/30');
                item.classList.add('shadow-md', 'bg-white', 'dark:bg-darkcard');
            });

            // Aplica estilos ativos
            e.currentTarget.classList.add('active', 'border-brand-blue', 'shadow-xl', 'bg-brand-light-gray', 'dark:bg-slate-700');
            logAction('Visualizou Playlist', 'Playlists', `Visualizou a playlist/vídeo no link: ${url}`);
        });
    });

    if (currentUser.role === 'admin' || isSuperAdmin(currentUser)) {
        listContainer.querySelectorAll('.delete-playlist-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Impede o clique de ativar o view-playlist-btn
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
    if (!currentUser || (currentUser.role !== 'admin' && !isSuperAdmin(currentUser)) || !db) {
        showFeedback('playlist-feedback-modal', 'Você não tem permissão para excluir playlists.', true);
        return;
    }
    
    // Adiciona feedback visual de exclusão (usando o feedback de modal ou principal)
    showFeedback('generator-feedback', 'Excluindo playlist...', false, -1); 

    try {
        const appId = getAppId();
        const playlistRef = getDocRef(PLAYLIST_COLLECTION_PATH(appId), playlistId);
        await deleteDoc(playlistRef);
        logAction('Playlist Excluída', 'Playlists', `URL: ${playlistUrl}`);
        showFeedback('generator-feedback', 'Playlist excluída com sucesso!', false);
    } catch (error) {
        console.error("Erro ao excluir playlist:", error);
        // Usa a função showFeedback em vez de alert()
        showFeedback('generator-feedback', 'Ocorreu um erro ao excluir a playlist.', true); 
    }
}

/**
 * Helper para gerar o HTML de embed para Spotify ou YouTube.
 * Mais robusto para lidar com diferentes URLs e temas.
 * @param {string} url O URL da playlist ou vídeo.
 * @param {boolean} isModern Se deve usar estilos e alturas mais adequados para o player moderno.
 * @returns {string} HTML do iframe.
 */
function getEmbedHtml(url, isModern = false) {
    if (!url) {
        // Usa o contêiner de embed para garantir que ele seja totalmente ocupado.
        return `<div class="w-full h-full flex items-center justify-center text-center text-slate-400"><i class="fas fa-link-slash fa-2x mb-3"></i><p class="font-semibold mt-2">Nenhum link válido para visualização.</p></div>`;
    }

    const origin = window.location.origin;
    const isDarkMode = document.documentElement.classList.contains('dark');

    // 1. YouTube (Playlist/Vídeo)
    const ytPlaylistMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    const ytVideoMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    
    if (ytPlaylistMatch || ytVideoMatch) {
        let embedUrl;
        if (ytPlaylistMatch) {
            const playlistId = ytPlaylistMatch[1];
            embedUrl = `https://www.youtube.com/embed/videoseries?list=${playlistId}&enablejsapi=1&origin=${origin}`;
        } else {
            const videoId = ytVideoMatch[1];
            embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${origin}`;
        }

        // Usa padding-bottom para criar o aspect ratio 16:9 responsivo
        return `<div class="aspect-w-16 aspect-h-9 w-full relative overflow-hidden" style="padding-bottom: 56.25%; height: 0;">
                    <iframe src="${embedUrl}" title="YouTube player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen 
                            class="absolute top-0 left-0 w-full h-full rounded-xl shadow-xl border border-slate-200 dark:border-slate-600"></iframe>
                </div>`;
    }

    // 2. Spotify (Track/Playlist/Album)
    const spotifyMatch = url.match(/https?:\/\/open\.spotify\.com\/(?:[a-zA-Z0-9\-_]+\/)?(track|playlist|album)\/([a-zA-Z0-9]{22})/);
    if (spotifyMatch) {
        const type = spotifyMatch[1];
        const id = spotifyMatch[2];
        
        // Define a altura com base no tipo e no uso (moderno/não-moderno)
        const height = (type === 'track' || type === 'album') ? '152' : isModern ? '100%' : '352';
        // Ajusta o tema do Spotify
        const themeParam = isDarkMode ? '&theme=0' : '&theme=1';
        const spotifyUri = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator${themeParam}`;
        
        // Para playlists grandes no modo moderno, usar altura de 100% (se o contêiner suportar)
        const style = isModern ? "min-height: 200px; height: 100%;" : "min-height: 152px;";

        return `<iframe style="border-radius:12px; border: 1px solid ${isDarkMode ? '#334155' : '#e2e8f0'}; ${style}" 
                        src="${spotifyUri}" width="100%" height="${height}" frameBorder="0" 
                        allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" 
                        class="shadow-xl"></iframe>`;
    }
    
    // 3. Fallback Link
    return `<div class="mt-4 p-4 rounded-xl bg-gray-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-center">
                <p class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Link não suportado para embed. Abra em uma nova aba:</p>
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 bg-brand-blue text-white font-semibold py-1.5 px-3 rounded-full text-sm hover:bg-brand-blue/90 transition-colors shadow-md">
                    <i class="fas fa-external-link-alt"></i> Acessar Link Externo
                </a>
            </div>`;
}