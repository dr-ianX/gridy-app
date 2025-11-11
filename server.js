// 🎯 DEBUG DE EMERGENCIA - AGREGAR AL PRINCIPIO
console.log('=== 🚨 INICIANDO SERVIDOR DE EMERGENCIA ===');
console.log('🔍 PORT:', process.env.PORT);
console.log('🔍 GOOGLE_SERVICE_EMAIL:', process.env.GOOGLE_SERVICE_EMAIL ? '✅ CONFIGURADO' : '❌ FALTANTE');
console.log('🔍 GOOGLE_SERVICE_EMAIL_2:', process.env.GOOGLE_SERVICE_EMAIL_2 ? '✅ CONFIGURADO' : '❌ FALTANTE');
console.log('🔍 SHEET_ID:', process.env.SHEET_ID ? '✅ CONFIGURADO' : '❌ FALTANTE');
console.log('🔍 SHEET_ID_2:', process.env.SHEET_ID_2 ? '✅ CONFIGURADO' : '❌ FALTANTE');
console.log('🔍 GOOGLE_PRIVATE_KEY:', process.env.GOOGLE_PRIVATE_KEY ? '✅ CONFIGURADO' : '❌ FALTANTE');
console.log('🔍 GOOGLE_PRIVATE_KEY_2:', process.env.GOOGLE_PRIVATE_KEY_2 ? '✅ CONFIGURADO' : '❌ FALTANTE');

// 🎯 CATCH ALL PARA ERRORES NO CAPTURADOS
process.on('uncaughtException', (error) => {
    console.error('💥 ERROR CRÍTICO NO CAPTURADO:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 PROMESA RECHAZADA:', reason);
});

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');

// ============================================================================
// 🆕 CLASE PARA PERSISTENCIA DE POSTS IMPORTANTES
// ============================================================================
class PostsPersistence {
    constructor() {
        this.doc = null;
        this.sheet = null;
        this.initialized = false;
        this.lastBackup = null;
    }

    async init() {
        try {
            // 🎯 USAR NUEVAS VARIABLES PARA POSTS
            if (!process.env.GOOGLE_SERVICE_EMAIL_2 || !process.env.GOOGLE_PRIVATE_KEY_2 || !process.env.SHEET_ID_2) {
                console.log('⚠️  Google Sheets para posts no configurado - usando solo memoria');
                return;
            }

            this.doc = new GoogleSpreadsheet(process.env.SHEET_ID_2);
            
            await this.doc.useServiceAccountAuth({
                client_email: process.env.GOOGLE_SERVICE_EMAIL_2,
                private_key: process.env.GOOGLE_PRIVATE_KEY_2.replace(/\\n/g, '\n'),
            });

            await this.doc.loadInfo();
            this.sheet = this.doc.sheetsByIndex[0];
            this.initialized = true;
            
            console.log('✅ Google Sheets conectado para persistencia de posts');
        } catch (error) {
            console.error('❌ Error inicializando Google Sheets para posts:', error.message);
        }
    }

    // 🆕 IDENTIFICAR POSTS IMPORTANTES
    isImportantPost(post) {
        return post.content.includes('🤝 COLABORACIÓN:') ||
               post.content.includes('🔍 BUSCO:') || 
               post.content.includes('💿 PROYECTO:') ||
               post.content.includes('📅 EVENTO:');
    }

