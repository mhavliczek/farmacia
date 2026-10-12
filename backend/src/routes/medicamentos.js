const express = require('express');
const { pool } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Solo admin puede gestionar medicamentos' });
  next();
}

// GET /api/medicamentos?q=&categoria_id=&vencidos=1&bajo_stock=1
router.get('/', async (req, res) => {
  const { q, categoria_id, vencidos, bajo_stock } = req.query;
  let sql = `
    SELECT m.*, c.nombre AS categoria_nombre,
      DATEDIFF(m.fecha_vencimiento, CURDATE()) AS dias_para_vencer,
      CASE WHEN m.fecha_vencimiento < CURDATE() THEN 1 ELSE 0 END AS vencido,
      CASE WHEN m.cantidad_pastillas <= m.stock_minimo THEN 1 ELSE 0 END AS bajo_stock
    FROM medicamentos m
    LEFT JOIN categorias c ON c.id = m.categoria_id
    WHERE 1=1`;
  const params = [];
  if (q) { sql += ' AND (m.nombre LIKE ? OR m.gramaje LIKE ? OR m.descripcion LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (categoria_id) { sql += ' AND m.categoria_id = ?'; params.push(categoria_id); }
  if (vencidos === '1') { sql += ' AND m.fecha_vencimiento < CURDATE()'; }
  if (bajo_stock === '1') { sql += ' AND m.cantidad_pastillas <= m.stock_minimo'; }
  sql += ' ORDER BY m.fecha_vencimiento ASC, m.nombre ASC';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT m.*, c.nombre AS categoria_nombre FROM medicamentos m LEFT JOIN categorias c ON c.id=m.categoria_id WHERE m.id=?',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
});

// POST /api/medicamentos — solo admin registra medicamentos
router.post('/', requireAdmin, async (req, res) => {
  const { nombre, gramaje, descripcion, cantidad_pastillas, fecha_vencimiento, categoria_id, stock_minimo } = req.body;
  if (!nombre || cantidad_pastillas == null || !fecha_vencimiento) {
    return res.status(400).json({ error: 'nombre, cantidad_pastillas y fecha_vencimiento son obligatorios' });
  }
  try {
    const [r] = await pool.query(
      `INSERT INTO medicamentos (nombre, gramaje, descripcion, cantidad_pastillas, fecha_vencimiento, categoria_id, stock_minimo)
       VALUES (?,?,?,?,?,?,?)`,
      [nombre, gramaje || null, descripcion || null, Number(cantidad_pastillas), fecha_vencimiento,
       categoria_id || null, Number(stock_minimo ?? 10)]
    );
    // registrar entrada inicial como movimiento
    if (Number(cantidad_pastillas) > 0) {
      await pool.query(
        "INSERT INTO movimientos (medicamento_id, tipo, cantidad, motivo, usuario_id) VALUES (?,'entrada',?,?,?)",
        [r.insertId, Number(cantidad_pastillas), 'Stock inicial', req.user.id]
      );
    }
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al crear medicamento' });
  }
});

// PUT /api/medicamentos/:id — solo admin edita
// El stock (cantidad_pastillas) no se edita aquí: se modifica solo con entrada/salida para mantener el kardex.
router.put('/:id', requireAdmin, async (req, res) => {
  const { nombre, gramaje, descripcion, fecha_vencimiento, categoria_id, stock_minimo } = req.body;
  try {
    const [r] = await pool.query(
      `UPDATE medicamentos SET nombre=COALESCE(?,nombre), gramaje=?, descripcion=?, fecha_vencimiento=COALESCE(?,fecha_vencimiento),
       categoria_id=?, stock_minimo=COALESCE(?,stock_minimo) WHERE id=?`,
      [nombre || null, gramaje ?? null, descripcion ?? null, fecha_vencimiento || null, categoria_id || null,
       stock_minimo ?? null, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'Medicamento no existe' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al editar medicamento' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM medicamentos WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// POST /api/medicamentos/:id/entrada  { cantidad, motivo }
router.post('/:id/entrada', async (req, res) => {
  const cantidad = Number(req.body.cantidad);
  if (!cantidad || cantidad <= 0) return res.status(400).json({ error: 'cantidad debe ser > 0' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE medicamentos SET cantidad_pastillas = cantidad_pastillas + ? WHERE id = ?', [cantidad, req.params.id]);
    await conn.query(
      'INSERT INTO movimientos (medicamento_id, tipo, cantidad, motivo, usuario_id) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, 'entrada', cantidad, req.body.motivo || 'Ingreso manual', req.user.id]
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Error en entrada' });
  } finally {
    conn.release();
  }
});

// POST /api/medicamentos/:id/salida  { cantidad, motivo }
router.post('/:id/salida', async (req, res) => {
  const cantidad = Number(req.body.cantidad);
  if (!cantidad || cantidad <= 0) return res.status(400).json({ error: 'cantidad debe ser > 0' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[med]] = await conn.query('SELECT cantidad_pastillas, fecha_vencimiento FROM medicamentos WHERE id=? FOR UPDATE', [req.params.id]);
    if (!med) { await conn.rollback(); return res.status(404).json({ error: 'Medicamento no existe' }); }
    if (new Date(med.fecha_vencimiento) < new Date(new Date().toDateString())) {
      await conn.rollback();
      return res.status(400).json({ error: 'No se puede dar salida: medicamento vencido' });
    }
    if (med.cantidad_pastillas < cantidad) {
      await conn.rollback();
      return res.status(400).json({ error: `Stock insuficiente. Disponible: ${med.cantidad_pastillas}` });
    }
    await conn.query('UPDATE medicamentos SET cantidad_pastillas = cantidad_pastillas - ? WHERE id = ?', [cantidad, req.params.id]);
    await conn.query(
      'INSERT INTO movimientos (medicamento_id, tipo, cantidad, motivo, usuario_id) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, 'salida', cantidad, req.body.motivo || 'Salida manual', req.user.id]
    );
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ error: 'Error en salida' });
  } finally {
    conn.release();
  }
});

module.exports = router;
