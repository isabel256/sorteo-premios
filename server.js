const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose'); // <-- NUEVO: Para MongoDB
const Registro = require('./models/registro'); // <-- NUEVO: Importa el modelo
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_URI = process.env.DB_URI;
// server.js (Parte superior, después de los require)

const vision = require('@google-cloud/vision');
// El cliente se autentica automáticamente usando la clave JSON de GOOGLE_APPLICATION_CREDENTIALS
const client = new vision.ImageAnnotatorClient();

mongoose.connect(DB_URI)
    .then(() => console.log("✅ Conexión exitosa a MongoDB"))
    .catch(err => console.error("❌ Error al conectar a MongoDB:", err));
    
// Lógica para el número de ticket (ahora se obtiene desde la DB)
async function getNextTicketNumber() {
    const ultimoRegistro = await Registro.findOne().sort({ ticket: -1 });
    let nextTicketNumber = 1000;


    if (ultimoRegistro) {
        // Asume que el ticket es un número y lo incrementa
        nextTicketNumber = parseInt(ultimoRegistro.ticket) + 1;
    }

    return nextTicketNumber.toString();

}

//Procesa el comprobante usando Google Vision y valida el contenido.

async function validateComprobanteWithOCR(filePath) {
    try {
        const [result] = await client.textDetection(filePath);
        const fullText = result.fullTextAnnotation ? result.fullTextAnnotation.text : '';
        
        if (!fullText) return false;
        
        const textUpper = fullText.toUpperCase();
        
        // Criterios de Validación (Monto S/ 50.00 y Beneficiario Davicross)
        const requiredAmount = '50.00';
        const companyKeywords = ['DAVICROSS', '20739903672', 'S.A.C']; 
        
        const amountCheck = textUpper.includes(requiredAmount) || textUpper.includes('S/50') || textUpper.includes('S. 50'); 
        const companyCheck = companyKeywords.some(keyword => textUpper.includes(keyword));

        return amountCheck && companyCheck;

    } catch (error) {
        console.error('Error al procesar el comprobante con Google Vision:', error);
        return false; 
    }
}

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


app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? 'https://sorteo-premios.onrender.com'
        : '*',
    methods: ['GET', 'POST']
}));

app.use(express.static(path.join(__dirname, 'public')));
app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sorteo_de_premios.html'));
});

app.use(express.json());
app.use('/comprobantes', express.static(UPLOADS_DIR)); // Para servir los archivos subidos (opcional)

// ------------------------------------------------
// RUTA POST: REGISTRAR PARTICIPANTE (/api/register)
// ------------------------------------------------
// server.js (Modifica la ruta existente app.post('/api/register', ...)

app.post('/api/register', upload.single('comprobante'), async (req, res) => {
    
    const file = req.file;
    if (!file) {
        return res.status(400).json({ success: false, message: 'Falta el comprobante de pago.' });
    }

    try {
        
        // 🚨 PASO DE VALIDACIÓN OCR 🚨
        const isValid = await validateComprobanteWithOCR(file.path);

        if (!isValid) {
            // Si la validación falla, BORRAMOS el archivo subido
            fs.unlinkSync(file.path); 
            return res.status(400).json({ 
                success: false, 
                message: 'El comprobante no pudo ser verificado. Confirme que sea de S/ 50.00 a Davicross.' 
            });
        }

        // Si es válido, continuamos el proceso normal:
        const ticketId = await getNextTicketNumber(); 
        
        const nuevoRegistro = new Registro({
            ...req.body,
            ticket: ticketId,
            comprobantePath: file.path // Solo guardamos la ruta si fue validado
        });

        await nuevoRegistro.save(); 

        res.json({ success: true, message: '¡Registro y comprobante verificados exitosamente!', ticket: ticketId });

    } catch (error) {
        console.error('Error durante el registro o OCR:', error);
        // Manejo de error: Asegúrate de limpiar el archivo ante cualquier fallo
        if (file && fs.existsSync(file.path)) {
             fs.unlinkSync(file.path); 
        }
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
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
    console.log(`🚀 Servidor Node.js corriendo en el puerto ${PORT}`);
    console.log(`🔗 Endpoints disponibles:`);
    console.log(`   - POST:https://sorteo-premios.onrender.com/api/register`);
    console.log(`   - GET:https://sorteo-premios.onrender.com/api/tickets?dni=...`);
    console.log(`🌐 En producción:https://sorteo-premios.onrender.com`);
});

