let currentSongIndex = 0;
let playlist = [];
let recentlyPlayedSongs = [];
let userFavorites = new Set(); // Store favorite song IDs
let userPlaylists = [];

const getUserId = () => localStorage.getItem('vibesync_user_id');

// --- INITIALIZATION ---
async function init() {
    try {
        const userId = getUserId();
        // Validation: Check if user exists before loading everything
        if (userId && userId !== 'guest') {
            const userCheck = await fetch(`${API_URL}/users/${userId}/recently-played`);
            if (userCheck.status === 404) {
                console.warn("User ID invalid or deleted. Logging out.");
                localStorage.removeItem('vibesync_user_id');
                localStorage.removeItem('vibesync_user_identifier');
                window.location.href = 'index.html';
                return;
            }
        }

        await Promise.all([
            fetchSongs(),
            fetchGenres(), // Was populateGenreFilters
            fetchFavorites(),
            fetchPlaylists(),
            fetchRecentlyPlayed()
        ]);

        // Initial renders
        renderFavorites();

        // Autoplay if playlist not empty
        if (playlist.length > 0) {
            updateCurrentSong(playlist[0]);
            // Set initial source but don't play
            const audio = document.getElementById('audio-player');
            if (audio) audio.src = playlist[0].audioUrl;
        }

        setupEventListeners(); // Restore Event Listeners
        lucide.createIcons();
    } catch (err) {
        console.error("Initialization error:", err);
    }
}

// --- HELPER: Scoped Listener Attachment ---
function attachSongPlayListeners(container, songsList) {
    if (!container || !songsList) return;

    // Only target play buttons WITHIN this container
    container.querySelectorAll('.play-song').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.songId;
            const index = songsList.findIndex(s => s._id === id);

            if (index !== -1) {
                // Critical: Update global playlist context so Next/Prev work
                playlist = songsList;
                playSong(index);
            }
        });
    });
}

// --- SONGS ---
async function fetchSongs() {
    const container = document.getElementById('songs-content');
    if (container) container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';

    try {
        const res = await fetch(`${API_URL}/songs`);
        const songs = await res.json();
        window.songs = songs;
        playlist = songs; // Default playlist is all songs
        renderSongs(songs);
        populateRecommendations();
    } catch (e) {
        console.error("Fetch Songs Failed", e);
        if (container) container.innerHTML = '<div class="text-center text-danger p-3">Failed to load songs</div>';
    }
}

