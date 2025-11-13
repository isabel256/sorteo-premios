const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose'); // <-- Para MongoDB
const Registro = require('./models/registro'); // <-- Importa el modelo
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_URI = process.env.DB_URI;

// --- GOOGLE VISION ---
const vision = require('@google-cloud/vision');
let client;

if (process.env.GOOGLE_CREDENTIALS_JSON) {
  // Para producción (Render): usa el JSON pegado directamente en la variable segura
  client = new vision.ImageAnnotatorClient({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
  });
} else {
  // Para desarrollo local: usa el archivo local (GOOGLE_APPLICATION_CREDENTIALS)
  client = new vision.ImageAnnotatorClient();
}

// --- CONEXIÓN A MONGO ---
mongoose.connect(DB_URI)
  .then(() => console.log("✅ Conexión exitosa a MongoDB"))
  .catch(err => console.error("❌ Error al conectar a MongoDB:", err));

// --- OBTENER NÚMERO DE TICKET ---
async function getNextTicketNumber() {
  const ultimoRegistro = await Registro.findOne().sort({ ticket: -1 });
  let nextTicketNumber = 1000;

  if (ultimoRegistro) {
    nextTicketNumber = parseInt(ultimoRegistro.ticket) + 1;
  }

  return nextTicketNumber.toString();
}

// ----------------------------------------------------------------------------------
// --- FUNCIÓN ACTUALIZADA: VALIDAR COMPROBANTE CON GOOGLE VISION OCR ---
// ----------------------------------------------------------------------------------
async function validateComprobanteWithOCR(filePath) {
  try {
    const [result] = await client.textDetection(filePath);
    const fullText = result.fullTextAnnotation ? result.fullTextAnnotation.text : '';

    if (!fullText || fullText.length < 50) {
      return { isValid: false, message: 'El comprobante está ilegible. Asegúrese de que la imagen sea clara y contenga texto legible.' };
    }

    const textUpper = fullText.toUpperCase();

    // 1. Criterios Críticos de Validación (S/ 50.00 a Davicross)
    const requiredAmount = '10.00';
    const companyKeywords = ['DAVICROSS', '20739903672', 'S.A.C'];

    // 1.1 CHECK: MONTO
    const amountCheck =
      textUpper.includes(requiredAmount) ||
      textUpper.includes('S/10') ||
      textUpper.includes('S. 10');

    if (!amountCheck) {
      return { isValid: false, message: 'El monto no coincide. Debe ser S/ 10.00 exactos para participar.' };
    }

    // 1.2 CHECK: BENEFICIARIO
    // const companyCheck = companyKeywords.some(keyword => textUpper.includes(keyword));

    // if (!companyCheck) {
    //   return { isValid: false, message: 'El beneficiario no es Davicross. Confirme el destinatario.' };
    // }

    // 2. Criterios de Validación de Formato de Transacción (Frases clave)
    
    // 2.1 CHECK: CÓDIGO DE SEGURIDAD
    if (!textUpper.includes('CÓDIGO DE SEGURIDAD') && !textUpper.includes('CODIGO DE SEGURIDAD')) {
        return { isValid: false, message: 'Falta el "CÓDIGO DE SEGURIDAD" en el comprobante. Asegúrese de que no esté recortado.' };
    }
    
    // 2.2 CHECK: NÚMERO DE OPERACIÓN
    if (!textUpper.includes('NRO. DE OPERACIÓN') && !textUpper.includes('NRO DE OPERACION')) {
        return { isValid: false, message: 'Falta el "Nro. de operación" en el comprobante. Asegúrese de que no esté recortado.' };
    }
    
    // 3. Criterios de Validación de Vigencia (NO FATAL - SOLO ADVERTENCIA)
    const now = new Date();
    const currentYear = now.getFullYear().toString();
    
    // Obtiene el nombre corto del mes actual en español (ej: NOV)
    const currentMonthShort = now.toLocaleString('es-ES', { month: 'short' }).toUpperCase().replace('.', '');
    
    // CHECK AÑO (no fatal, solo registra en el log)
    if (!textUpper.includes(currentYear)) {
        console.warn(`[OCR] Advertencia: No se detectó el año ${currentYear} en el comprobante.`);
    }

    // CHECK MES (no fatal, solo registra en el log)
    if (!textUpper.includes(currentMonthShort)) {
        console.warn(`[OCR] Advertencia: No se detectó el mes actual (${currentMonthShort}) en el comprobante. Puede ser una transacción antigua.`);
    }

    // Si todos los cheques esenciales (monto, beneficiario, frases clave) pasan
    return { isValid: true, message: 'Comprobante verificado exitosamente.' };

  } catch (error) {
    console.error('Error al procesar el comprobante con Google Vision:', error);
    return { isValid: false, message: 'Error interno al leer la imagen. Intente con otra foto.' };
  }
}

