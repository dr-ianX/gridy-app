class GridyClient {
    constructor() {
        this.socket = null;
        this.posts = [];
        this.currentUser = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.currentPost = null;
        this.musicPlayer = new MusicPlayer();
        
        this.init();
    }
    
    init() {
        console.log('🚀 Iniciando MESH Client...');
        this.loadUser();
        this.setupEventListeners();
        this.connect();
        this.loadTheme();
        this.startVisualDecay();
        this.musicPlayer.init();
        this.createComposerFeatures();
    }
    
    loadUser() {
        const savedNickname = localStorage.getItem('gridy_nickname');
        if (savedNickname) {
            this.currentUser = savedNickname;
            this.hideNicknameModal();
        } else {
            this.showNicknameModal();
        }
    }
    
    showNicknameModal() {
        document.getElementById('nicknameModal').style.display = 'flex';
        document.getElementById('nicknameInput').focus();
    }
    
    hideNicknameModal() {
        document.getElementById('nicknameModal').style.display = 'none';
    }
    
    setupEventListeners() {
        console.log('📝 Configurando eventos...');
        
        // Nickname
        document.getElementById('saveNickname').addEventListener('click', () => this.saveUserNickname());
        document.getElementById('nicknameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveUserNickname();
        });

        // Comentarios
        document.getElementById('submitComment').addEventListener('click', () => this.addComment());
        document.getElementById('commentInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addComment();
        });
        
        // Cerrar modales
        document.getElementById('closeModal').addEventListener('click', () => this.closeCommentModal());
        document.getElementById('closePublishBtn').addEventListener('click', () => this.closePublishModal());
        
        // Publicar
        document.getElementById('publishBtn').addEventListener('click', () => this.openPublishModal());
        document.getElementById('submitPublish').addEventListener('click', () => this.createNewPost());
        document.getElementById('publishInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                this.createNewPost();
            }
        });
        
        // Cerrar modales al hacer click fuera
        document.getElementById('commentModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('commentModal')) this.closeCommentModal();
        });
        
        document.getElementById('publishModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('publishModal')) this.closePublishModal();
        });

        // Reorganizar grid en resize
        window.addEventListener('resize', () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => this.renderGrid(), 250);
        });

        console.log('✅ Eventos configurados');
    }

    createComposerFeatures() {
        // Solo crear si no existe
        if (document.querySelector('.composer-panel')) return;
        
        const composerPanel = document.createElement('div');
        composerPanel.className = 'composer-panel';
        composerPanel.innerHTML = `
            <h4>🎵 Para Compositores TCSACM</h4>
            <button id="shareLyrics">📝 Compartir Letras</button>
            <button id="shareChords">🎸 Compartir Acordes</button>
            <button id="findCollaboration">🤝 Buscar Colaboración</button>
            <button id="shareEvent">📅 Compartir Evento</button>
        `;
    
        document.querySelector('.container').prepend(composerPanel);
    
        document.getElementById('shareLyrics').addEventListener('click', () => {
            this.openLyricsModal();
        });
        document.getElementById('shareChords').addEventListener('click', () => {
            this.openChordsModal();
        });
        document.getElementById('findCollaboration').addEventListener('click', () => {
            this.openCollaborationModal();
        });
        document.getElementById('shareEvent').addEventListener('click', () => {
            this.openEventModal();
        });
    }

    openLyricsModal() {
        const lyrics = prompt('Comparte tus letras o acordes:');
        if (lyrics) {
            this.sendPost(`🎵 COMPOSICIÓN:\n${lyrics}`);
        }
    }

    openChordsModal() {
        const chords = prompt('Comparte la progresión de acordes:');
        if (chords) {
            this.sendPost(`🎸 ACORDES:\n${chords}`);
        }
    }

    openCollaborationModal() {
        const collaboration = prompt('¿Qué buscas para colaborar? (ej: "Baterista para canción rock")');
        if (collaboration) {
            this.sendPost(`🤝 BUSCO COLABORACIÓN:\n${collaboration}`);
        }
    }

    openEventModal() {
        const event = prompt('Comparte tu evento (fecha, lugar, etc.):');
        if (event) {
            this.sendPost(`📅 EVENTO:\n${event}`);
        }
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('gridy_theme');
        if (savedTheme === 'night') {
            document.body.classList.add('night-mode');
        }
        this.createThemeToggle();
    }

    createThemeToggle() {
        if (document.querySelector('.theme-toggle')) return;
        
        const toggleBtn = document.createElement('button');
        toggleBtn.innerHTML = document.body.classList.contains('night-mode') ? '☀️' : '🌙';
        toggleBtn.className = 'theme-toggle';
        toggleBtn.title = 'Cambiar tema';
        toggleBtn.onclick = () => this.toggleTheme();
        document.body.appendChild(toggleBtn);
    }

    toggleTheme() {
        document.body.classList.toggle('night-mode');
        const isNightMode = document.body.classList.contains('night-mode');
        localStorage.setItem('gridy_theme', isNightMode ? 'night' : 'day');
        
        const toggleBtn = document.querySelector('.theme-toggle');
        if (toggleBtn) {
            toggleBtn.innerHTML = isNightMode ? '☀️' : '🌙';
        }
    }
    
    saveUserNickname() {
        const nickname = document.getElementById('nicknameInput').value.trim();
        if (nickname && nickname.length >= 2) {
            this.currentUser = nickname;
            localStorage.setItem('gridy_nickname', nickname);
            this.hideNicknameModal();
            this.connect();
        } else {
            alert('¡Escribe un nickname de al menos 2 caracteres!');
            document.getElementById('nicknameInput').focus();
        }
    }
    
    connect() {
        try {
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const protocol = isLocal ? 'ws:' : 'wss:';
            const wsUrl = isLocal 
                ? `${protocol}//${window.location.hostname}:${window.location.port || 8000}`
                : `${protocol}//${window.location.host}`;
            
            console.log(`🔗 Conectando a: ${wsUrl}`);
            this.socket = new WebSocket(wsUrl);
            
            this.socket.onopen = () => {
                console.log('✅ Conectado al MESH TCSACM');
                this.reconnectAttempts = 0;
                this.updateStatus('Conectado 🌐');
            };
            
            this.socket.onmessage = (event) => {
                this.handleMessage(JSON.parse(event.data));
            };
            
            this.socket.onclose = () => {
                console.log('❌ Conexión cerrada');
                this.handleReconnection();
            };
            
            this.socket.onerror = (error) => {
                console.error('💥 Error de conexión:', error);
                this.updateStatus('Error de conexión 💥');
            };
            
        } catch (error) {
            console.error('❌ Error conectando:', error);
        }
    }
    
    handleReconnection() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * this.reconnectAttempts, 10000);
            
            this.updateStatus(`Reconectando en ${delay/1000}s...`);
            
            setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            this.updateStatus('Error de conexión ❌');
        }
    }
    
    handleMessage(data) {
        switch(data.type) {
            case 'welcome':
                console.log('👋', data.message);
                this.posts = data.posts || [];
                this.renderGrid();
                break;
                
            case 'new_post':
                this.posts.unshift(data.post);
                this.renderGrid();
                this.highlightNewPost(data.post.id);
                break;
                
            case 'comment_added':
                this.handleNewComment(data);
                break;
                
            case 'error':
                alert(`Error: ${data.message}`);
                break;
        }
    }
    
    handleNewComment(data) {
        const post = this.posts.find(p => p.id === data.postId);
        if (post) {
            post.comments.push(data.comment);
            post.interactions = data.newInteractions;
            
            if (this.currentPost && this.currentPost.id === data.postId) {
                this.addCommentToDOM(data.comment);
            }
            
            this.renderGrid();
        }
    }
    
    renderGrid() {
        const gridContainer = document.getElementById('gridContainer');
        if (!gridContainer) return;
        
        gridContainer.innerHTML = '';

        if (this.posts.length === 0) {
            gridContainer.innerHTML = `
                <div class="loading">
                    <h3>¡Bienvenido al MESH de TCSACM! 🌟</h3>
                    <p>Sé el primero en publicar haciendo doble click en cualquier lugar</p>
                    <p>O usa el botón naranja en la esquina inferior derecha</p>
                </div>
            `;
            return;
        }
        
        const sortedPosts = [...this.posts].sort((a, b) => b.interactions - a.interactions);
        const columnCount = Math.min(4, Math.max(2, Math.floor(window.innerWidth / 300)));
        const columns = Array.from({ length: columnCount }, () => []);
        
        sortedPosts.forEach((post, index) => {
            columns[index % columnCount].push(post);
        });
        
        columns.forEach(columnPosts => {
            const column = document.createElement('div');
            column.className = 'masonry-column';
            
            columnPosts.forEach(post => {
                const cell = this.createPostCell(post);
                column.appendChild(cell);
            });
            
            gridContainer.appendChild(column);
        });

        setTimeout(() => {
            this.setupReactionEvents();
        }, 100);
    }
    
    createPostCell(post) {
        const cell = document.createElement('div');
        
        let sizeClass = 'small';
        if (post.interactions >= 15) sizeClass = 'xlarge';
        else if (post.interactions >= 10) sizeClass = 'large';
        else if (post.interactions >= 5) sizeClass = 'medium';
        
        cell.className = `post-cell ${sizeClass}`;
        cell.style.animationDelay = `${Math.random() * 4}s`;
        
        // 🎯 CORRECCIÓN: SOLO usar emojis, eliminar código de avatar
        const userAvatar = this.getUserAvatar(post.user);
        
        cell.innerHTML = `
            <div class="interaction-count">${post.interactions} 💫</div>
            <div class="user-avatar">${userAvatar}</div>
            <div class="user-name">${post.user}</div>
            <div class="post-content">${post.content}</div>
            ${this.addQuickReactions(post)}
        `;
        
        cell.addEventListener('click', () => this.openPostModal(post));
        return cell;
    }
    
    addQuickReactions(post) {
        const reactions = ['🔥', '❤️', '😂', '🎉', '👀', '💫'];
        const reactionsHTML = reactions.map(reaction => 
            `<span class="reaction" data-reaction="${reaction}">${reaction}</span>`
        ).join('');
    
        return `
            <div class="quick-reactions" data-postid="${post.id}">
                ${reactionsHTML}
            </div>
        `;
    }

    setupReactionEvents() {
        const reactionElements = document.querySelectorAll('.reaction');
    
        reactionElements.forEach(reactionEl => {
            const newReactionEl = reactionEl.cloneNode(true);
            reactionEl.parentNode.replaceChild(newReactionEl, reactionEl);
        
            newReactionEl.addEventListener('click', (event) => {
                event.stopPropagation();
                const reaction = newReactionEl.getAttribute('data-reaction');
                const postId = newReactionEl.closest('.quick-reactions').getAttribute('data-postid');
            
                console.log('🎯 Enviando reacción:', reaction, 'para post:', postId);
                this.sendReaction(postId, reaction);
            });
        });
    }

    sendReaction(postId, reaction) {
        console.log('🚀 Enviando reacción:', { 
            postId: postId, 
            tipo: typeof postId,
            reaction: reaction 
        });
    
        const postIdStr = String(postId);
    
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'new_comment',
                postId: postIdStr,
                user: this.currentUser,
                text: reaction
            }));
            console.log('✅ Reacción enviada con ID:', postIdStr);
        } else {
            console.error('❌ WebSocket no conectado');
        }
    }
    
    getUserAvatar(username) {
        const emojis = ['🐱', '🚀', '🌟', '🎮', '🌈', '🐶', '🎨', '⚡', '🌙', '🎵', '🔥', '🍕', '👾', '🦄', '🐙', '👻'];
        const index = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % emojis.length;
        return emojis[index];
    }
    
    openPostModal(post) {
        this.currentPost = post;
        document.getElementById('postTitle').textContent = `Comentarios de ${post.user}`;
        document.getElementById('postContent').textContent = post.content;
        
        const commentsList = document.getElementById('commentsList');
        commentsList.innerHTML = '';
        post.comments.forEach(comment => {
            this.addCommentToDOM(comment);
        });
        
        document.getElementById('commentModal').style.display = 'flex';
        document.getElementById('commentInput').focus();
    }
    
    addCommentToDOM(comment) {
        const commentsList = document.getElementById('commentsList');
        const commentItem = document.createElement('div');
        commentItem.className = 'comment-item';
        commentItem.textContent = `${comment.user}: ${comment.text}`;
        commentsList.appendChild(commentItem);
        
        commentsList.scrollTop = commentsList.scrollHeight;
    }
    
    closeCommentModal() {
        document.getElementById('commentModal').style.display = 'none';
        document.getElementById('commentInput').value = '';
        this.currentPost = null;
    }
    
    openPublishModal() {
        document.getElementById('publishModal').style.display = 'flex';
        document.getElementById('publishInput').focus();
    }
    
    closePublishModal() {
        document.getElementById('publishModal').style.display = 'none';
        document.getElementById('publishInput').value = '';
    }
    
    createNewPost() {
        const content = document.getElementById('publishInput').value.trim();
        
        if (!content) {
            alert('¡Escribe algo para publicar!');
            return;
        }
        
        if (this.sendPost(content)) {
            this.closePublishModal();
        } else {
            alert('No conectado al servidor. Intenta recargar.');
        }
    }
    
    addComment() {
        const commentText = document.getElementById('commentInput').value.trim();
        
        if (!commentText || !this.currentPost) {
            alert('¡Escribe algo chido!');
            return;
        }
        
        if (this.sendComment(this.currentPost.id, commentText)) {
            document.getElementById('commentInput').value = '';
            document.getElementById('commentInput').focus();
            
            const submitComment = document.getElementById('submitComment');
            submitComment.textContent = '¡Comentado! ✓';
            setTimeout(() => {
                submitComment.textContent = 'Comentar';
            }, 1000);
        } else {
            alert('Error al enviar comentario');
        }
    }
    
    sendPost(content) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'new_post',
                user: this.currentUser,
                content: content
            }));
            return true;
        }
        return false;
    }
    
    sendComment(postId, text) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'new_comment',
                postId: postId,
                user: this.currentUser,
                text: text
            }));
            return true;
        }
        return false;
    }
    
    updateStatus(message) {
        let statusEl = document.getElementById('connectionStatus');
        if (!statusEl) {
            statusEl = this.createStatusElement();
        }
        statusEl.textContent = message;
    }
    
    createStatusElement() {
        const statusEl = document.createElement('div');
        statusEl.id = 'connectionStatus';
        statusEl.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 5px 10px;
            border-radius: 10px;
            font-size: 12px;
            z-index: 10000;
        `;
        document.body.appendChild(statusEl);
        return statusEl;
    }
    
    highlightNewPost(postId) {
        const cells = document.querySelectorAll('.post-cell');
        cells.forEach(cell => {
            if (cell.querySelector('.user-name')?.textContent === this.currentUser) {
                cell.style.animation = 'pulse 0.5s ease-in-out';
                setTimeout(() => {
                    cell.style.animation = '';
                }, 500);
            }
        });
    }

    startVisualDecay() {
        setInterval(() => {
            this.applyVisualDecay();
        }, 30000);
    }

    applyVisualDecay() {
        let hasChanges = false;
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        this.posts.forEach(post => {
            const hoursOld = (now - post.timestamp) / oneHour;
            if (hoursOld > 1 && post.interactions > 0) {
                const decay = Math.floor(hoursOld / 2);
                post.interactions = Math.max(0, post.interactions - decay);
                hasChanges = true;
            }
        });

        if (hasChanges) {
            this.renderGrid();
        }
    }
}

// 🎵 REPRODUCTOR DE AUDIO SIMPLIFICADO
class MusicPlayer {
    constructor() {
        this.tracks = [
            { 
                name: "🎵 4 - dR.iAn", 
                file: "/music/track1.mp3" 
            },
            { 
                name: "🎵 Me Reconozco - Rodrigo Escamilla", 
                file: "/music/mereconozco.mp3" 
            }
        ];
        this.currentTrackIndex = 0;
        this.audio = new Audio();
        this.isPlaying = false;
    }

    init() {
        this.createPlayerUI();
        this.setupAudioEvents();
    }

    createPlayerUI() {
        const playerHTML = `
            <div class="music-player">
                <button id="musicToggle">🎵</button>
                <div class="player-info">
                    <span id="nowPlaying">Música Comunal TCSACM</span>
                    <div class="player-controls">
                        <button id="prevTrack">⏮️</button>
                        <button id="nextTrack">⏭️</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', playerHTML);

        document.getElementById('musicToggle').addEventListener('click', () => this.togglePlay());
        document.getElementById('prevTrack').addEventListener('click', () => this.prevTrack());
        document.getElementById('nextTrack').addEventListener('click', () => this.nextTrack());
    }

    setupAudioEvents() {
        this.audio.addEventListener('ended', () => {
            this.isPlaying = false;
            document.getElementById('musicToggle').textContent = '🎵';
            document.getElementById('nowPlaying').textContent = 'Música Comunal TCSACM';
        });

        this.audio.addEventListener('error', (e) => {
            console.error('❌ Error de audio:', e);
            this.showError('Error cargando audio');
        });
    }

    togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.playCurrentTrack();
        }
    }

    playCurrentTrack() {
        const track = this.tracks[this.currentTrackIndex];
        console.log('🎵 Reproduciendo:', track.file);
        
        this.audio.src = track.file;
        this.audio.play().then(() => {
            this.isPlaying = true;
            document.getElementById('musicToggle').textContent = '⏸️';
            document.getElementById('nowPlaying').textContent = `Sonando: ${track.name}`;
        }).catch(error => {
            console.error('❌ Error al reproducir:', error);
            this.showError('No se pudo reproducir');
        });
    }

    pause() {
        this.audio.pause();
        this.isPlaying = false;
        document.getElementById('musicToggle').textContent = '🎵';
    }

    nextTrack() {
        this.pause();
        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.tracks.length;
        this.playCurrentTrack();
    }

    prevTrack() {
        this.pause();
        this.currentTrackIndex = (this.currentTrackIndex - 1 + this.tracks.length) % this.tracks.length;
        this.playCurrentTrack();
    }

    showError(message) {
        document.getElementById('nowPlaying').textContent = message;
        document.getElementById('musicToggle').textContent = '🎵';
    }
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎮 MESH iniciando...');
    window.gridyApp = new GridyClient();
});