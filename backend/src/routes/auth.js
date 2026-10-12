const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'nombre, email y password son obligatorios' });
  }
  const rolFinal = ['admin', 'farmaceutico', 'cajero'].includes(rol) ? rol : 'farmaceutico';
  try {
    const [existe] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length) return res.status(409).json({ error: 'Email ya registrado' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?,?,?,?)',
      [nombre, email, hash, rolFinal]
    );
    const user = { id: r.insertId, nombre, email, rol: rolFinal };
    res.status(201).json({ user, token: signToken(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email y password requeridos' });
  try {
    const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ? AND activo = 1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Credenciales inválidas' });
    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
    const user = { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
    res.json({ user, token: signToken(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error en login' });
  }
});

// GET /api/auth/me
router.get('/me', authRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT id, nombre, email, rol, creado_en FROM usuarios WHERE id = ?', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
});

// GET /api/auth/usuarios (solo admin)
router.get('/usuarios', authRequired, async (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  const [rows] = await pool.query('SELECT id, nombre, email, rol, activo, creado_en FROM usuarios ORDER BY id DESC');
  res.json(rows);
});

module.exports = router;