function renderSongs(songsToRender, context = 'all', playlistId = null) {
    const container = document.getElementById('songs-content');
    if (!container) return;

    if (!songsToRender || songsToRender.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted p-5">
                <i data-lucide="music" class="mb-3" style="width: 48px; height: 48px; opacity: 0.5;"></i>
                <p>No songs found for this selection.</p>
            </div>`;
        return;
    }

    // Pass context and playlistId to createSongItem
    container.innerHTML = songsToRender.map(song => createSongItem(song, context, playlistId)).join('');

    // SCOPED Listeners
    attachSongPlayListeners(container, songsToRender);
}

function createSongItem(song, context = 'all', playlistId = null) {
    const isFav = userFavorites.has(song._id);
    let actionBtn = '';

    if (context === 'playlist' && playlistId) {
        actionBtn = `
            <button class="btn btn-sm btn-outline-danger" onclick="removeSongFromPlaylist('${playlistId}', '${song._id}')" title="Remove from Playlist">
                <i data-lucide="minus-circle"></i> Remove
            </button>
        `;
    } else {
        const playlistOptions = userPlaylists.map(pl =>
            `<li><a class="dropdown-item" href="#" onclick="addToPlaylist('${pl._id}', '${song._id}')">${pl.name}</a></li>`
        ).join('') || '<li><span class="dropdown-item text-muted">No Playlists</span></li>';

        actionBtn = `
            <div class="song-action-row d-flex gap-2">
                <button class="btn btn-sm ${isFav ? 'text-danger' : 'text-secondary'} fav-btn" data-song-id="${song._id}" onclick="toggleFavorite('${song._id}', this)" title="Add to Favorites">
                    <i data-lucide="heart" class="${isFav ? 'text-danger' : 'text-secondary'}"></i>
                </button>
                <div class="dropdown">
                    <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-boundary="viewport" title="Add to Playlist">
                        <i data-lucide="plus"></i>
                    </button>
                    <ul class="dropdown-menu">
                        ${playlistOptions}
                    </ul>
                </div>
            </div>
        `;
    }

    return `
        <div class="song-item">
            <img src="${song.coverImage || '/placeholder.svg'}" alt="${song.title}">
            <div class="song-info">
                <h5 class="mb-1">${song.title}</h5>
                <p class="text-muted mb-2 small">${song.artist}</p>
                <span class="badge bg-secondary">${song.genre || 'Unknown'}</span>
            </div>
            <div class="song-actions">
                ${actionBtn}
            </div>
            <button class="btn btn-sm btn-primary play-song" data-song-id="${song._id}">
                <i data-lucide="play"></i> Play
            </button>
        </div>
    `;
}

// --- PLAYER ---
async function playSong(index) {
    if (index < 0 || index >= playlist.length) return;
    currentSongIndex = index;
    const song = playlist[index];

    const audio = document.getElementById('audio-player');

    // Race condition fix
    try {
        audio.pause();
        audio.currentTime = 0;
        audio.src = song.audioUrl;
        await audio.play();
    } catch (e) {
        console.log("Play error (likely interrupted):", e);
    }

    updateCurrentSong(song);

    // Sync to DB for AI
    const userId = getUserId();
    if (userId && userId !== 'guest') {
        fetch(`${API_URL}/users/${userId}/recently-played`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId: song._id })
        }).then(() => populateRecommendations()); // Refresh Recs on Change!
    }
    // Optimistic UI update
    addToRecentlyPlayed(song);
}

function updateCurrentSong(song) {
    // Top Player UI
    document.getElementById('current-song-cover').src = song.coverImage || '/placeholder.svg';
    document.getElementById('current-song-title').textContent = song.title;
    document.getElementById('current-song-artist').textContent = song.artist;

    // Fav Button in Player
    const favBtn = document.getElementById('favorite-btn');
    const isFav = userFavorites.has(song._id);

    // Optimized: Toggle classes instead of rebuilding DOM
    let icon = favBtn.querySelector('svg') || favBtn.querySelector('i');
    if (!icon) {
        favBtn.innerHTML = `<i data-lucide="heart"></i>`;
        icon = favBtn.querySelector('i');
    }

    if (icon) {
        // Clear old colors explicitly to be safe
        icon.classList.remove('text-danger', 'text-secondary');
        icon.classList.add(isFav ? 'text-danger' : 'text-secondary');
    }

    favBtn.onclick = () => toggleFavorite(song._id, favBtn); // Bind click

    // Add to Playlist Dropdown logic
    const dropdown = document.querySelector('#add-to-playlist-btn + .dropdown-menu');
    if (dropdown) {
        dropdown.innerHTML = userPlaylists.map(pl =>
            `<li><a class="dropdown-item" href="#" onclick="addToPlaylist('${pl._id}', '${song._id}')">${pl.name}</a></li>`
        ).join('') || '<li><span class="dropdown-item text-muted">No Playlists</span></li>';
    }

    // Sync Mobile Player
    const mobileCover = document.getElementById('mobile-song-cover');
    const mobileTitle = document.getElementById('mobile-song-title');
    const mobileArtist = document.getElementById('mobile-song-artist');
    const mobilePlayBtn = document.getElementById('mobile-play-btn');

    if (mobileCover) mobileCover.src = song.coverImage || '/placeholder.svg';
    if (mobileTitle) mobileTitle.textContent = song.title;
    if (mobileArtist) mobileArtist.textContent = song.artist;

    // Update Mobile Play Button State
    updatePlayPauseIcon();

    // lucide.createIcons(); // Removed redundant call


    // Highlight Active Song in List
    document.querySelectorAll('.song-item').forEach(item => {
        item.classList.remove('active-song');
        // Check if this item matches current song
        const btn = item.querySelector('.play-song');
        if (btn && btn.dataset.songId === song._id) {
            item.classList.add('active-song');
        }
    });

}

// --- FAVORITES ---
async function fetchFavorites() {
    // Re-fetch ID to be safe
    const currentUserId = localStorage.getItem('vibesync_user_id');
    const container = document.getElementById('favorites-content');

    if (!currentUserId || currentUserId === 'guest') {
        if (container) {
            container.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i data-lucide="lock" class="mb-2" style="width: 24px; height: 24px; opacity: 0.5;"></i>
                    <p class="small mb-0">Login to view favorites</p>
                </div>`;
        }
        return;
    }

    try {
        const res = await fetch(`${API_URL}/favorites/${currentUserId}`);
        const favs = await res.json();
        // favs is array of IDs or Objects
        userFavorites = new Set(favs.map(f => typeof f === 'object' ? f._id : f));
    } catch (e) { console.error("Fetch Favs Error", e); }
}

