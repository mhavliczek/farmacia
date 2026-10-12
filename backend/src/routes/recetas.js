const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { pool } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const uploadDir = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads/recetas');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `receta-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  }
});

function fileFilter(_req, file, cb) {
  const ok = /jpe?g|png|webp|pdf/i.test(path.extname(file.originalname));
  cb(ok ? null : new Error('Solo se permiten JPG, PNG, WEBP o PDF'), ok);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/recetas?estado=pendiente
router.get('/', async (req, res) => {
  const { estado } = req.query;
  let sql = `SELECT r.*, m.nombre AS medicamento_nombre, u.nombre AS subido_por
             FROM recetas r LEFT JOIN medicamentos m ON m.id=r.medicamento_id
             LEFT JOIN usuarios u ON u.id=r.usuario_id WHERE 1=1`;
  const params = [];
  if (estado) { sql += ' AND r.estado=?'; params.push(estado); }
  sql += ' ORDER BY r.creado_en DESC LIMIT 200';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// POST /api/recetas  (multipart: archivo, paciente_nombre, medico_nombre, medicamento_id, observaciones)
router.post('/', upload.single('archivo'), async (req, res) => {
  try {
    const { paciente_nombre, medico_nombre, medicamento_id, observaciones } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Archivo de receta requerido' });
    if (!paciente_nombre) return res.status(400).json({ error: 'paciente_nombre requerido' });
    const relPath = path.relative(path.join(__dirname, '..', '..'), req.file.path);
    const [r] = await pool.query(
      `INSERT INTO recetas (paciente_nombre, medico_nombre, archivo_path, archivo_original, medicamento_id, usuario_id, observaciones)
       VALUES (?,?,?,?,?,?,?)`,
      [paciente_nombre, medico_nombre || null, relPath, req.file.originalname,
       medicamento_id || null, req.user.id, observaciones || null]
    );
    res.status(201).json({ id: r.insertId, archivo: relPath });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Error al subir receta' });
  }
});

// PATCH /api/recetas/:id  { estado, observaciones }
router.patch('/:id', async (req, res) => {
  const { estado, observaciones } = req.body;
  if (estado && !['pendiente', 'dispensada', 'rechazada'].includes(estado)) {
    return res.status(400).json({ error: 'estado inválido' });
  }
  await pool.query('UPDATE recetas SET estado=COALESCE(?,estado), observaciones=COALESCE(?,observaciones) WHERE id=?',
    [estado || null, observaciones ?? null, req.params.id]);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const [[row]] = await pool.query('SELECT archivo_path FROM recetas WHERE id=?', [req.params.id]);
  await pool.query('DELETE FROM recetas WHERE id=?', [req.params.id]);
  if (row) {
    const abs = path.join(__dirname, '..', '..', row.archivo_path);
    fs.rm(abs, { force: true }, () => {});
  }
  res.json({ ok: true });
});

module.exports = router;
