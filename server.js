// 🎯 DEBUG DE EMERGENCIA - AGREGAR AL PRINCIPIO
console.log('=== 🚨 INICIANDO SERVIDOR DE EMERGENCIA ===');
console.log('🔍 PORT:', process.env.PORT);
console.log('🔍 GOOGLE_SERVICE_EMAIL:', process.env.GOOGLE_SERVICE_EMAIL ? '✅ CONFIGURADO' : '❌ FALTANTE');
console.log('🔍 SHEET_ID:', process.env.SHEET_ID ? '✅ CONFIGURADO' : '❌ FALTANTE');
console.log('🔍 GOOGLE_PRIVATE_KEY:', process.env.GOOGLE_PRIVATE_KEY ? '✅ CONFIGURADO' : '❌ FALTANTE');

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
                console.log('⚠️  Google Sheets no configurado - usando memoria temporal');
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
            console.error('❌ Error inicializando Google Sheets:', error.message);
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

        // Intentar guardar en Google Sheets
        if (this.initialized && this.sheet) {
            try {
                await this.sheet.addRow(playData);
                console.log('✅ Play guardado en Google Sheets');
                return;
            } catch (error) {
                console.error('❌ Error guardando en Sheets:', error.message);
            }
        }

        // Fallback: memoria temporal
        this.temporaryPlays.push(playData);
        console.log('📦 Play guardado en memoria temporal');
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
                    country: row.country
                }));
                allPlays = [...sheetPlays, ...allPlays];
            } catch (error) {
                console.error('❌ Error obteniendo datos de Sheets:', error);
            }
        }

        const csvHeader = 'timestamp,song_id,user_hash,duration_seconds,country\n';
        const csvRows = allPlays.map(play => 
            `"${play.timestamp}","${play.song_id}","${play.user_hash}",${play.duration_seconds},"${play.country}"`
        ).join('\n');
        
        return csvHeader + csvRows;
    }
}

// Inicializar tracker
const sacmTracker = new SACMTracker();
sacmTracker.init();

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
    
    // 🎯 NUEVO ENDPOINT PARA DESCARGAR REPORTES
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

// WebSocket Server
const wss = new WebSocket.Server({ server });

// Almacenamiento en memoria
const state = {
    posts: [],
    activeUsers: new Set(),
};

// Limpiar posts viejos
function cleanupOldPosts() {
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    
    const initialCount = state.posts.length;
    state.posts = state.posts.filter(post => (now - post.timestamp) < oneWeek);
    
    if (initialCount !== state.posts.length) {
        console.log(`🧹 Limpieza: ${initialCount} → ${state.posts.length} posts`);
    }
}

setInterval(cleanupOldPosts, 60 * 60 * 1000);

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
    
    // Limitar a 200 posts máximo
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
        // 🎯 NUEVO: Eventos de música para SACM
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
        posts: state.posts.slice(0, 200)
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

// 🎯 AGREGAR ESTA VERIFICACIÓN DE ERRORES ANTES DE LISTEN
server.on('error', (error) => {
    console.error('💥 ERROR del servidor:', error);
    if (error.code === 'EADDRINUSE') {
        console.log(`❌ Puerto ${PORT} ya en uso`);
    }
});

server.listen(PORT, '0.0.0.0', () => {  // ← 🎯 AÑADIR '0.0.0.0'
    console.log(`🚀 Servidor MESH ejecutándose en puerto ${PORT}`);
    console.log('🎵 Sistema de compositores ACTIVADO - Posts ilimitados para contenido musical');
    console.log('📁 Servidor de archivos estáticos LISTO');
    console.log('💾 Almacenamiento en memoria activo (200 posts máximo)');
    console.log('✅ SACM Tracking: ACTIVADO');
    console.log('📊 Endpoint reportes: /sacm-report');
    console.log('🌟 Características:');
    console.log('   - Posts generales: 1 por día');
    console.log('   - Posts de compositores: ILIMITADOS');
    console.log('   - Letras, acordes, eventos, colaboraciones, proyectos');
    console.log('   - Sistema de badges y efectos visuales');
});

// 🎯 AGREGAR ESTO PARA DEBUG
process.on('uncaughtException', (error) => {
    console.error('💥 UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});