async function toggleFavorite(songId, btnElement) {
    const userId = getUserId();
    if (!userId) return alert("Please login first");

    // 1. Update State
    const isFav = userFavorites.has(songId);
    if (isFav) userFavorites.delete(songId);
    else userFavorites.add(songId);

    // 2. Update ALL instances in DOM
    const allButtons = document.querySelectorAll(`.fav-btn[data-song-id="${songId}"]`);
    allButtons.forEach(btn => {
        const icon = btn.querySelector('i') || btn.querySelector('svg');
        if (isFav) { // Was fav, now not (Removed)
            btn.classList.remove('text-danger');
            btn.classList.add('text-secondary');

            if (icon) {
                icon.classList.remove('text-danger');
                icon.classList.add('text-secondary');
            }
        } else { // Was not, now is (Added)
            btn.classList.remove('text-secondary');
            btn.classList.add('text-danger');

            if (icon) {
                icon.classList.remove('text-secondary');
                icon.classList.add('text-danger');
            }
        }
    });

    // 3. Update Main Player Button if matches
    const mainFavBtn = document.getElementById('favorite-btn');
    if (playlist[currentSongIndex] && playlist[currentSongIndex]._id === songId) {
        let icon = mainFavBtn.querySelector('svg') || mainFavBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('text-danger', 'text-secondary');
            icon.classList.add(isFav ? 'text-danger' : 'text-secondary'); // toggle logic inverse handled by isFav update above
            // Wait, isFav was updated at start: "if (isFav) delete else add".
            // So if it WAS fav, it is now NOT fav.
            // isFav variable is the OLD state in the lines above:
            // const isFav = userFavorites.has(songId);
            // if (isFav) delete...
            // So the NEW state is !isFav.
            // My code in block 2 handled this logic correctly using if(isFav) { remove danger }
            // Here I need to be careful.
            // Let's reuse the logic: if (isFav) { it was deleted } else { it was added }
            if (isFav) { // Removed
                icon.classList.remove('text-danger');
                icon.classList.add('text-secondary');
            } else { // Added
                icon.classList.remove('text-secondary');
                icon.classList.add('text-danger');
            }
        }
    }

    // lucide.createIcons(); // Removed as requested - we are now manipulating SVGs directly

    // 4. Backend Sync
    try {
        await fetch(`${API_URL}/favorites/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, songId })
        });

        // Update Favorites Tab list specifically (if visible)
        if (document.getElementById('favorites').classList.contains('active')) {
            renderFavorites();
            lucide.createIcons();
        }
    } catch (e) {
        console.error("Toggle Fav request failed", e);
        alert("Failed to update favorite");
    }
}

function renderFavorites() {
    const container = document.getElementById('favorites-content');
    if (!container) return;

    // userFavorites is a Set of IDs. We need the song objects.
    // We can filter window.songs based on userFavorites.
    if (!window.songs) return;

    const favSongs = window.songs.filter(s => userFavorites.has(s._id));

    if (favSongs.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted p-5">
                <i data-lucide="heart" class="mb-3" style="width: 48px; height: 48px; opacity: 0.5;"></i>
                <p>No favorites yet. Start liking songs!</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    container.innerHTML = favSongs.map(song => createSongItem(song, 'favorites')).join('');

    // SCOPED Listeners
    attachSongPlayListeners(container, favSongs);
}

// --- PLAYLISTS ---
async function fetchPlaylists() {
    const currentUserId = localStorage.getItem('vibesync_user_id');
    const container = document.getElementById('playlists-content');
    const createBtn = document.getElementById('create-playlist-btn');

    if (!currentUserId) return;

    // GUEST LOGIC
    if (currentUserId === 'guest') {
        if (createBtn) createBtn.style.display = 'none'; // Hide Create Button
        if (container) {
            container.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i data-lucide="lock" class="mb-2" style="width: 24px; height: 24px; opacity: 0.5;"></i>
                    <p class="small mb-0">Login to create playlists</p>
                </div>`;
        }
        return;
    }

    if (container) container.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';

    try {
        const userId = getUserId();
        const res = await fetch(`${API_URL}/playlists/${userId}`);
        if (!res.ok) throw new Error("Failed to fetch");

        userPlaylists = await res.json();
        renderPlaylists();

    } catch (e) {
        console.error("Fetch Playlists Error", e);
        if (container) container.innerHTML = `
            <div class="text-center text-danger p-3">
                Failed to load playlists. <br>
                <button class="btn btn-sm btn-outline-secondary mt-2" onclick="fetchPlaylists()">Retry</button>
            </div>`;
    }
}

