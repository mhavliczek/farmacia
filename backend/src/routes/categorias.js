const express = require('express');
const { pool } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

router.get('/', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM categorias ORDER BY nombre');
  res.json(rows);
});

router.post('/', async (req, res) => {
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

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM categorias WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
