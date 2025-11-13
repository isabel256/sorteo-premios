// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');
// const cors = require('cors');
// const { v4: uuidv4 } = require('uuid');
// const mongoose = require('mongoose'); // <-- NUEVO: Para MongoDB
// const Registro = require('./models/registro'); // <-- NUEVO: Importa el modelo
// require('dotenv').config();

// const app = express();
// const PORT = process.env.PORT || 3000;
// const DB_URI = process.env.DB_URI;
// // server.js (Parte superior, después de los require)


// const vision = require('@google-cloud/vision');

// let client;

// if (process.env.GOOGLE_CREDENTIALS_JSON) {
//     // Para producción (Render): usa el JSON pegado directamente en la variable segura
//     client = new vision.ImageAnnotatorClient({
//         credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
//     });
// } else {
//     // Para desarrollo local: usa el archivo local (GOOGLE_APPLICATION_CREDENTIALS)
//     client = new vision.ImageAnnotatorClient();
// }

// mongoose.connect(DB_URI)
//     .then(() => console.log("✅ Conexión exitosa a MongoDB"))
//     .catch(err => console.error("❌ Error al conectar a MongoDB:", err));

// // Lógica para el número de ticket (ahora se obtiene desde la DB)
// async function getNextTicketNumber() {
//     const ultimoRegistro = await Registro.findOne().sort({ ticket: -1 });
//     let nextTicketNumber = 1000;


//     if (ultimoRegistro) {
//         // Asume que el ticket es un número y lo incrementa
//         nextTicketNumber = parseInt(ultimoRegistro.ticket) + 1;
//     }

//     return nextTicketNumber.toString();

// }

// //Procesa el comprobante usando Google Vision y valida el contenido.

// async function validateComprobanteWithOCR(filePath) {
//     try {
//         const [result] = await client.textDetection(filePath);
//         const fullText = result.fullTextAnnotation ? result.fullTextAnnotation.text : '';

//         if (!fullText) return false;

//         const textUpper = fullText.toUpperCase();

//         // Criterios de Validación (Monto S/ 10.00 y Beneficiario Davicross)
//         const requiredAmount = '10.00';
//         const companyKeywords = ['DAVICROSS', '20739903672', 'S.A.C'];

//         const amountCheck = textUpper.includes(requiredAmount) || textUpper.includes('S/10') || textUpper.includes('S. 10');
//         const companyCheck = companyKeywords.some(keyword => textUpper.includes(keyword));

//         return amountCheck && companyCheck;

//     } catch (error) {
//         console.error('Error al procesar el comprobante con Google Vision:', error);
//         return false;
//     }
// }

// const UPLOADS_DIR = 'uploads/comprobantes/';

// // 1. Asegúrate de que la carpeta de subidas exista
// if (!fs.existsSync(UPLOADS_DIR)) {
//     fs.mkdirSync(UPLOADS_DIR, { recursive: true });
// }

// // 2. Configuración para guardar el archivo en disco
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//         cb(null, UPLOADS_DIR);
//     },
//     filename: (req, file, cb) => {
//         // Aseguramos un nombre único: DNI_UUID.ext
//         const ext = path.extname(file.originalname);
//         const dni = req.body.dni || 'unknown';
//         cb(null, `${dni}_${uuidv4().substring(0, 8)}${ext}`);
//     }
// });

// const upload = multer({
//     storage: storage,
//     limits: { fileSize: 5 * 1024 * 1024 } // Límite de 5MB
// });

// app.use(cors({
//   origin: ['https://sorteo-premios.onrender.com', 'http://sorteo-premios.onrender.com'],
//   methods: ['GET', 'POST']
// }));

// // app.use(cors({
// //     origin: process.env.NODE_ENV === 'production'
// //         ? 'https://sorteo-premios.onrender.com'
// //         : '*',
// //     methods: ['GET', 'POST']
// // }));

// app.use(express.static(path.join(__dirname, 'public')));
// app.get(/^\/(?!api).*/, (req, res) => {
//     res.sendFile(path.join(__dirname, 'public', 'sorteo_de_premios.html'));
// });

// app.use(express.json());
// app.use('/comprobantes', express.static(UPLOADS_DIR)); // Para servir los archivos subidos (opcional)