    // 🆕 GUARDAR POSTS IMPORTANTES
    async saveImportantPosts(posts) {
        if (!this.initialized || !this.sheet) {
            console.log('⚠️  Persistencia no inicializada - omitiendo backup');
            return;
        }

        try {
            const importantPosts = posts.filter(post => this.isImportantPost(post));
            
            if (importantPosts.length === 0) {
                console.log('ℹ️  No hay posts importantes para guardar');
                return;
            }

            console.log(`💾 Iniciando backup de ${importantPosts.length} posts importantes...`);

            // Obtener filas existentes
            const existingRows = await this.sheet.getRows();
            const existingIds = new Set(existingRows.map(row => row.id));

            // Preparar datos para guardar
            const postsToSave = importantPosts.filter(post => !existingIds.has(post.id));

            if (postsToSave.length === 0) {
                console.log('ℹ️  No hay posts nuevos para guardar');
                return;
            }

            // Guardar nuevos posts
            for (const post of postsToSave) {
                await this.sheet.addRow({
                    id: post.id,
                    user: post.user,
                    content: post.content,
                    postType: post.postType || 'composer',
                    interactions: post.interactions || 0,
                    timestamp: new Date(post.timestamp).toISOString(),
                    status: 'active',
                    expiresAt: this.calculateExpiration(post)
                });
                console.log(`✅ Guardado post: ${post.id} - ${post.user}`);
            }

            this.lastBackup = new Date();
            console.log(`🎉 Backup completado: ${postsToSave.length} posts guardados`);

        } catch (error) {
            console.error('❌ Error en backup de posts:', error.message);
        }
    }

    // 🆕 CARGAR POSTS AL INICIAR EL SERVIDOR
    async loadPosts() {
        if (!this.initialized || !this.sheet) {
            console.log('⚠️  Persistencia no inicializada - cargando posts vacíos');
            return [];
        }

        try {
            const rows = await this.sheet.getRows();
            const now = new Date();
            
            const posts = rows
                .filter(row => {
                    // Filtrar posts expirados
                    const expiresAt = new Date(row.expiresAt);
                    return expiresAt > now && row.status === 'active';
                })
                .map(row => ({
                    id: row.id,
                    user: row.user,
                    content: row.content,
                    postType: row.postType || 'composer',
                    interactions: parseInt(row.interactions) || 0,
                    timestamp: new Date(row.timestamp).getTime(),
                    comments: [],
                    status: row.status || 'active',
                    isPersistent: true // 🆕 Marcar como post persistente
                }));

            console.log(`📂 Cargados ${posts.length} posts persistentes desde Google Sheets`);
            return posts;
        } catch (error) {
            console.error('❌ Error cargando posts:', error);
            return [];
        }
    }

    calculateExpiration(post) {
        const now = new Date();
        if (post.content.includes('🤝 COLABORACIÓN:') || post.content.includes('🔍 BUSCO:')) {
            return new Date(now.setDate(now.getDate() + 30)).toISOString(); // 30 días
        } else if (post.content.includes('💿 PROYECTO:')) {
            return new Date(now.setDate(now.getDate() + 60)).toISOString(); // 60 días
        } else if (post.content.includes('📅 EVENTO:')) {
            const eventDate = this.extractEventDate(post.content);
            return eventDate ? eventDate.toISOString() : new Date(now.setDate(now.getDate() + 7)).toISOString(); // 7 días por defecto
        }
        return new Date(now.setDate(now.getDate() + 7)).toISOString(); // 7 días para otros importantes
    }

    extractEventDate(content) {
        // Intenta extraer fecha del contenido del evento
        const dateMatch = content.match(/\d{1,2}\/\d{1,2}\/\d{4}/) || 
                         content.match(/\d{1,2}-\d{1,2}-\d{4}/);
        if (dateMatch) {
            return new Date(dateMatch[0]);
        }
        return null;
    }

    // 🆕 MARCAR POST COMO RESUELTO
    async markAsResolved(postId) {
        if (!this.initialized || !this.sheet) return false;

        try {
            const rows = await this.sheet.getRows();
            const row = rows.find(r => r.id === postId);
            if (row) {
                row.status = 'resolved';
                await row.save();
                console.log(`✅ Post ${postId} marcado como resuelto`);
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ Error marcando post como resuelto:', error);
            return false;
        }
    }
}

// ============================================================================
// 🎵 CLASE SACM TRACKER (EXISTENTE - SIN MODIFICACIONES)
// ============================================================================
class SACMTracker {
    constructor() {
        this.doc = null;
        this.sheet = null;
        this.temporaryPlays = [];
        this.initialized = false;
    }