function renderPlaylists() {
    const list = document.getElementById('playlists-content');
    if (!list) return;

    // Update Player Dropdown as well
    const playerDropdown = document.querySelector('#add-to-playlist-btn + .dropdown-menu');
    if (playerDropdown && window.songs) {
        // We need 'song' context for the onclick... wait, the onclick needs a songId. 
        // The player dropdown relies on 'updateCurrentSong' to set the onclick with the *current* song ID.
        // But we can AT LEAST update the list if the current song is known.
        // Actually, 'updateCurrentSong' is better suited for this. 
        // However, if we Create a Playlist, we want the dropdown to update WITHOUT changing song.
        // The issue is: we don't know the current Song ID easily here unless we look at 'playlist[currentSongIndex]'.
        const currentSong = playlist[currentSongIndex];
        if (currentSong) {
            const dropdownItems = userPlaylists.map(pl =>
                `<li><a class="dropdown-item" href="#" onclick="addToPlaylist('${pl._id}', '${currentSong._id}')">${pl.name}</a></li>`
            ).join('') || '<li><span class="dropdown-item text-muted">No Playlists</span></li>';
            playerDropdown.innerHTML = dropdownItems;
        }
    }

    if (!Array.isArray(userPlaylists)) userPlaylists = [];

    if (userPlaylists.length === 0) {
        list.innerHTML = `
            <div class="text-center text-muted p-5">
                <i data-lucide="list-music" class="mb-3" style="width: 48px; height: 48px; opacity: 0.5;"></i>
                <p>No playlists yet.</p>
                <button class="btn btn-sm btn-outline-primary mt-2" onclick="createPlaylistWithModal()">Create one!</button>
            </div>`;
        return;
    }

    list.innerHTML = userPlaylists.map(pl => `
        <div class="d-flex align-items-center mb-2 p-2 hover-bg-light rounded playlist-item">
            <i data-lucide="list-music" class="me-3"></i>
            <div class="flex-grow-1" style="cursor: pointer;" onclick="viewPlaylist('${pl._id}')" title="View Playlist">
                <h6 class="mb-0 text-primary">${pl.name}</h6>
                <small class="text-muted">${Array.isArray(pl.songs) ? pl.songs.length : 0} songs</small>
            </div>
            <div class="d-flex gap-1">
                <button class="btn btn-sm btn-outline-primary" onclick="playPlaylist('${pl._id}')" title="Play">
                    <i data-lucide="play" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="renamePlaylist('${pl._id}', '${pl.name}')" title="Rename">
                    <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deletePlaylist('${pl._id}')" title="Delete">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Helper to open modal if button is missing/broken
window.createPlaylistWithModal = () => {
    const el = document.getElementById('createPlaylistModal');
    if (el) new bootstrap.Modal(el).show();
};

async function createPlaylist() {
    // Modal logic handled by Bootstrap data-attributes on the button mostly.
    // But we need to handle the "Create" button click inside the modal.
    const nameInput = document.getElementById('playlist-name-input');
    const userId = getUserId();
    if (!nameInput) return;
    const name = nameInput.value.trim();
    if (!name || !userId) return;

    try {
        await fetch(`${API_URL}/playlists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, name })
        });

        // Hide Modal
        const modalEl = document.getElementById('createPlaylistModal');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.hide();

        // Clear input
        nameInput.value = '';

        fetchPlaylists().then(() => lucide.createIcons()); // Refresh
    } catch (e) { alert("Failed to create playlist"); }
}

