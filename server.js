const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose'); // <-- NUEVO: Para MongoDB
const Registro = require('./models/registro'); // <-- NUEVO: Importa el modelo

const app = express();
const PORT = 3000;



// ----------------------------------------------------------------------------------
// 🚀 CONEXIÓN A LA BASE DE DATOS REAL (MongoDB)
// ----------------------------------------------------------------------------------
// const DB_URI = 'mongodb://localhost:27017/sorteoDB'; // <-- CAMBIA ESTO por tu URL de MongoDB Atlas si despliegas
const DB_URI = 'mongodb+srv://admin_db:1234@cluster0.exgbbb9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('✅ Conexión exitosa a MongoDB'))
    .catch(err => console.error('❌ Error de conexión a MongoDB:', err));

// ----------------------------------------------------------------------------------
// Lógica para el número de ticket (ahora se obtiene desde la DB)
// ----------------------------------------------------------------------------------
async function getNextTicketNumber() {
    const ultimoRegistro = await Registro.findOne().sort({ ticket: -1 });
    let nextTicketNumber = 1000;
    

    if (ultimoRegistro) {
        // Asume que el ticket es un número y lo incrementa
        nextTicketNumber = parseInt(ultimoRegistro.ticket) + 1;
    }
    
    return nextTicketNumber.toString();
    
}

// ... (resto del código: Multer, app.use(cors), app.get('/'), etc.)

// ------------------------------------------------
// CONFIGURACIÓN DE MULTER (Subida de Comprobantes)
// ------------------------------------------------
const UPLOADS_DIR = 'uploads/comprobantes/';

// 1. Asegúrate de que la carpeta de subidas exista
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 2. Configuración para guardar el archivo en disco
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        // Aseguramos un nombre único: DNI_UUID.ext
        const ext = path.extname(file.originalname);
        const dni = req.body.dni || 'unknown';
        cb(null, `${dni}_${uuidv4().substring(0, 8)}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // Límite de 5MB
});

// ------------------------------------------------
// MIDDLEWARE
// ------------------------------------------------
// Permite peticiones desde el frontend (puerto 80/443 por defecto)
app.use(cors({
    origin: '*', // ⚠️ EN PRODUCCIÓN, CAMBIA ESTO POR LA URL DE TU DOMINIO
    methods: ['GET', 'POST']
}));
app.use(express.json());
app.use('/comprobantes', express.static(UPLOADS_DIR)); // Para servir los archivos subidos (opcional)

// ------------------------------------------------
// RUTA POST: REGISTRAR PARTICIPANTE (/api/register)
// ------------------------------------------------
app.post('/api/register', upload.single('comprobante'), async (req, res) => {
    // ... (Validaciones y Recolección de datos desde req.body y req.file)
    
    // Asignar el ticket único (ahora es async)
    const ticketId = await getNextTicketNumber(); // <-- Usa la función async

    try {
        // 💾 GUARDAR EL REGISTRO EN MONGO DB
        const nuevoRegistro = new Registro({
            dni: req.body.dni,
            nombres: req.body.nombres,
            apellidos: req.body.apellidos,
            whatsapp: req.body.whatsapp,
            departamento: req.body.departamento,
            ticket: ticketId, // Ticket real
            comprobantePath: req.file.path // Ruta donde Multer guardó el archivo
        });

        await nuevoRegistro.save(); // <-- Guarda el documento en la DB

        // Respuesta de éxito
        res.json({ success: true, message: 'Registro exitoso.', ticket: ticketId });

    } catch (error) {
        console.error('Error al guardar en la base de datos:', error);
        // Si hay error, podrías querer borrar el archivo subido
        fs.unlinkSync(req.file.path); 
        res.status(500).json({ success: false, message: 'Error interno del servidor al registrar.' });
    }
});

// ------------------------------------------------
// RUTA GET: CONSULTAR TICKETS (/api/tickets?dni=...)
// ------------------------------------------------
app.get('/api/tickets', async (req, res) => { // <-- Hacer la función async
    const dni = req.query.dni;

    if (!dni || dni.length !== 8) {
        return res.status(400).json({ success: false, message: 'DNI inválido.' });
    }

    try {
        // 🔎 BUSCAR EN MONGO DB
        const ticketsEncontrados = await Registro.find({ dni: dni }).exec(); 
        
        if (ticketsEncontrados.length > 0) {
            const nombreCompleto = `${ticketsEncontrados[0].nombres} ${ticketsEncontrados[0].apellidos}`;
            const listaTickets = ticketsEncontrados.map(r => r.ticket);
    
            res.json({
                success: true,
                name: nombreCompleto,
                tickets: listaTickets
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'DNI no encontrado o sin tickets asignados.'
            });
        }

    } catch (error) {
        console.error('Error al consultar la base de datos:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al consultar.' });
    }
});

// ... (app.listen)

// Iniciar Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Node.js corriendo en http://localhost:${PORT}`);
    console.log('🔗 Endpoints disponibles:');
    console.log(`   - POST: ${app.get('env') === 'development' ? 'http://localhost:3000' : 'https://tudominio.com'}/api/register`);
    console.log(`   - GET:  ${app.get('env') === 'development' ? 'http://localhost:3000' : 'https://tudominio.com'}/api/tickets?dni=...`);
});