    async init() {
        try {
            if (!process.env.GOOGLE_SERVICE_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.SHEET_ID) {
                console.log('⚠️  Google Sheets SACM no configurado - usando memoria temporal');
                return;
            }

            this.doc = new GoogleSpreadsheet(process.env.SHEET_ID);
            
            await this.doc.useServiceAccountAuth({
                client_email: process.env.GOOGLE_SERVICE_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            });

            await this.doc.loadInfo();
            this.sheet = this.doc.sheetsByIndex[0];
            this.initialized = true;
            
            console.log('✅ Google Sheets conectado para SACM tracking');
        } catch (error) {
            console.error('❌ Error inicializando Google Sheets SACM:', error.message);
        }
    }

    async trackPlay(songId, userId, duration) {
        const playData = {
            timestamp: new Date().toISOString(),
            song_id: songId,
            user_hash: userId ? this.hashCode(userId) : 'anonymous',
            duration_seconds: duration,
            country: 'MX'
        };

        console.log('🎵 SACM Play:', playData);

        if (this.initialized && this.sheet) {
            try {
                await this.sheet.addRow(playData);
                console.log('✅ Play guardado en Google Sheets SACM');
                return;
            } catch (error) {
                console.error('❌ Error guardando en Sheets SACM:', error.message);
            }
        }

        this.temporaryPlays.push(playData);
        console.log('📦 Play guardado en memoria temporal SACM');
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16);
    }

    async generateReport() {
        let allPlays = [...this.temporaryPlays];

        if (this.initialized && this.sheet) {
            try {
                const rows = await this.sheet.getRows();
                const sheetPlays = rows.map(row => ({
                    timestamp: row.timestamp,
                    song_id: row.song_id,
                    user_hash: row.user_hash,
                    duration_seconds: row.duration_seconds,
                    country: row.country,
                    isrc: row.isrc,
                    registro_indautor: row.registro_indautor,
                    registro_rACM: row.registro_sacm
                }));
                allPlays = [...sheetPlays, ...allPlays];
            } catch (error) {
                console.error('❌ Error obteniendo datos de Sheets SACM:', error);
            }
        }

        const csvHeader = 'timestamp,song_id,user_hash,duration_seconds,country,isrc,registro_indautor,registro_sacm\n';
        const csvRows = allPlays.map(play => 
            `"${play.timestamp}","${play.song_id}","${play.user_hash}",${play.duration_seconds},"${play.country}"`
        ).join('\n');
        
        return csvHeader + csvRows;
    }
}

// ============================================================================
// 🎵 SISTEMA DE PLAYLIST DIARIA (SOLO PARA GENERAR LISTA, NO CONTROL)
// ============================================================================
class DailyPlaylist {
    constructor() {
        this.tracks = [
            { 
                name: "🎵 4 - dR.iAn", 
                file: "/Music/track1.mp3",
                image: "/Music/track1.jpg"
            },
            { 
                name: "🎵 Me Reconozco - Rodrigo Escamilla", 
                file: "/Music/mereconozco.mp3",
                image: "/Music/mereconozco.jpg"
            },
            {   
                name: "🎵 Toda La Noche - Mariu", 
                file: "/Music/mariutodalanoche.mp3",
                image: "/Music/mariutodalanoche.jpg"
            },
            {   
                name: "🎵 A Contratiempo - Demian Cobo ft. Daniel Tejeda", 
                file: "/Music/acontratiempo.mp3",
                image: "/Music/acontratiempo.jpg"
            }
        ];
        this.currentPlaylist = this.generateDailyPlaylist();
    }

    // 🎯 Generar playlist aleatoria diaria
    generateDailyPlaylist() {
        const today = new Date().toDateString();
        const seed = today.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        
        const playlist = [...this.tracks];
        for (let i = playlist.length - 1; i > 0; i--) {
            const j = Math.floor((seed + i) % (i + 1));
            [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
        }
        
        console.log('🎵 Playlist diaria generada:', playlist.map(t => t.name));
        return playlist;
    }

    getDailyPlaylist() {
        // Regenerar playlist si es un nuevo día
        const today = new Date().toDateString();
        const lastGenerated = this.currentPlaylist[0] ? new Date().toDateString() : null;
        
        if (!lastGenerated || lastGenerated !== today) {
            this.currentPlaylist = this.generateDailyPlaylist();
        }
        
        return this.currentPlaylist;
    }
}

// ============================================================================
// 🚀 INICIALIZACIÓN
// ============================================================================

// Inicializar sistemas
const sacmTracker = new SACMTracker();
sacmTracker.init();

const postsPersistence = new PostsPersistence();
postsPersistence.init();

const dailyPlaylist = new DailyPlaylist(); // 🎵 Solo playlist, sin control de reproducción

// Configuración de tipos MIME
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
};