function renamePlaylist(id, currentName) {
    document.getElementById('rename-playlist-id').value = id;
    document.getElementById('rename-playlist-input').value = currentName;
    new bootstrap.Modal(document.getElementById('renamePlaylistModal')).show();
}

async function executeRenamePlaylist() {
    const id = document.getElementById('rename-playlist-id').value;
    const newName = document.getElementById('rename-playlist-input').value.trim();
    if (!newName) return;

    try {
        await fetch(`${API_URL}/playlists/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });

        // Hide Modal
        const modalEl = document.getElementById('renamePlaylistModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();

        fetchPlaylists().then(() => lucide.createIcons());
    } catch (e) { alert("Failed to rename playlist"); }
}

async function deletePlaylist(id) {
    if (!confirm("Are you sure you want to delete this playlist?")) return;

    try {
        await fetch(`${API_URL}/playlists/${id}`, {
            method: 'DELETE'
        });
        fetchPlaylists().then(() => lucide.createIcons());
    } catch (e) { alert("Failed to delete playlist"); }
}

async function addToPlaylist(playlistId, songId) {
    try {
        await fetch(`${API_URL}/playlists/${playlistId}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId })
        });
        alert("Added to playlist!");
        fetchPlaylists().then(() => lucide.createIcons());
    } catch (e) { alert("Failed to add song"); }
}

async function removeSongFromPlaylist(playlistId, songId) {
    if (!confirm("Remove song from playlist?")) return;
    try {
        await fetch(`${API_URL}/playlists/${playlistId}/songs/${songId}`, {
            method: 'DELETE'
        });
        // Update local state
        const pl = userPlaylists.find(p => p._id === playlistId);
        if (pl) {
            // Depending on if songs are objects or IDs
            pl.songs = pl.songs.filter(s => (s._id || s) !== songId);
            renderPlaylists(); // Update count
            viewPlaylist(playlistId); // Refresh view
            lucide.createIcons();
        }
    } catch (e) { alert("Failed to remove song"); }
}

function viewPlaylist(playlistId) {
    const pl = userPlaylists.find(p => p._id === playlistId);
    if (!pl) return;

    // Switch tab to songs
    const songsTab = new bootstrap.Tab(document.querySelector('#songs-tab'));
    songsTab.show();

    // Handle populated vs unpopulated songs
    // The backend /playlists/:userId populates songs.
    // So pl.songs should be an array of objects.

    // Pass context 'playlist' and the playlistId
    renderSongs(pl.songs, 'playlist', playlistId);
    lucide.createIcons();

    // Update header or show a "Back to All Songs" button?
    // For now, let's allow filtering back to all.
    // Link to header removed to prevent fragility.
    // const searchHeader = document.querySelector('#songs-content').parentElement.previousElementSibling;
    // Actually, let's just inject a "Showing Playlist: Name (X) [Show All]" banner
    const container = document.getElementById('songs-content');
    const existingBanner = container.querySelector('.playlist-banner');
    if (existingBanner) existingBanner.remove();

    container.insertAdjacentHTML('afterbegin', `
        <div class="d-flex justify-content-between align-items-center mb-3 p-2 bg-light rounded playlist-banner">
            <strong>Playlist: ${pl.name}</strong>
            <button class="btn btn-sm btn-outline-secondary" onclick="resetFilter()">Show All Songs</button>
        </div>
    `);
}

