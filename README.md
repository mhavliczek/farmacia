# 💊 Sistema de Farmacia — Inventario + Recetas

Sistema completo con **MySQL + Node/Express + Frontend estilo shadcn**.

## Funciones
- **Login** con tabla `usuarios` (roles: admin, farmaceutico, cajero). Contraseñas con bcrypt + JWT.
- **Medicamentos**: nombre, gramaje (Ej: 500mg, 1g), descripción, cantidad (pastillas), fecha de vencimiento, categoría, stock mínimo.
- **Inventario**: entradas y salidas con validación de stock y bloqueo si está vencido. Tabla `movimientos` (kardex).
- **Recetas médicas**: subida de JPG/PNG/WEBP/PDF (10 MB), estados pendiente/dispensada/rechazada.
- **Dashboard**: totales, bajo stock, vencidos, próximos a vencer.
- **Alerta de vencimiento**: banner permanente + modal automático al ingresar si hay medicamentos vencidos o que vencen en ≤ 7 días (`GET /api/dashboard/resumen` → `alerta_expiracion`).

## Estructura
```
farmacia/
├── database.sql          # BD MySQL completa + datos de ejemplo
├── backend/              # API Express (puerto 4000)
│   ├── src/server.js
│   ├── src/db.js
│   ├── src/routes/       # auth, categorias, medicamentos, movimientos, recetas
│   └── uploads/recetas/  # archivos subidos
└── frontend/             # UI estilo shadcn (Tailwind)
    ├── index.html
    └── app.js
```

## 1. Base de datos MySQL
Necesitas MySQL 8 corriendo.

```bash
# crear BD y tablas
mysql -u root -p < database.sql

# verificar
mysql -u root -p -e "USE farmacia; SHOW TABLES; SELECT * FROM categorias;"
```

Tablas: `usuarios`, `categorias`, `medicamentos`, `movimientos`, `recetas`.

## 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# edita .env con tu usuario/clave de MySQL
# DB_USER=root DB_PASSWORD=tu_clave DB_NAME=farmacia JWT_SECRET=...

npm run dev
# API en http://localhost:4000
# health: GET http://localhost:4000/api/health
```

### Endpoints principales
- `POST /api/auth/register` {nombre, email, password, rol}
- `POST /api/auth/login` {email, password} → {user, token}
- `GET /api/categorias` / `POST /api/categorias`
- `GET /api/medicamentos?q=&categoria_id=&vencidos=1&bajo_stock=1`
- `POST /api/medicamentos` {nombre, descripcion, cantidad_pastillas, fecha_vencimiento, categoria_id, stock_minimo}
- `POST /api/medicamentos/:id/entrada` {cantidad, motivo}
- `POST /api/medicamentos/:id/salida` {cantidad, motivo}
- `GET /api/movimientos?tipo=entrada`
- `GET /api/dashboard/resumen`
- `GET /api/recetas` / `POST /api/recetas` (multipart `archivo`) / `PATCH /api/recetas/:id`

Usa header `Authorization: Bearer <token>` en rutas protegidas.

## 3. Frontend (estilo shadcn)
Sin build. Solo abre el archivo o sírvelo:

```bash
cd frontend
# opción A: doble clic en index.html
# opción B (recomendada):
npx serve . -l 5500
# abre http://localhost:5500
```

En `frontend/app.js` la constante `API` apunta a `http://localhost:4000`. Si cambias el puerto, edítala.

### Uso
1. Abre el frontend → **Registrarse** → crea `admin@farmacia.cl / admin123` rol admin.
2. Inicia sesión.
3. Crea categorías, luego medicamentos.
4. Prueba **+ Entrada / − Salida**.
5. Sube una receta en **Recetas médicas** y cámbiala a Dispensada.

## Notas
- Los archivos de recetas se guardan en `backend/uploads/recetas/` y se sirven en `/uploads/...`.
- La salida bloquea medicamentos vencidos y stock insuficiente.
- Si `npm run dev` dice "No se pudo conectar a MySQL", revisa que MySQL esté corriendo y los datos del `.env`.
