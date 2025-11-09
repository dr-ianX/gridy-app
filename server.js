const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

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
    
    // Manejar rutas
    let filePath = req.url;
    
    if (filePath === '/') {
        filePath = '/index.html';
    }
    
    // Construir la ruta completa
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

// Manejar conexiones WebSocket
wss.on('connection', (socket, req) => {
    console.log('👤 Nueva conexión WebSocket');
    
    // Enviar estado actual
    socket.send(JSON.stringify({
        type: 'welcome',
        message: 'Bienvenido a MESH TCSACM 🌟',
        posts: state.posts.slice(0, 200) // Aumentado a 200 posts
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
    }
}

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
        content: data.content.substring(0, 500), // Aumentado a 500 caracteres
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
    
    // Limitar a 200 posts máximo (aumentado para más contenido)
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
    
    // Buscar el post (usando comparación flexible por si hay diferencias de tipo)
    const post = state.posts.find(p => p.id == data.postId);
    
    if (!post) {
        console.log('❌ Post no encontrado. IDs disponibles:', 
            state.posts.slice(0, 5).map(p => p.id)); // Mostrar solo primeros 5
        socket.send(JSON.stringify({
            type: 'error', 
            message: `El post no existe`
        }));
        return;
    }

    // Crear nuevo comentario
    const newComment = {
        user: data.user,
        text: data.text.substring(0, 300), // Aumentado a 300 caracteres
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
server.listen(PORT, () => {
    console.log(`🚀 Servidor MESH ejecutándose en puerto ${PORT}`);
    console.log('🎵 Sistema de compositores ACTIVADO - Posts ilimitados para contenido musical');
    console.log('📁 Servidor de archivos estáticos LISTO');
    console.log('💾 Almacenamiento en memoria activo (200 posts máximo)');
    console.log('🌟 Características:');
    console.log('   - Posts generales: 1 por día');
    console.log('   - Posts de compositores: ILIMITADOS');
    console.log('   - Letras, acordes, eventos, colaboraciones, proyectos');
    console.log('   - Sistema de badges y efectos visuales');
});