-- =============================================
-- Sistema de Farmacia - Base de datos MySQL
-- =============================================
CREATE DATABASE IF NOT EXISTS farmacia CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE farmacia;

-- ---------- Tabla de usuarios (login) ----------
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin','farmaceutico','cajero') NOT NULL DEFAULT 'farmaceutico',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- Categorías de medicamentos ----------
CREATE TABLE IF NOT EXISTS categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion VARCHAR(255) NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- Medicamentos ----------
CREATE TABLE IF NOT EXISTS medicamentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  gramaje VARCHAR(50) NULL COMMENT 'Ej: 500mg, 1g, 250mg/5ml',
  descripcion TEXT NULL,
  cantidad_pastillas INT NOT NULL DEFAULT 0 CHECK (cantidad_pastillas >= 0),
  fecha_vencimiento DATE NOT NULL,
  categoria_id INT NULL,
  precio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  stock_minimo INT NOT NULL DEFAULT 10,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_med_categoria FOREIGN KEY (categoria_id)
    REFERENCES categorias(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_med_nombre (nombre),
  INDEX idx_med_gramaje (gramaje),
  INDEX idx_med_vencimiento (fecha_vencimiento),
  INDEX idx_med_categoria (categoria_id)
) ENGINE=InnoDB;

-- Migración para BD ya creadas (ejecutar una vez):
-- ALTER TABLE medicamentos ADD COLUMN gramaje VARCHAR(50) NULL COMMENT 'Ej: 500mg, 1g, 250mg/5ml' AFTER nombre;

-- ---------- Movimientos de inventario (entradas / salidas) ----------
CREATE TABLE IF NOT EXISTS movimientos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  medicamento_id INT NOT NULL,
  tipo ENUM('entrada','salida') NOT NULL,
  cantidad INT NOT NULL CHECK (cantidad > 0),
  motivo VARCHAR(255) NULL,
  usuario_id INT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mov_medicamento FOREIGN KEY (medicamento_id)
    REFERENCES medicamentos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_mov_med (medicamento_id),
  INDEX idx_mov_tipo (tipo),
  INDEX idx_mov_fecha (creado_en)
) ENGINE=InnoDB;

-- ---------- Recetas médicas (archivos subidos) ----------
CREATE TABLE IF NOT EXISTS recetas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  paciente_nombre VARCHAR(150) NOT NULL,
  medico_nombre VARCHAR(150) NULL,
  archivo_path VARCHAR(255) NOT NULL,
  archivo_original VARCHAR(255) NULL,
  medicamento_id INT NULL,
  usuario_id INT NULL COMMENT 'usuario que subió la receta',
  estado ENUM('pendiente','dispensada','rechazada') NOT NULL DEFAULT 'pendiente',
  observaciones TEXT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rec_med FOREIGN KEY (medicamento_id)
    REFERENCES medicamentos(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_rec_user FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_rec_estado (estado)
) ENGINE=InnoDB;

-- =============================================
-- Datos iniciales
-- =============================================
INSERT INTO categorias (nombre, descripcion) VALUES
('Analgésicos','Alivio del dolor'),
('Antibióticos','Combate infecciones bacterianas'),
('Antiinflamatorios','Reducen inflamación'),
('Vitaminas','Suplementos vitamínicos'),
('Antihipertensivos','Control de presión arterial'),
('Antidiabéticos','Control de glucosa')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

-- Usuario admin: regístrate desde el frontend o vía API:
-- POST /api/auth/register { "nombre":"Administrador", "email":"admin@farmacia.cl", "password":"admin123", "rol":"admin" }

INSERT INTO medicamentos (nombre, gramaje, descripcion, cantidad_pastillas, fecha_vencimiento, categoria_id, precio, stock_minimo) VALUES
('Paracetamol','500mg','Analgésico y antipirético. Caja x 20 comprimidos.',500, DATE_ADD(CURDATE(), INTERVAL 18 MONTH), 1, 1990.00, 50),
('Ibuprofeno','400mg','Antiinflamatorio no esteroideo.',300, DATE_ADD(CURDATE(), INTERVAL 12 MONTH), 3, 2490.00, 30),
('Amoxicilina','500mg','Antibiótico de amplio espectro. Requiere receta.',150, DATE_ADD(CURDATE(), INTERVAL 10 MONTH), 2, 4990.00, 20),
('Vitamina C','1g','Suplemento efervescente x 10 tabletas.',200, DATE_ADD(CURDATE(), INTERVAL 24 MONTH), 4, 3490.00, 25),
('Losartán','50mg','Antihipertensivo. Requiere receta.',120, DATE_ADD(CURDATE(), INTERVAL 8 MONTH), 5, 5990.00, 15);
