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
    
    // Manejar rutas específicas
    if (req.url === '/') {
        serveFile(res, '/index.html');
    } else if (req.url.startsWith('/music/')) {
        serveMusicFile(res, req.url);
    } else {
        serveFile(res, req.url);
    }
});

function serveFile(res, filePath) {
    const fullPath = path.join(__dirname, 'public', filePath);
    const extname = String(path.extname(fullPath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(fullPath, (error, content) => {
        if (error) {
            console.log('❌ Archivo no encontrado:', fullPath);
            res.writeHead(404);
            res.end('Archivo no encontrado');
        } else {
            console.log('✅ Sirviendo archivo:', filePath);
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content, 'utf-8');
        }
    });
}

function serveMusicFile(res, musicPath) {
    const fullPath = path.join(__dirname, 'public', musicPath);
    console.log('🎵 Intentando servir música:', fullPath);
    
    fs.readFile(fullPath, (error, content) => {
        if (error) {
            console.log('❌ Archivo de música no encontrado:', fullPath);
            res.writeHead(404);
            res.end('Archivo de música no encontrado');
        } else {
            console.log('✅🎵 Música servida correctamente:', musicPath);
            res.writeHead(200, { 
                'Content-Type': 'audio/mpeg',
                'Content-Length': content.length,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content);
        }
    });
}

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
        posts: state.posts.slice(0, 100)
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

function handleNewPost(socket, data) {
    if (!data.user || !data.content) {
        socket.send(JSON.stringify({
            type: 'error',
            message: 'Datos incompletos'
        }));
        return;
    }

    // Límite de 1 post por día
    const today = new Date().toDateString();
    const userPostedToday = state.posts.some(post => 
        post.user === data.user && 
        new Date(post.timestamp).toDateString() === today
    );
    
    if (userPostedToday) {
        socket.send(JSON.stringify({
            type: 'error',
            message: '¡Solo 1 publicación por día! 🌅'
        }));
        return;
    }

    const newPost = {
        id: Date.now().toString(),
        user: data.user,
        content: data.content.substring(0, 280),
        interactions: 0,
        comments: [],
        timestamp: Date.now()
    };
    
    console.log('📝 Nuevo post de:', data.user);
    state.posts.unshift(newPost);
    
    // Limitar a 500 posts máximo
    if (state.posts.length > 500) {
        state.posts = state.posts.slice(0, 500);
    }
    
    broadcast({
        type: 'new_post',
        post: newPost
    });
}

function handleNewComment(socket, data) {
    if (!data.postId || !data.user || !data.text) {
        socket.send(JSON.stringify({
            type: 'error',
            message: 'Datos de comentario incompletos'
        }));
        return;
    }

    const post = state.posts.find(p => p.id == data.postId);
    
    if (!post) {
        socket.send(JSON.stringify({
            type: 'error', 
            message: 'El post no existe'
        }));
        return;
    }

    const newComment = {
        user: data.user,
        text: data.text.substring(0, 200),
        timestamp: Date.now()
    };
    
    post.comments.push(newComment);
    post.interactions = (post.interactions || 0) + 1;
    
    console.log(`💬 ${data.user} comentó en post`);
    
    broadcast({
        type: 'comment_added',
        postId: data.postId,
        comment: newComment,
        newInteractions: post.interactions
    });
}

function broadcast(message) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
            sentCount++;
        }
    });
    
    console.log(`📤 Mensaje enviado a ${sentCount} clientes:`, message.type);
}

// Iniciar servidor
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor MESH ejecutándose en puerto ${PORT}`);
    console.log('🎵 Servidor de archivos de música LISTO');
    console.log('💾 Almacenamiento en memoria activo');
});