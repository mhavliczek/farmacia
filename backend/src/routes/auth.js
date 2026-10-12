const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  next();
}

// POST /api/auth/register — PÚBLICO pero siempre crea farmaceutico/cajero, NUNCA admin.
// El primer usuario del sistema sí puede ser admin (para el setup inicial).
router.post('/register', async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'nombre, email y password son obligatorios' });
  }
  try {
    const [existe] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length) return res.status(409).json({ error: 'Email ya registrado' });
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM usuarios');
    // Solo el primer usuario puede autoproclamarse admin. Después, el rol pedido se ignora.
    let rolFinal = 'farmaceutico';
    if (total === 0 && rol === 'admin') rolFinal = 'admin';
    else if (['farmaceutico', 'cajero'].includes(rol)) rolFinal = rol;
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
router.get('/usuarios', authRequired, requireAdmin, async (_req, res) => {
  const [rows] = await pool.query('SELECT id, nombre, email, rol, activo, creado_en FROM usuarios ORDER BY id DESC');
  res.json(rows);
});

// POST /api/auth/usuarios (solo admin crea usuarios con cualquier rol)
router.post('/usuarios', authRequired, requireAdmin, async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'nombre, email y password requeridos' });
  const rolFinal = ['admin', 'farmaceutico', 'cajero'].includes(rol) ? rol : 'farmaceutico';
  try {
    const [existe] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length) return res.status(409).json({ error: 'Email ya registrado' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?,?,?,?)', [nombre, email, hash, rolFinal]);
    res.status(201).json({ id: r.insertId, nombre, email, rol: rolFinal });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PATCH /api/auth/usuarios/:id (solo admin cambia rol/activo)
router.patch('/usuarios/:id', authRequired, requireAdmin, async (req, res) => {
  const { rol, activo } = req.body;
  if (rol && !['admin', 'farmaceutico', 'cajero'].includes(rol)) return res.status(400).json({ error: 'rol inválido' });
  await pool.query('UPDATE usuarios SET rol=COALESCE(?,rol), activo=COALESCE(?,activo) WHERE id=?', [rol || null, activo ?? null, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
