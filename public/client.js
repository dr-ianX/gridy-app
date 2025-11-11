class GridyClient {
    constructor() {
        this.socket = null;
        this.posts = [];
        this.currentUser = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.currentPost = null;
        this.musicPlayer = new MusicPlayer(this); // Pasamos la referencia del cliente
        this.composerMode = true;
        
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
        this.createDynamicBackground(); // 🆕 Fondo dinámico
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
        if (document.querySelector('.composer-panel')) return;
        
        const composerPanel = document.createElement('div');
        composerPanel.className = 'composer-panel';
        composerPanel.innerHTML = `
            <h4>🎵 Herramientas para Compositores</h4>
            <div class="composer-grid">
                <button class="composer-btn" data-type="lyrics">
                    <span class="icon">📝</span>
                    <span class="label">Letras</span>
                    <small>Comparte tus canciones</small>
                </button>
                <button class="composer-btn" data-type="chords">
                    <span class="icon">🎸</span>
                    <span class="label">Acordes</span>
                    <small>Progresiones armónicas</small>
                </button>
                <button class="composer-btn" data-type="collaboration">
                    <span class="icon">🤝</span>
                    <span class="label">Colaborar</span>
                    <small>Busco músicos</small>
                </button>
                <button class="composer-btn" data-type="event">
                    <span class="icon">📅</span>
                    <span class="label">Eventos</span>
                    <small>Conciertos y talleres</small>
                </button>
                <button class="composer-btn" data-type="project">
                    <span class="icon">💿</span>
                    <span class="label">Proyectos</span>
                    <small>Álbumes en proceso</small>
                </button>
                <button class="composer-btn" data-type="lookingfor">
                    <span class="icon">🔍</span>
                    <span class="label">Busco</span>
                    <small>Equipo o recursos</small>
                </button>
            </div>
        `;
    
        document.querySelector('.container').prepend(composerPanel);
    
        // Event listeners para todos los botones
        document.querySelectorAll('.composer-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.currentTarget.getAttribute('data-type');
                this.openComposerModal(type);
            });
        });
    }

    // 🆕 CREAR FONDO DINÁMICO
    createDynamicBackground() {
        if (document.getElementById('dynamicBackground')) return;
        
        const bg = document.createElement('div');
        bg.id = 'dynamicBackground';
        bg.className = 'dynamic-bg';
        document.body.appendChild(bg);
    }

    // 🆕 ACTUALIZAR FONDO SEGÚN CANCIÓN
    updateDynamicBackground(imageUrl) {
        const bg = document.getElementById('dynamicBackground');
        if (bg && imageUrl) {
            bg.style.backgroundImage = `url(${imageUrl})`;
            bg.style.opacity = '0.15'; // 🎯 Ajusta la opacidad para mejor legibilidad
        }
    }

    openComposerModal(postType) {
        const configs = {
            lyrics: {
                title: '📝 Compartir Letras',
                placeholder: 'Escribe las letras de tu canción...\n\nEjemplo:\n[Estrofa 1]\nEstas son las letras de mi alma...\n\n[Coro]\nY este es el coro que todos cantarán...',
                prefix: '🎵 LETRAS:\n'
            },
            chords: {
                title: '🎸 Progresión de Acordes',
                placeholder: 'Comparte la progresión:\n\nEjemplo:\nG - D - Em - C\n\nO en notación jazz:\nAm7 | D7 | G maj7 | C maj7',
                prefix: '🎸 ACORDES:\n'
            },
            collaboration: {
                title: '🤝 Busco Colaboración',
                placeholder: '¿Qué necesitas?\n\nEjemplos:\n- "Baterista para tema rock"\n- "Cantante para balada"\n- "Productor para mezclar"\n- "Compositor para letras"',
                prefix: '🤝 COLABORACIÓN:\n'
            },
            event: {
                title: '📅 Compartir Evento',
                placeholder: 'Detalles del evento:\n\nFecha: [fecha]\nHora: [hora]\nLugar: [lugar]\nCosto: [costo]\n\nDescripción...',
                prefix: '📅 EVENTO:\n'
            },
            project: {
                title: '💿 Mi Proyecto Musical',
                placeholder: 'Cuéntanos sobre tu proyecto:\n\n- Nombre del proyecto\n- Género musical\n- Estado (grabando, mezclando, etc.)\n- Fecha estimada de lanzamiento\n- Necesidades específicas',
                prefix: '💿 PROYECTO:\n'
            },
            lookingfor: {
                title: '🔍 Estoy Buscando',
                placeholder: '¿Qué necesitas encontrar?\n\nEjemplos:\n- "Estudio de grabación económico"\n- "Diseñador para portada de álbum"\n- "Salas para ensayar"\n- "Manager o representante"',
                prefix: '🔍 BUSCO:\n'
            }
        };

        const config = configs[postType];
        const content = prompt(config.title + '\n\n' + config.placeholder);
        
        if (content) {
            this.sendPost(config.prefix + content, 'composer');
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
                // 🎯 Sincronizar música con el servidor
                if (data.musicState) {
                    this.musicPlayer.syncWithServer(data.musicState);
                }
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

            // 🎯 Actualización de música sincronizada
            case 'music_update':
                this.musicPlayer.syncWithServer(data.musicState);
                break;

            // 🆕 Post removido (resuelto)
            case 'post_removed':
                this.posts = this.posts.filter(p => p.id !== data.postId);
                this.renderGrid();
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
            this.setupResolveButtons(); // 🆕 Configurar botones de resolución
        }, 100);
    }
    
    createPostCell(post) {
        const cell = document.createElement('div');
        
        // Tamaño inteligente basado en interacciones + contenido
        let sizeClass = this.calculatePostSize(post);
        
        cell.className = `post-cell ${sizeClass}`;
        cell.style.animationDelay = `${Math.random() * 4}s`;
        
        // 🎯 Indicador visual del tipo de contenido
        const typeIndicator = this.getTypeIndicator(post);
        const userAvatar = this.getUserAvatar(post.user);
        
        cell.innerHTML = `
            <div class="interaction-count">${post.interactions} 💫</div>
            ${typeIndicator}
            <div class="user-avatar">${userAvatar}</div>
            <div class="user-name">${post.user}</div>
            <div class="post-content">${post.content}</div>
            ${this.addQuickReactions(post)}
            ${this.addResolveButton(post)} <!-- 🆕 Botón de resolución -->
        `;
        
        cell.addEventListener('click', () => this.openPostModal(post));
        
        // 🎯 Efectos especiales para posts populares
        this.applySpecialEffects(cell, post);
        
        return cell;
    }

    // 🆕 AÑADIR BOTÓN DE RESOLUCIÓN PARA COLABORACIONES Y BÚSQUEDAS
    addResolveButton(post) {
        const isCollaboration = post.content.includes('🤝 COLABORACIÓN:') || post.content.includes('🔍 BUSCO:');
        const isAuthor = post.user === this.currentUser;
        
        if (isCollaboration && isAuthor && !post.isResolved) {
            return `
                <button class="resolve-btn" onclick="window.gridyApp.resolvePost('${post.id}')" 
                        title="Marcar como resuelto">
                    ✅ Resuelto
                </button>
            `;
        }
        return '';
    }

    // 🆕 CONFIGURAR BOTONES DE RESOLUCIÓN
    setupResolveButtons() {
        document.querySelectorAll('.resolve-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const postId = e.target.closest('.post-cell').querySelector('.quick-reactions').getAttribute('data-postid');
                this.resolvePost(postId);
            });
        });
    }

    // 🆕 RESOLVER POST (marcar como completado)
    resolvePost(postId) {
        if (!confirm('¿Estás seguro de que quieres marcar este post como resuelto? Esto lo eliminará de la vista.')) {
            return;
        }

        fetch(`/resolve-post/${postId}`, { 
            method: 'POST' 
        })
        .then(response => {
            if (response.ok) {
                console.log('✅ Post marcado como resuelto');
                // El post se eliminará automáticamente cuando llegue el broadcast
            } else {
                alert('Error al marcar el post como resuelto');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error de conexión');
        });
    }

    // 🎵 Calcular tamaño inteligente
    calculatePostSize(post) {
        const baseInteractions = post.interactions;
        const contentLength = post.content.length;
        
        // 🎯 Posts importantes son más grandes por defecto
        let importanceBonus = 0;
        if (this.isImportantPost(post)) {
            importanceBonus = 5;
        }
        
        let sizeScore = baseInteractions + (contentLength / 100) + importanceBonus;
        
        if (sizeScore >= 20) return 'xlarge';
        if (sizeScore >= 15) return 'large';
        if (sizeScore >= 8) return 'medium';
        return 'small';
    }

    // 🎵 Identificar posts importantes
    isImportantPost(post) {
        return post.content.includes('🤝 COLABORACIÓN:') ||
               post.content.includes('🔍 BUSCO:') || 
               post.content.includes('💿 PROYECTO:') ||
               post.content.includes('📅 EVENTO:');
    }

    // 🎵 Indicador del tipo de contenido
    getTypeIndicator(post) {
        if (post.content.includes('🎵 LETRAS:')) {
            return '<div class="post-type-badge lyrics-badge">📝 Letras</div>';
        }
        if (post.content.includes('🎸 ACORDES:')) {
            return '<div class="post-type-badge chords-badge">🎸 Acordes</div>';
        }
        if (post.content.includes('🤝 COLABORACIÓN:')) {
            return '<div class="post-type-badge collab-badge">🤝 Colaboración</div>';
        }
        if (post.content.includes('📅 EVENTO:')) {
            return '<div class="post-type-badge event-badge">📅 Evento</div>';
        }
        if (post.content.includes('💿 PROYECTO:')) {
            return '<div class="post-type-badge project-badge">💿 Proyecto</div>';
        }
        if (post.content.includes('🔍 BUSCO:')) {
            return '<div class="post-type-badge search-badge">🔍 Busco</div>';
        }
        return '';
    }

    // 🎵 Efectos especiales tipo Bejeweled
    applySpecialEffects(cell, post) {
        // Efecto de glow para posts muy populares
        if (post.interactions >= 15) {
            cell.classList.add('popular-glow');
        }
        
        // Efecto de "combo" para múltiples posts del mismo usuario
        const userPosts = this.posts.filter(p => p.user === post.user);
        if (userPosts.length >= 3) {
            cell.classList.add('combo-effect');
        }
        
        // Efecto especial para posts de compositores
        if (post.content.includes('🎵') || post.content.includes('🎸')) {
            cell.classList.add('composer-post');
        }
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
    
    sendPost(content, postType = 'general') {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'new_post',
                user: this.currentUser,
                content: content,
                postType: postType
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
            
            // 🎯 Posts importantes decaen más lento
            const decayRate = this.isImportantPost(post) ? 0.3 : 1;
            
            if (hoursOld > 2 && post.interactions > 0) {
                const decay = Math.floor((hoursOld / 6) * decayRate); // Más lento
                post.interactions = Math.max(0, post.interactions - decay);
                hasChanges = true;
            }
        });

        if (hasChanges) {
            this.renderGrid();
        }
    }
}