// // ------------------------------------------------
// // RUTA POST: REGISTRAR PARTICIPANTE (/api/register)
// // ------------------------------------------------
// // server.js (Modifica la ruta existente app.post('/api/register', ...)

// app.post('/api/register', upload.single('comprobante'), async (req, res) => {

//     const file = req.file;
//     if (!file) {
//         return res.status(400).json({ success: false, message: 'Falta el comprobante de pago.' });
//     }

//     try {

//         // 🚨 PASO DE VALIDACIÓN OCR 🚨
//         const isValid = await validateComprobanteWithOCR(file.path);

//         if (!isValid) {
//             // Si la validación falla, BORRAMOS el archivo subido
//             fs.unlinkSync(file.path);
//             return res.status(400).json({
//                 success: false,
//                 message: 'El comprobante no pudo ser verificado. Confirme que sea de S/ 10.00 a Davicross.'
//             });
//         }

//         // Si es válido, continuamos el proceso normal:
//         const ticketId = await getNextTicketNumber();

//         const nuevoRegistro = new Registro({
//             ...req.body,
//             ticket: ticketId,
//             comprobantePath: file.path // Solo guardamos la ruta si fue validado
//         });

//         await nuevoRegistro.save();

//         res.json({ success: true, message: '¡Registro y comprobante verificados exitosamente!', ticket: ticketId });

//     } catch (error) {
//         console.error('Error durante el registro o OCR:', error);
//         // Manejo de error: Asegúrate de limpiar el archivo ante cualquier fallo
//         if (file && fs.existsSync(file.path)) {
//             fs.unlinkSync(file.path);
//         }
//         res.status(500).json({ success: false, message: 'Error interno del servidor.' });
//     }
// });

// // server.js (Modificación en la ruta app.get('/api/tickets', ...))

// app.get('/api/tickets', async (req, res) => {
//     const dni = req.query.dni;

//     if (!dni || dni.length !== 8) {
//         return res.status(400).json({ success: false, message: 'DNI inválido.' });
//     }

//     try {
//         // 🔎 BUSCAR EN MONGO DB
//         const ticketsEncontrados = await Registro.find({ dni: dni }).exec();

//         if (ticketsEncontrados.length > 0) {
//             const nombreCompleto = `${ticketsEncontrados[0].nombres} ${ticketsEncontrados[0].apellidos}`;
            
//             // --- DATOS ESTÁTICOS DEL SORTEO ---
//             const nombreDelPremio = 'Motocicleta Yamaha R15';
//             const imagenDelPremio = 'https://www.yamaha-motor.com.pe/file/v4685047748609769303/general/bloque01_r15_abs_peru.jpg'; 
//             const fechaDelSorteo = '31 de Diciembre de 2025'; 
//             const nombreInstitucion = 'Importaciones Davicross S.A.C.';
//             // ------------------------------------

//             // Transforma la respuesta para incluir el detalle del sorteo
//             const listaTicketsDetallados = ticketsEncontrados.map(r => ({
//                 number: r.ticket,
//                 prize: nombreDelPremio,
//                 prizeImage: imagenDelPremio,
//                 drawDate: fechaDelSorteo, 
//                 institution: nombreInstitucion, 
//                 status: 'Activo' // Estado por defecto
//             }));

//             res.json({
//                 success: true,
//                 name: nombreCompleto,
//                 tickets: listaTicketsDetallados 
//             });
//         } else {
//             res.status(404).json({
//                 success: false,
//                 message: 'DNI no encontrado o sin tickets asignados.'
//             });
//         }

//     } catch (error) {
//         console.error('Error al consultar la base de datos:', error);
//         res.status(500).json({ success: false, message: 'Error interno del servidor al consultar.' });
//     }
// });

// // ... (app.listen)

// // Iniciar Servidor
// app.listen(PORT, () => {
//     console.log(`🚀 Servidor Node.js corriendo en el puerto ${PORT}`);
//     console.log(`🔗 Endpoints disponibles:`);
//     console.log(`   - POST:https://sorteo-premios.onrender.com/api/register`);
//     console.log(`   - GET:https://sorteo-premios.onrender.com/api/tickets?dni=...`);
//     console.log(`🌐 En producción:https://sorteo-premios.onrender.com`);
// });

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const vision = require("@google-cloud/vision");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_URI = process.env.DB_URI;
const UPLOADS_DIR = "uploads/comprobantes/";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let client;
if (process.env.GOOGLE_CREDENTIALS_JSON) {
    client = new vision.ImageAnnotatorClient({
        credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
    });
} else {
    client = new vision.ImageAnnotatorClient();
}