function playPlaylist(playlistId) {
    const pl = userPlaylists.find(p => p._id === playlistId);
    if (pl && pl.songs.length > 0) {
        playlist = pl.songs;
        playSong(0);
    } else {
        alert("Empty playlist!");
    }
}


// --- GENRES ---
async function fetchGenres() {
    const container = document.getElementById('genre-filters');
    if (!container) return;
    container.innerHTML = 'Loading...';
    try {
        const res = await fetch(`${API_URL}/genres`);
        const genres = await res.json();
        const allBtn = `<button class="btn btn-primary btn-sm me-1 mb-1 genre-btn" data-genre="all" onclick="resetFilter()">All</button>`;
        const genreBtns = genres.map(g =>
            `<button class="btn btn-outline-secondary btn-sm me-1 mb-1 genre-btn" data-genre="${g}" onclick="filterByGenre('${g}')">${g}</button>`
        ).join('');
        container.innerHTML = allBtn + genreBtns;
    } catch (e) { container.innerHTML = 'Error loading genres'; }
}

function updateActiveGenreButton(activeGenre) {
    const btns = document.querySelectorAll('#genre-filters .genre-btn');
    btns.forEach(btn => {
        const isMatch = btn.getAttribute('data-genre') === activeGenre || (activeGenre === 'all' && btn.innerText === 'All');
        if (isMatch) {
            btn.classList.remove('btn-outline-secondary');
            btn.classList.add('btn-primary');
        } else {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-secondary');
        }
    });
}

function filterByGenre(genre) {
    const allSongs = window.songs || [];
    const filtered = allSongs.filter(s => s.genre === genre);
    playlist = filtered; // Update current playlist context
    renderSongs(filtered);
    lucide.createIcons();
    updateActiveGenreButton(genre);
}

function resetFilter() {
    playlist = window.songs || [];
    renderSongs(playlist);
    lucide.createIcons();
    updateActiveGenreButton('all');
}