// Crear servidor HTTP
const server = http.createServer((req, res) => {
    console.log('📥 Solicitud recibida:', req.url);
    
    // Configurar CORS para permitir todas las solicitudes
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // 🎯 ENDPOINT PARA DESCARGAR REPORTES SACM
    if (req.url === '/sacm-report' && req.method === 'GET') {
        sacmTracker.generateReport().then(csv => {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="sacm-report.csv"');
            res.end(csv);
        }).catch(error => {
            res.writeHead(500);
            res.end('Error generando reporte: ' + error.message);
        });
        return;
    }

    // 🆕 ENDPOINT PARA MARCAR POST COMO RESUELTO
    if (req.url.startsWith('/resolve-post/') && req.method === 'POST') {
        const postId = req.url.split('/')[2];
        postsPersistence.markAsResolved(postId).then(success => {
            if (success) {
                // También eliminar de memoria
                state.posts = state.posts.filter(p => p.id !== postId);
                broadcast({
                    type: 'post_removed',
                    postId: postId
                });
                res.writeHead(200);
                res.end('Post marcado como resuelto');
            } else {
                res.writeHead(404);
                res.end('Post no encontrado');
            }
        }).catch(error => {
            res.writeHead(500);
            res.end('Error: ' + error.message);
        });
        return;
    }
    
    // Manejar rutas de archivos estáticos
    let filePath = req.url;
    
    if (filePath === '/') {
        filePath = '/index.html';
    }
    
    const fullPath = path.join(__dirname, 'public', filePath);
    const extname = String(path.extname(fullPath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    console.log('🔍 Buscando archivo:', fullPath);
    
    fs.readFile(fullPath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                console.log('❌ Archivo no encontrado:', fullPath);
                res.writeHead(404);
                res.end('Archivo no encontrado');
            } else {
                console.error('💥 Error del servidor:', error);
                res.writeHead(500);
                res.end(`Error del servidor: ${error.code}`);
            }
        } else {
            console.log('✅ Sirviendo archivo:', filePath);
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Content-Length': content.length,
                'Cache-Control': 'public, max-age=3600'
            });
            res.end(content);
        }
    });
});

// ============================================================================
// 💾 ALMACENAMIENTO EN MEMORIA Y WEBSOCKETS
// ============================================================================

// WebSocket Server
const wss = new WebSocket.Server({ server });

// Almacenamiento en memoria
const state = {
    posts: [],
    activeUsers: new Set()
};

// 🆕 CARGAR POSTS PERSISTENTES AL INICIAR
async function initializeServer() {
    try {
        const persistentPosts = await postsPersistence.loadPosts();
        state.posts = [...persistentPosts, ...state.posts];
        console.log(`🎯 Servidor inicializado con ${state.posts.length} posts (${persistentPosts.length} persistentes)`);
    } catch (error) {
        console.error('❌ Error inicializando servidor:', error);
    }
}

initializeServer();

// 🆕 BACKUP AUTOMÁTICO CADA 3 MINUTOS
setInterval(() => {
    if (postsPersistence.initialized && state.posts.length > 0) {
        postsPersistence.saveImportantPosts(state.posts);
    }
}, 3 * 60 * 1000); // 3 minutos

