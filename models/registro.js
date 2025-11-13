// const mongoose = require('mongoose');

// const registroSchema = new mongoose.Schema({
//     dni: { type: String, required: true, index: true }, // Campo clave para la búsqueda
//     nombres: { type: String, required: true },
//     apellidos: { type: String, required: true },
//     whatsapp: { type: String, required: true },
//     departamento: { type: String, required: true },
//     ticket: { type: String, required: true, unique: true }, // Número de ticket único
//     comprobantePath: { type: String, required: true }, // Ruta del archivo subido
//     fechaRegistro: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model('Registro', registroSchema);

const mongoose = require('mongoose');

const registroSchema = new mongoose.Schema({
    dni: { type: String, required: true, index: true },
    nombres: { type: String, required: true },
    apellidos: { type: String, required: true },
    whatsapp: { type: String, required: true },
    departamento: { type: String, required: true, enum: ['Lima', 'Cusco', 'Arequipa', 'Trujillo', 'Otro'] },
    premioSeleccionado: { type: String, default: 'Motocicleta Yamaha R15' },
    participarTodos: { type: Boolean, default: false },
    comprobantePath: { type: String, required: true },
    ticket: { type: String, required: true, unique: true },
    status: { type: String, enum: ['Activo', 'Ganador'], default: 'Activo' },
    fechaRegistro: { type: Date, default: Date.now }
});

// Índice compuesto para evitar duplicados
registroSchema.index({ dni: 1, ticket: 1 }, { unique: true });

module.exports = mongoose.model('Registro', registroSchema);

