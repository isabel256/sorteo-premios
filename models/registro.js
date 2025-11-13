const mongoose = require('mongoose');

const registroSchema = new mongoose.Schema({
    
    dni: { type: String, required: true, index: true, unique: true }, // Campo clave para la búsqueda
    nombres: { type: String, required: true },
    apellidos: { type: String, required: true },
    whatsapp: { type: String, required: true },
    departamento: { type: String, required: true },
    nroOperacion: { type: String, required: true,  unique: true },
    ticket: { type: String, required: true, unique: true }, // Número de ticket único
    comprobantePath: { type: String, required: true }, // Ruta del archivo subido
    fechaRegistro: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Registro', registroSchema);