// 🎵 REPRODUCTOR DE AUDIO MEJORADO CON SINCRONIZACIÓN
class MusicPlayer {
    constructor(gridyClient) {
        this.gridyClient = gridyClient;
        this.tracks = [];
        this.currentTrackIndex = 0;
        this.audio = new Audio();
        this.isPlaying = false;
        this.trackStartTime = 0;
        this.currentTrackName = '';
        this.playlist = [];
    }

    init() {
        this.createPlayerUI();
        this.setupAudioEvents();
    }

    // 🎯 SINCRONIZAR CON EL SERVIDOR
    syncWithServer(musicState) {
        this.playlist = musicState.playlist;
        this.currentTrackIndex = musicState.currentTrackIndex;
        this.isPlaying = musicState.isPlaying;

        console.log('🎵 Sincronizando música:', {
            track: this.playlist[this.currentTrackIndex]?.name,
            playing: this.isPlaying
        });

        // Actualizar UI
        this.updatePlayerUI();

        // Sincronizar reproducción
        if (this.isPlaying && !this.audio.paused) {
            // Ya está reproduciendo, no hacer nada
        } else if (this.isPlaying && this.audio.paused) {
            this.playCurrentTrack();
        } else {
            this.pause();
        }
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

    updatePlayerUI() {
        const currentTrack = this.playlist[this.currentTrackIndex];
        if (currentTrack) {
            document.getElementById('nowPlaying').textContent = `Sonando: ${currentTrack.name}`;
            // 🎯 Actualizar fondo dinámico
            this.gridyClient.updateDynamicBackground(currentTrack.image);
        }
    }

    setupAudioEvents() {
        this.audio.addEventListener('ended', () => {
            this.handleTrackEnd();
        });

        this.audio.addEventListener('error', (e) => {
            console.error('❌ Error de audio:', e);
            this.showError('Error cargando audio');
        });
    }

    handleTrackEnd() {
        const duration = Math.floor((Date.now() - this.trackStartTime) / 1000);
        this.completeSACMTracking(this.currentTrackName, duration);
        
        // 🎯 Sincronizar con servidor para siguiente canción
        this.sendMusicCommand('next');
    }

    togglePlay() {
        if (this.isPlaying) {
            this.sendMusicCommand('pause');
        } else {
            this.sendMusicCommand('play');
        }
    }

    playCurrentTrack() {
        const track = this.playlist[this.currentTrackIndex];
        if (!track) {
            console.log('❌ No hay track disponible');
            return;
        }

        console.log('🎵 Reproduciendo:', track.file);
        
        this.startSACMTracking(track.name);
        
        this.audio.src = track.file;
        this.audio.play().then(() => {
            this.isPlaying = true;
            document.getElementById('musicToggle').textContent = '⏸️';
            this.updatePlayerUI();
        }).catch(error => {
            console.error('❌ Error al reproducir:', error);
            this.showError('No se pudo reproducir');
        });
    }

    // 🎯 Método para tracking SACM
    startSACMTracking(trackName) {
        this.trackStartTime = Date.now();
        this.currentTrackName = trackName;
        
        if (this.gridyClient.socket?.readyState === WebSocket.OPEN) {
            this.gridyClient.socket.send(JSON.stringify({
                type: 'music_play_start',
                songId: trackName,
                userId: this.gridyClient.currentUser
            }));
        }
    }

    completeSACMTracking(trackName, duration) {
        if (this.gridyClient.socket?.readyState === WebSocket.OPEN) {
            this.gridyClient.socket.send(JSON.stringify({
                type: 'music_play_complete',
                songId: trackName,
                userId: this.gridyClient.currentUser,
                duration: duration
            }));
            console.log('📊 Tracking SACM enviado:', { trackName, duration });
        }
    }

    pause() {
        this.audio.pause();
        this.isPlaying = false;
        document.getElementById('musicToggle').textContent = '🎵';
        
        if (this.trackStartTime > 0) {
            const duration = Math.floor((Date.now() - this.trackStartTime) / 1000);
            this.completeSACMTracking(this.currentTrackName, duration);
        }
    }

    nextTrack() {
        this.sendMusicCommand('next');
    }

    prevTrack() {
        // En modo sincronizado, no permitimos prev para mantener consistencia
        console.log('⚠️ Prev track no disponible en modo sincronizado');
    }

    // 🎯 ENVIAR COMANDOS DE MÚSICA AL SERVIDOR
    sendMusicCommand(command) {
        if (this.gridyClient.socket?.readyState === WebSocket.OPEN) {
            this.gridyClient.socket.send(JSON.stringify({
                type: 'music_command',
                command: command
            }));
        } else {
            console.error('❌ WebSocket no conectado para comando de música');
        }
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