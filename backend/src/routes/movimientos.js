const express = require('express');
const { pool } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// GET /api/movimientos?tipo=entrada&medicamento_id=1&limit=100
router.get('/', async (req, res) => {
  const { tipo, medicamento_id, limit } = req.query;
  let sql = `
    SELECT mv.*, m.nombre AS medicamento_nombre, m.gramaje AS medicamento_gramaje, u.nombre AS usuario_nombre
    FROM movimientos mv
    JOIN medicamentos m ON m.id = mv.medicamento_id
    LEFT JOIN usuarios u ON u.id = mv.usuario_id
    WHERE 1=1`;
  const params = [];
  if (tipo === 'entrada' || tipo === 'salida') { sql += ' AND mv.tipo=?'; params.push(tipo); }
  if (medicamento_id) { sql += ' AND mv.medicamento_id=?'; params.push(medicamento_id); }
  sql += ' ORDER BY mv.creado_en DESC LIMIT ?';
  params.push(Math.min(Number(limit || 100), 500));
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// GET /api/dashboard/resumen
router.get('/resumen', async (_req, res) => {
  const [[totales]] = await pool.query(`
    SELECT COUNT(*) AS total_medicamentos,
           COALESCE(SUM(cantidad_pastillas),0) AS total_pastillas,
           SUM(CASE WHEN fecha_vencimiento < CURDATE() THEN 1 ELSE 0 END) AS vencidos,
           SUM(CASE WHEN cantidad_pastillas <= stock_minimo THEN 1 ELSE 0 END) AS bajo_stock,
           SUM(CASE WHEN fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS por_vencer_7d,
           SUM(CASE WHEN fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY) THEN 1 ELSE 0 END) AS por_vencer_90d
    FROM medicamentos`);
  const [proxVencer] = await pool.query(`
    SELECT id, nombre, gramaje, cantidad_pastillas, fecha_vencimiento, DATEDIFF(fecha_vencimiento, CURDATE()) AS dias
    FROM medicamentos WHERE fecha_vencimiento >= CURDATE() ORDER BY fecha_vencimiento ASC LIMIT 8`);
  // Alerta crítica: vencidos + vencen en ≤ 7 días (se muestra al ingresar al sistema)
  const [alerta] = await pool.query(`
    SELECT id, nombre, gramaje, cantidad_pastillas, fecha_vencimiento,
           DATEDIFF(fecha_vencimiento, CURDATE()) AS dias,
           CASE WHEN fecha_vencimiento < CURDATE() THEN 'vencido' ELSE 'por_vencer' END AS estado_alerta
    FROM medicamentos
    WHERE fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
    ORDER BY fecha_vencimiento ASC LIMIT 20`);
  const [ultimos] = await pool.query(`
    SELECT mv.*, m.nombre AS medicamento_nombre, m.gramaje AS medicamento_gramaje FROM movimientos mv
    JOIN medicamentos m ON m.id=mv.medicamento_id ORDER BY mv.creado_en DESC LIMIT 10`);
  res.json({ ...totales, proximos_vencer: proxVencer, alerta_expiracion: alerta, ultimos_movimientos: ultimos });
});

module.exports = router;
