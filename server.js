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
    '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
};

// Crear servidor HTTP
const server = http.createServer((req, res) => {
    // 🎵 SERVIR ARCHIVOS ESTÁTICOS CORRECTAMENTE
    let filePath = req.url === '/' ? '/index.html' : req.url;
    
    // Construir la ruta completa del archivo
    const fullPath = path.join(__dirname, 'public', filePath);
    
    // Obtener extensión del archivo
    const extname = String(path.extname(fullPath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    // Verificar si el archivo existe
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
            // 🚨 ELIMINAR CSP COMPLETAMENTE - SOLO CONTENT TYPE
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600' // Cache de 1 hora
            });
            res.end(content, 'utf-8');
        }
    });
});

// Inicializar WebSocket server
const wss = new WebSocket.Server({ 
    server,
    perMessageDeflate: false
});

// Almacenamiento TEMPORAL en memoria (se pierde al reiniciar)
const state = {
    posts: [],
    activeUsers: new Set(),
};

// Limpiar posts viejos automáticamente
function cleanupOldPosts() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    
    const initialCount = state.posts.length;
    state.posts = state.posts.filter(post => {
        return (now - post.timestamp) < oneWeek; // Mantener 1 semana
    });
    
    if (initialCount !== state.posts.length) {
        console.log(`🧹 Limpieza: ${initialCount} → ${state.posts.length} posts`);
    }
}

// Limpiar cada hora
setInterval(cleanupOldPosts, 60 * 60 * 1000);

// Manejar conexiones WebSocket
wss.on('connection', (socket, req) => {
    const clientIP = req.socket.remoteAddress;
    console.log('👤 Nueva conexión desde:', clientIP);
    
    // Enviar estado actual al nuevo usuario
    const welcomeMessage = {
        type: 'welcome',
        message: 'Bienvenido a MESH TCSACM 🌟',
        posts: state.posts.slice(0, 100) // Solo últimos 100 posts
    };
    
    socket.send(JSON.stringify(welcomeMessage));

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

    socket.on('close', (code, reason) => {
        console.log('👋 Usuario desconectado:', clientIP, `Código: ${code}`);
    });

    socket.on('error', (error) => {
        console.error('💥 Error en conexión:', clientIP, error);
    });
});

// Manejar diferentes tipos de mensajes
function handleMessage(socket, data) {
    switch(data.type) {
        case 'new_post':
            handleNewPost(socket, data);
            break;
            
        case 'new_comment':
            handleNewComment(socket, data);
            break;
            
        case 'heartbeat':
            // Mantener conexión viva
            socket.send(JSON.stringify({ type: 'heartbeat_ack' }));
            break;
            
        default:
            console.log('❓ Tipo de mensaje desconocido:', data.type);
            socket.send(JSON.stringify({
                type: 'error',
                message: 'Tipo de mensaje no reconocido'
            }));
    }
}

// Manejar nueva publicación
function handleNewPost(socket, data) {
    // Validar datos
    if (!data.user || !data.content) {
        socket.send(JSON.stringify({
            type: 'error',
            message: 'Datos de publicación incompletos'
        }));
        return;
    }

    // Verificar límite de 1 publicación por día por usuario
    const today = new Date().toDateString();
    const userPostedToday = state.posts.some(post => 
        post.user === data.user && 
        new Date(post.timestamp).toDateString() === today
    );
    
    if (userPostedToday) {
        socket.send(JSON.stringify({
            type: 'error',
            message: '¡Solo 1 publicación por día! Vuelve mañana 🌅'
        }));
        return;
    }

    // Crear nuevo post
    const newPost = {
        id: Date.now().toString(), // ID único basado en timestamp
        user: data.user,
        content: data.content.substring(0, 280), // Limitar a 280 caracteres
        interactions: 0,
        comments: [],
        timestamp: Date.now()
    };
    
    console.log('📝 NUEVO POST:', {
        user: newPost.user,
        content: newPost.content.substring(0, 50) + '...',
        id: newPost.id
    });
    
    // Agregar a la lista de posts
    state.posts.unshift(newPost);
    
    // Limitar a 500 posts máximo
    if (state.posts.length > 500) {
        state.posts = state.posts.slice(0, 500);
    }
    
    // Broadcast a todos los clientes
    broadcast({
        type: 'new_post',
        post: newPost
    });
}

// Manejar nuevo comentario
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
        text: data.text.substring(0, 200), // Limitar a 200 caracteres
        timestamp: Date.now()
    };
    
    // Agregar comentario al post
    post.comments.push(newComment);
    post.interactions = (post.interactions || 0) + 1;
    
    console.log(`💬 ${data.user} comentó en post ${data.postId}: "${data.text.substring(0, 30)}..."`);
    
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
    console.log(`🚀 Servidor MESH ejecutándose en http://localhost:${PORT}`);
    console.log('💾 Almacenamiento en memoria - Los datos se pierden al reiniciar');
    console.log('🌐 WebSockets activos para comunicación en tiempo real');
    console.log('🎵 Servidor de archivos estáticos listo');
    console.log('📝 Posts máximos: 500 | Límite: 1 post por usuario por día');
});