// --- CONFIGURAR SUBIDA DE ARCHIVOS ---
const UPLOADS_DIR = 'uploads/comprobantes/';

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const dni = req.body.dni || 'unknown';
    cb(null, `${dni}_${uuidv4().substring(0, 8)}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // Límite de 5MB
});

// --- CORS ---
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? 'https://sorteo-premios.onrender.com'
    : '*',
  methods: ['GET', 'POST']
}));

// --- ARCHIVOS ESTÁTICOS ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use('/comprobantes', express.static(UPLOADS_DIR));

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sorteo_de_premios.html'));
});

// ------------------------------------------------
// RUTA POST: REGISTRAR PARTICIPANTE (CON OCR DETALLADO)
// ------------------------------------------------
app.post('/api/register', upload.single('comprobante'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, message: 'Falta el comprobante de pago.' });
  }

  try {
    // 🚨 VALIDAR COMPROBANTE con el nuevo objeto de respuesta
    const validationResult = await validateComprobanteWithOCR(file.path);

    if (!validationResult.isValid) {
      // Usa el mensaje detallado de la validación
      fs.unlinkSync(file.path);
      return res.status(400).json({
        success: false,
        message: validationResult.message // <-- USA EL MENSAJE DETALLADO
      });
    }

    const ticketId = await getNextTicketNumber();

    const nuevoRegistro = new Registro({
      ...req.body,
      ticket: ticketId,
      comprobantePath: file.path
    });

    await nuevoRegistro.save();

    res.json({
      success: true,
      message: '¡Registro y comprobante verificados exitosamente!',
      ticket: ticketId
    });
  } catch (error) {
    console.error('Error durante el registro o OCR:', error);
    if (file && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
});

// ------------------------------------------------
// RUTA GET: CONSULTAR TICKETS
// ------------------------------------------------
app.get('/api/tickets', async (req, res) => {
  const dni = req.query.dni;

  if (!dni || dni.length !== 8) {
    return res.status(400).json({ success: false, message: 'DNI inválido.' });
  }

  try {
    const ticketsEncontrados = await Registro.find({ dni: dni }).exec();

    if (ticketsEncontrados.length > 0) {
      const nombreCompleto = `${ticketsEncontrados[0].nombres} ${ticketsEncontrados[0].apellidos}`;

      const nombreDelPremio = 'Motocicleta Yamaha R15';
      const imagenDelPremio = 'https://www.yamaha-motor.com.pe/file/v4685047748609769303/general/bloque01_r15_abs_peru.jpg';
      const fechaDelSorteo = '31 de Diciembre de 2025';
      const nombreInstitucion = 'Importaciones Davicross S.A.C.';

      const listaTicketsDetallados = ticketsEncontrados.map(r => ({
        number: r.ticket,
        prize: nombreDelPremio,
        prizeImage: imagenDelPremio,
        drawDate: fechaDelSorteo,
        institution: nombreInstitucion,
        status: 'Activo'
      }));

      res.json({
        success: true,
        name: nombreCompleto,
        tickets: listaTicketsDetallados
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

// --- INICIAR SERVIDOR ---
app.listen(PORT, () => {
  console.log(`🚀 Servidor Node.js corriendo en el puerto ${PORT}`);
  console.log(`🔗 Endpoints disponibles:`);
  console.log(`   - POST: https://sorteo-premios.onrender.com/api/register`);
  console.log(`   - GET:  https://sorteo-premios.onrender.com/api/tickets?dni=...`);
  console.log(`🌐 En producción: https://sorteo-premios.onrender.com`);
});