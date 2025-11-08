const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
// Agregar esto al INICIO del server.js - después de los requires
// Middleware para eliminar CSP de Render
const removeCSP = (req, res, next) => {
    // Remover cabeceras CSP que Render pueda estar agregando
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('X-Content-Security-Policy');
    res.removeHeader('X-WebKit-CSP');
    next();
};

const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, 'public', filePath);
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if(error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('Archivo no encontrado');
            } else {
                res.writeHead(500);
                res.end('Error del servidor: '+error.code);
            }
        } else {
            // 🛡️ CSP MUY PERMISIVO - ELIMINAR BLOQUEOS
            res.writeHead(200, { 
                'Content-Type': contentType
                // ⚠️ NO MANDAR CSP - Render ya tiene uno por defecto
            });
            res.end(content, 'utf-8');
        }
    });
});

// Inicializar WebSocket server
const wss = new WebSocket.Server({ server });

// Almacenamiento TEMPORAL en memoria (se pierde al reiniciar)
const state = {
    posts: [],
    activeUsers: new Set(),
};

// Limpiar posts viejos automáticamente
function cleanupOldPosts() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    state.posts = state.posts.filter(post => {
        return (now - post.timestamp) < (7 * oneDay); // Mantener 1 semana
    });
    
    console.log(`🧹 Limpieza: ${state.posts.length} posts activos`);
}

// Limpiar cada hora
setInterval(cleanupOldPosts, 60 * 60 * 1000);

wss.on('connection', (socket, req) => {
    console.log('👤 Nueva conexión');
    
    // Enviar estado actual al nuevo usuario
    socket.send(JSON.stringify({
        type: 'welcome',
        message: 'Bienvenido a MESH TCSACM 🌟',
        posts: state.posts.slice(0, 100) // Solo últimos 100 posts
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
            // Mantener conexión viva
            socket.send(JSON.stringify({ type: 'heartbeat_ack' }));
            break;
    }
}

function handleNewPost(socket, data) {
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

    // 🎯 GENERAR ID CONSISTENTE
    const newPostId = Date.now().toString();
    
    const newPost = {
        id: newPostId, // Usar solo Date.now() como string
        user: data.user,
        content: data.content,
        interactions: 0,
        comments: [],
        timestamp: Date.now()
    };
    
    console.log('📝 NUEVO POST CREADO:', {
        id: newPost.id,
        user: newPost.user,
        content: newPost.content.substring(0, 50)
    });
    
    state.posts.unshift(newPost);
    
    // Broadcast a todos
    broadcast({
        type: 'new_post',
        post: newPost
    });
}

function handleNewComment(socket, data) {
    console.log('🔍 BUSCANDO POST:');
    console.log('   ID recibido:', data.postId);
    console.log('   Tipo de ID:', typeof data.postId);
    console.log('   Posts en memoria:', state.posts.length);
    
    // Mostrar todos los IDs disponibles
    state.posts.forEach((post, index) => {
        console.log(`   Post ${index}: ID=${post.id}, User=${post.user}`);
    });
    
    const post = state.posts.find(p => p.id == data.postId); // Usar == en lugar de === para comparación flexible
    
    if (!post) {
        console.log('❌ POST NO ENCONTRADO - IDs disponibles:', state.posts.map(p => p.id));
        socket.send(JSON.stringify({
            type: 'error', 
            message: `El post no existe. ID: ${data.postId}`
        }));
        return;
    }

    const newComment = {
        user: data.user,
        text: data.text,
        timestamp: Date.now()
    };
    
    post.comments.push(newComment);
    post.interactions = (post.interactions || 0) + 1;
    
    broadcast({
        type: 'comment_added',
        postId: data.postId,
        comment: newComment,
        newInteractions: post.interactions
    });
    
    console.log(`💬 ${data.user} comentó en post ${data.postId}`);
}

function broadcast(message) {
    const messageStr = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor MESH ejecutándose en http://localhost:${PORT}`);
    console.log('💾 Datos en memoria - Se pierden al reiniciar');
    console.log('🌐 Abre múltiples navegadores/pestañas para probar!');
});