require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { testConnection } = require('./db');

const authRoutes = require('./routes/auth');
const catRoutes = require('./routes/categorias');
const medRoutes = require('./routes/medicamentos');
const movRoutes = require('./routes/movimientos');
const recRoutes = require('./routes/recetas');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// servir recetas subidas
const uploadDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads/recetas');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// servir frontend estático (si se copia frontend/ dentro de backend/public)
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

app.get('/api/health', (_req, res) => res.json({ ok: true, db: process.env.DB_NAME }));

app.use('/api/auth', authRoutes);
app.use('/api/categorias', catRoutes);
app.use('/api/medicamentos', medRoutes);
app.use('/api/movimientos', movRoutes);
app.use('/api/dashboard', movRoutes); // /api/dashboard/resumen
app.use('/api/recetas', recRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno' });
});

testConnection()
  .then(() => app.listen(PORT, () => console.log(`💊 Farmacia API en http://localhost:${PORT}`)))
  .catch((e) => {
    console.error('❌ No se pudo conectar a MySQL:', e.message);
    console.log('Revisa tu .env y que MySQL esté corriendo. Levanto API igual para ver el error en /api/health');
    app.listen(PORT, () => console.log(`API en http://localhost:${PORT} (sin DB)`));
  });