// Limpiar posts viejos (solo los no importantes)
function cleanupOldPosts() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    const initialCount = state.posts.length;
    
    state.posts = state.posts.filter(post => {
        // 🆕 Mantener posts importantes y persistentes
        if (post.isPersistent || postsPersistence.isImportantPost(post)) {
            return true;
        }
        
        // Posts normales: eliminar después de 24 horas
        return (now - post.timestamp) < oneDay;
    });
    
    if (initialCount !== state.posts.length) {
        console.log(`🧹 Limpieza: ${initialCount} → ${state.posts.length} posts`);
    }
}

setInterval(cleanupOldPosts, 60 * 60 * 1000); // Cada hora

// 🎵 MEJORADO: Manejar nueva publicación con sistema de tipos
function handleNewPost(socket, data) {
    // Validar datos
    if (!data.user || !data.content) {
        socket.send(JSON.stringify({
            type: 'error',
            message: 'Datos de publicación incompletos'
        }));
        return;
    }

    // 🎯 SOLO aplicar límite a posts generales, no a posts de compositores
    const isComposerPost = data.postType === 'composer' || 
                          data.content.includes('🎵 LETRAS:') ||
                          data.content.includes('🎸 ACORDES:') ||
                          data.content.includes('🤝 COLABORACIÓN:') ||
                          data.content.includes('📅 EVENTO:') ||
                          data.content.includes('💿 PROYECTO:') ||
                          data.content.includes('🔍 BUSCO:');

    if (!isComposerPost) {
        // Verificar límite de 1 publicación por día por usuario para posts generales
        const today = new Date().toDateString();
        const userPostedToday = state.posts.some(post => 
            post.user === data.user && 
            new Date(post.timestamp).toDateString() === today &&
            // Solo contar posts generales, no de compositores
            !(post.content.includes('🎵 LETRAS:') ||
              post.content.includes('🎸 ACORDES:') ||
              post.content.includes('🤝 COLABORACIÓN:') ||
              post.content.includes('📅 EVENTO:') ||
              post.content.includes('💿 PROYECTO:') ||
              post.content.includes('🔍 BUSCO:'))
        );
        
        if (userPostedToday) {
            socket.send(JSON.stringify({
                type: 'error',
                message: '¡Solo 1 publicación general por día! 🌅\nUsa las herramientas de compositor para compartir letras, acordes, eventos y más sin límites 🎵'
            }));
            return;
        }
    }

    // Crear nuevo post
    const newPost = {
        id: Date.now().toString(),
        user: data.user,
        content: data.content.substring(0, 500),
        interactions: 0,
        comments: [],
        timestamp: Date.now(),
        postType: isComposerPost ? 'composer' : 'general'
    };
    
    console.log('📝 NUEVO POST:', {
        user: newPost.user,
        type: newPost.postType,
        content: newPost.content.substring(0, 80) + '...'
    });
    
    // Agregar a la lista de posts
    state.posts.unshift(newPost);
    
    // 🆕 GUARDAR INMEDIATAMENTE SI ES IMPORTANTE
    if (postsPersistence.isImportantPost(newPost)) {
        setTimeout(() => {
            postsPersistence.saveImportantPosts([newPost]);
        }, 1000);
    }
    
    // Limitar a 200 posts máximo (solo posts en memoria)
    if (state.posts.length > 200) {
        state.posts = state.posts.slice(0, 200);
    }
    
    // Broadcast a todos los clientes
    broadcast({
        type: 'new_post',
        post: newPost
    });
}

function handleNewComment(socket, data) {
    // Validar datos
    if (!data.postId || !data.user || !data.text) {
        socket.send(JSON.stringify({
            type: 'error',
            message: 'Datos de comentario incompletos'
        }));
        return;
    }

    console.log('🔍 Buscando post ID:', data.postId);
    console.log('   Total de posts:', state.posts.length);
    
    // Buscar el post
    const post = state.posts.find(p => p.id == data.postId);
    
    if (!post) {
        console.log('❌ Post no encontrado. IDs disponibles:', 
            state.posts.slice(0, 5).map(p => p.id));
        socket.send(JSON.stringify({
            type: 'error', 
            message: `El post no existe`
        }));
        return;
    }

    // Crear nuevo comentario
    const newComment = {
        user: data.user,
        text: data.text.substring(0, 300),
        timestamp: Date.now()
    };
    
    // Agregar comentario al post
    post.comments.push(newComment);
    post.interactions = (post.interactions || 0) + 1;
    
    console.log(`💬 ${data.user} comentó en post ${data.postId}: "${data.text.substring(0, 50)}..."`);
    
    // Broadcast a todos los clientes
    broadcast({
        type: 'comment_added',
        postId: data.postId,
        comment: newComment,
        newInteractions: post.interactions
    });
}

