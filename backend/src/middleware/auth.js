const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cambia-este-secreto-farmacia-2026';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { signToken, authRequired, JWT_SECRET };