// Conexión a MongoDB
mongoose.connect(DB_URI)
    .then(() => console.log("✅ Conectado a MongoDB"))
    .catch(err => console.error("❌ Error MongoDB:", err));

const Registro = require("./models/registro");

// Crear carpeta de uploads si no existe
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Configuración multer
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const dni = req.body.dni || "unknown";
        cb(null, `${dni}_${uuidv4().slice(0,8)}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Función OCR
async function validateComprobanteWithOCR(filePath) {
    try {
        const [result] = await client.textDetection(filePath);
        const text = result.fullTextAnnotation?.text?.toUpperCase() || "";

        const requiredAmount = ['10.00','S/10'];
        const companyKeywords = ['DAVICROSS','20739903672','S.A.C'];

        const amountCheck = requiredAmount.some(a => text.includes(a));
        const companyCheck = companyKeywords.some(k => text.includes(k));

        return amountCheck && companyCheck;
    } catch (err) {
        console.error("Error OCR:", err);
        return false;
    }
}

// Obtener siguiente ticket
async function getNextTicketNumber() {
    const last = await Registro.findOne().sort({ ticket: -1 });
    return last ? (parseInt(last.ticket) + 1).toString() : "1000";
}

// POST /api/register
app.post("/api/register", upload.single("comprobante"), async (req,res) => {
    const { dni, nombres, apellidos, whatsapp, departamento, premioSeleccionado, participarTodos } = req.body;
    const file = req.file;

    if (!dni || !file) return res.status(400).json({ success:false, message:"Datos incompletos o comprobante faltante." });

    try {
        // Validación OCR
        const valid = await validateComprobanteWithOCR(file.path);
        if (!valid) {
            fs.unlinkSync(file.path);
            return res.status(400).json({ success:false, message:"Comprobante no válido." });
        }

        // Validar duplicado de DNI
        const existing = await Registro.findOne({ dni });
        if (existing) {
            fs.unlinkSync(file.path);
            return res.status(400).json({ success:false, message:"DNI ya registrado." });
        }

        const ticket = await getNextTicketNumber();

        const nuevo = new Registro({
            dni,
            nombres,
            apellidos,
            whatsapp,
            departamento,
            premioSeleccionado: participarTodos === "true" ? "Todos los premios" : premioSeleccionado,
            participarTodos: participarTodos === "true",
            comprobantePath: file.path,
            ticket
        });

        await nuevo.save();
        res.json({ success:true, message:"Registro exitoso", ticket });

    } catch(err) {
        console.error("Error registro:",err);
        if(file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.status(500).json({ success:false, message:"Error interno del servidor." });
    }
});

// GET /api/tickets?dni=...
app.get("/api/tickets", async (req,res)=>{
    const { dni } = req.query;
    if(!dni) return res.status(400).json({ success:false, message:"DNI requerido." });

    try{
        const registros = await Registro.find({ dni });
        if(registros.length===0) return res.status(404).json({ success:false, message:"DNI no encontrado." });

        const tickets = registros.map(r=>({
            number: r.ticket,
            prize: r.premioSeleccionado,
            prizeImage: r.premioSeleccionado === "Motocicleta Yamaha R15"
                ? "https://www.yamaha-motor.com.pe/file/v4685047748609769303/general/bloque01_r15_abs_peru.jpg"
                : "https://static8.depositphotos.com/1006899/896/i/450/depositphotos_8961765-stock-photo-prize.jpg",
            drawDate: "31 de Diciembre de 2025",
            institution: "Importaciones Davicross S.A.C.",
            status: r.status
        }));

        res.json({ success:true, name:`${registros[0].nombres} ${registros[0].apellidos}`, tickets });

    }catch(err){
        console.error("Error tickets:",err);
        res.status(500).json({ success:false, message:"Error interno al consultar tickets." });
    }
});

app.listen(PORT,()=>console.log(`🚀 Servidor activo en puerto ${PORT}`));