// Función para enviar mensaje a todos los clientes conectados
function broadcast(message) {
    if (wss.clients.size === 0) return;
    
    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
            sentCount++;
        }
    });
    
    console.log(`📤 Broadcast enviado a ${sentCount} clientes:`, message.type);
}

function handleMessage(socket, data) {
    switch(data.type) {
        case 'new_post':
            handleNewPost(socket, data);
            break;
        case 'new_comment':
            handleNewComment(socket, data);
            break;
        case 'heartbeat':
            socket.send(JSON.stringify({ type: 'heartbeat_ack' }));
            break;
        // 🎯 Eventos de música para SACM
        case 'music_play_start':
            console.log('🎵 Inicio de reproducción:', data.songId, 'por', data.userId);
            break;
        case 'music_play_complete':
            console.log('🎵 Reproducción completada:', data.songId, 'duración:', data.duration);
            sacmTracker.trackPlay(data.songId, data.userId, data.duration);
            break;
    }
}

// Manejar conexiones WebSocket
wss.on('connection', (socket, req) => {
    console.log('👤 Nueva conexión WebSocket');
    
    // Enviar estado actual
    socket.send(JSON.stringify({
        type: 'welcome',
        message: 'Bienvenido a MESH TCSACM 🌟',
        posts: state.posts.slice(0, 200),
        dailyPlaylist: dailyPlaylist.getDailyPlaylist() // 🆕 Solo enviar playlist, NO control de reproducción
    }));

    socket.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(socket, data);
        } catch (error) {
            console.error('❌ Error procesando mensaje:', error);
            socket.send(JSON.stringify({
                type: 'error',
                message: 'Mensaje inválido'
            }));
        }
    });

    socket.on('close', () => {
        console.log('👋 Usuario desconectado');
    });

    socket.on('error', (error) => {
        console.error('💥 Error en conexión:', error);
    });
});

// Manejar cierre graceful del servidor
process.on('SIGINT', () => {
    console.log('🛑 Cerrando servidor...');
    // 🆕 HACER BACKUP FINAL ANTES DE CERRAR
    if (postsPersistence.initialized) {
        postsPersistence.saveImportantPosts(state.posts);
    }
    wss.close(() => {
        console.log('✅ WebSocket server cerrado');
        server.close(() => {
            console.log('✅ HTTP server cerrado');
            process.exit(0);
        });
    });
});

// Iniciar servidor
const PORT = process.env.PORT || 8000;

server.on('error', (error) => {
    console.error('💥 ERROR del servidor:', error);
    if (error.code === 'EADDRINUSE') {
        console.log(`❌ Puerto ${PORT} ya en uso`);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor MESH ejecutándose en puerto ${PORT}`);
    console.log('🎵 Sistema de compositores ACTIVADO - Posts ilimitados para contenido musical');
    console.log('💾 Sistema de persistencia ACTIVADO - Posts importantes se guardan en Google Sheets');
    console.log('🎵 Playlist diaria ACTIVADA - Lista aleatoria compartida, control individual');
    console.log('📊 Backup automático cada 3 minutos');
    console.log('🔧 Características:');
    console.log('   - Posts generales: 1 por día, duran 24h');
    console.log('   - Posts importantes: Persisten hasta resolución');
    console.log('   - Colaboraciones: 30 días');
    console.log('   - Proyectos: 60 días');
    console.log('   - Eventos: Hasta la fecha del evento');
    console.log('   - Música: Playlist aleatoria diaria, control individual por usuario');
});

process.on('uncaughtException', (error) => {
    console.error('💥 UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});