// --- SEARCH & RECENT ---
function setupEventListeners() {
    // Play/Pause
    const audio = document.getElementById('audio-player');
    const btn = document.getElementById('play-pause-btn');

    btn.addEventListener('click', () => {
        if (audio.paused) audio.play();
        else audio.pause();
    });

    audio.addEventListener('play', updatePlayPauseIcon);
    audio.addEventListener('pause', updatePlayPauseIcon);
    audio.addEventListener('ended', () => playSong((currentSongIndex + 1) % playlist.length));

    // Next/Prev
    document.getElementById('next-btn').addEventListener('click', () => playSong((currentSongIndex + 1) % playlist.length));
    document.getElementById('prev-btn').addEventListener('click', () => playSong((currentSongIndex - 1 + playlist.length) % playlist.length));

    // Search
    // Search Setup
    function bindSearch(inputId, btnId, resultsId) {
        const searchInput = document.getElementById(inputId);
        const searchBtn = document.getElementById(btnId);
        const container = document.getElementById(resultsId);

        if (!searchInput || !container) return;

        function performSearch() {
            const query = searchInput.value.toLowerCase().trim();

            if (!query) {
                // If it's the main song list (grid search), reset to show all songs
                if (resultsId === 'songs-content') {
                    renderSongs(window.songs);
                } else {
                    container.style.display = 'none';
                }
                return;
            }

            const results = window.songs.filter(s =>
                (s.title && s.title.toLowerCase().includes(query)) ||
                (s.artist && s.artist.toLowerCase().includes(query)) ||
                (s.genre && s.genre.toLowerCase().includes(query))
            );

            // Special handling for main grid search vs dropdown search
            if (resultsId === 'songs-content') {
                renderSongs(results);
                // Ensure Songs tab is active
                const songsTab = document.querySelector('#songs-tab');
                if (songsTab && !songsTab.classList.contains('active')) {
                    new bootstrap.Tab(songsTab).show();
                }
            } else {
                renderSearchResults(results, resultsId);
            }
        }

        if (searchBtn) searchBtn.onclick = performSearch;
        searchInput.onkeypress = (e) => {
            if (e.key === 'Enter') performSearch();
        };
        searchInput.oninput = performSearch;

        // Optional: Hide on click outside
        // Optional: Hide on click outside (ONLY for dropdown results, NOT for main content)
        if (resultsId !== 'songs-content') {
            document.addEventListener('click', (e) => {
                if (container && container.style.display !== 'none') {
                    if (!searchInput.contains(e.target) && !container.contains(e.target) && (!searchBtn || !searchBtn.contains(e.target))) {
                        container.style.display = 'none';
                    }
                }
            });
        }
    }

    bindSearch('search-input-mobile', 'search-btn-mobile', 'search-results-mobile');
    bindSearch('search-input-grid', 'search-btn-grid', 'search-results-grid');

    // Create Playlist Btn
    // --- MOBILE PLAYER SYNC ---
    const mobilePlayBtn = document.getElementById('mobile-play-btn');
    const mobilePrevBtn = document.getElementById('mobile-prev-btn');
    const mobileNextBtn = document.getElementById('mobile-next-btn');

    if (mobilePlayBtn) {
        mobilePlayBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent bubbling if clicking bar opens detail
            if (audio.paused) audio.play();
            else audio.pause();
        });
    }
    if (mobilePrevBtn) mobilePrevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playSong((currentSongIndex - 1 + playlist.length) % playlist.length);
    });
    if (mobileNextBtn) mobileNextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playSong((currentSongIndex + 1) % playlist.length);
    });

    const confirmCreatePlaylistBtn = document.getElementById('confirm-create-playlist-btn');
    if (confirmCreatePlaylistBtn) {
        confirmCreatePlaylistBtn.addEventListener('click', createPlaylist);
    }

    const createPlaylistForm = document.getElementById('create-playlist-form');
    if (createPlaylistForm) {
        createPlaylistForm.addEventListener('submit', (e) => {
            e.preventDefault();
            createPlaylist();
        });
    }

    const confirmRenameBtn = document.getElementById('confirm-rename-playlist-btn');
    if (confirmRenameBtn) {
        confirmRenameBtn.addEventListener('click', executeRenamePlaylist);
    }
}

function updatePlayPauseIcon() {
    const audio = document.getElementById('audio-player');
    const btn = document.getElementById('play-pause-btn');
    const mobileBtn = document.getElementById('mobile-play-btn');

    if (btn) btn.innerHTML = audio.paused ? `<i data-lucide="play-circle"></i>` : `<i data-lucide="pause-circle"></i>`;
    if (mobileBtn) mobileBtn.innerHTML = audio.paused ? `<i data-lucide="play" style="width: 20px; height: 20px;"></i>` : `<i data-lucide="pause" style="width: 20px; height: 20px;"></i>`;

    lucide.createIcons();
}

function renderSearchResults(results, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.style.display = 'block';
    if (!results || results.length === 0) {
        container.innerHTML = '<div class="text-center text-muted p-2">No results found</div>';
        return;
    }
    container.innerHTML = results.map(createSongItem).join(''); // Re-use song item
    lucide.createIcons();
    // SCOPED Listeners
    attachSongPlayListeners(container, results);
}

