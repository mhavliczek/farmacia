const express = require('express');
const { pool } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  next();
}

router.get('/', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM categorias ORDER BY nombre');
  res.json(rows);
});

router.post('/', requireAdmin, async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
  try {
    const [r] = await pool.query('INSERT INTO categorias (nombre, descripcion) VALUES (?,?)', [nombre, descripcion || null]);
    res.status(201).json({ id: r.insertId, nombre, descripcion });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Categoría ya existe' });
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM categorias WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