async function populateRecommendations() {
    const userId = getUserId() || 'guest';
    const container = document.getElementById('recommendations');

    if (userId === 'guest') {
        if (container) {
            container.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i data-lucide="lock" class="mb-2" style="width: 24px; height: 24px; opacity: 0.5;"></i>
                    <p class="small mb-0">Login to view recommendations</p>
                </div>`;
        }
        return;
    }

    if (container) container.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';

    try {
        const url = `${API_URL}/recommendations/${userId}`;
        console.log("Fetching Recommendations from:", url);
        
        const res = await fetch(url);
        
        // Handle both 2xx (success) and 304 (cached) responses
        if (!res.ok && res.status !== 304) {
            throw new Error(`API Error: ${res.status} ${res.statusText}`);
        }
        
        // 304 returns empty body, use empty array
        let recommendedSongs = [];
        if (res.status !== 304) {
            recommendedSongs = await res.json();
        }
        
        console.log("Recommendations Response:", recommendedSongs);

        if (container) {
            if (!recommendedSongs || recommendedSongs.length === 0) {
                container.innerHTML = '<div class="text-center text-muted p-2">No recommendations yet</div>';
            } else {
                container.innerHTML = recommendedSongs.map(createSongItem).join('');
                lucide.createIcons();
                // SCOPED Listeners
                attachSongPlayListeners(container, recommendedSongs);
            }
        }

    } catch (e) {
        console.error("Recommendations Error:", e.message, e);
        if (container) container.innerHTML = `<div class="text-center text-danger p-2"><small>Failed to load: ${e.message}</small></div>`;
    }
}

async function addToRecentlyPlayed(song) {
    // Optimistic Update
    recentlyPlayedSongs = recentlyPlayedSongs.filter(s => s._id !== song._id);
    recentlyPlayedSongs.unshift(song);
    if (recentlyPlayedSongs.length > 5) recentlyPlayedSongs.pop(); // UI stays at 5, backend at 25

    const container = document.getElementById('recently-played');
    if (container) {
        container.innerHTML = recentlyPlayedSongs.map(createSongItem).join('');
        lucide.createIcons();
        // SCOPED Listeners for Recent
        attachSongPlayListeners(container, recentlyPlayedSongs);
    }

    // Backend Sync
    const userId = getUserId();
    if (userId) {
        try {
            await fetch(`${API_URL}/users/${userId}/recently-played`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ songId: song._id })
            });
        } catch (e) { console.error("Recent Sync Error", e); }
    }
}

async function fetchRecentlyPlayed() {
    const currentUserId = localStorage.getItem('vibesync_user_id');
    const container = document.getElementById('recently-played');

    if (!currentUserId || currentUserId === 'guest') {
        if (container) {
            container.innerHTML = `
                <div class="text-center text-muted p-4">
                    <i data-lucide="lock" class="mb-2" style="width: 24px; height: 24px; opacity: 0.5;"></i>
                    <p class="small mb-0">Login to see history</p>
                </div>`;
            lucide.createIcons();
        }
        return;
    }

    if (container) container.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';

    try {
        const url = `${API_URL}/users/${currentUserId}/recently-played`;
        console.log("Fetching Recently Played from:", url);
        
        const res = await fetch(url);
        
        // Handle both 2xx (success) and 304 (cached) responses
        if (!res.ok && res.status !== 304) {
            throw new Error(`API Error: ${res.status} ${res.statusText}`);
        }
        
        // 304 returns empty body, need to use cached version (browser handles this automatically)
        let songs = [];
        if (res.status !== 304) {
            songs = await res.json();
        }
        
        console.log("Recently Played Response:", songs);
        recentlyPlayedSongs = songs;

        if (container) {
            if (!songs || songs.length === 0) {
                container.innerHTML = '<div class="text-center text-muted p-2">No history yet</div>';
            } else {
                container.innerHTML = songs.map(createSongItem).join('');
                lucide.createIcons();
                // SCOPED Listeners
                attachSongPlayListeners(container, songs);
            }
        }
    } catch (e) {
        console.error("Fetch Recent Error:", e.message, e);
        if (container) container.innerHTML = `<div class="text-center text-danger p-2"><small>Failed to load history: ${e.message}</small></div>`;
    }
}

function renderRecommendations(recs) {
    const container = document.getElementById('recommendations');
    if (container) {
        container.innerHTML = recs.map(createSongItem).join('');
        lucide.createIcons();
        // SCOPED Listeners
        attachSongPlayListeners(container, recs);
    }
}

// Make functions global for onclick handlers in HTML strings
window.toggleFavorite = toggleFavorite;
window.createPlaylist = createPlaylist;
window.addToPlaylist = addToPlaylist;
window.playPlaylist = playPlaylist;
window.filterByGenre = filterByGenre;
window.resetFilter = resetFilter;
window.deletePlaylist = deletePlaylist;
window.renamePlaylist = renamePlaylist;
window.removeSongFromPlaylist = removeSongFromPlaylist;
window.viewPlaylist = viewPlaylist;

// Start
init();
