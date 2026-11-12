-- QuillaBus · modelo de datos (PostgreSQL). Basado en el documento de diseño UML.
CREATE TABLE IF NOT EXISTS usuarios(id serial PRIMARY KEY, nombre text NOT NULL, correo text UNIQUE NOT NULL, password_hash text NOT NULL,
  rol text NOT NULL CHECK(rol IN('ESTUDIANTE','CONDUCTOR','ADMIN')), licencia text, activo boolean NOT NULL DEFAULT true, creado_en timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rutas(id serial PRIMARY KEY, nombre text NOT NULL, color text NOT NULL DEFAULT '#00573F', activa boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS paradas(id serial PRIMARY KEY, nombre text NOT NULL, latitud double precision NOT NULL, longitud double precision NOT NULL, activa boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS ruta_parada(ruta_id int REFERENCES rutas ON DELETE CASCADE, parada_id int REFERENCES paradas ON DELETE CASCADE,
  orden int NOT NULL, minutos_desde_inicio int NOT NULL DEFAULT 0, PRIMARY KEY(ruta_id,parada_id), UNIQUE(ruta_id,orden));
CREATE TABLE IF NOT EXISTS buses(id serial PRIMARY KEY, placa text UNIQUE NOT NULL, capacidad int NOT NULL DEFAULT 40,
  estado text NOT NULL DEFAULT 'DISPONIBLE' CHECK(estado IN('DISPONIBLE','AVERIA','INACTIVO')));
CREATE TABLE IF NOT EXISTS recorridos(id serial PRIMARY KEY, conductor_id int NOT NULL REFERENCES usuarios, bus_id int NOT NULL REFERENCES buses,
  ruta_id int NOT NULL REFERENCES rutas, hora_inicio timestamptz, hora_fin timestamptz,
  estado text NOT NULL CHECK(estado IN('PROGRAMADO','EN_CURSO','INTERRUMPIDO','FINALIZADO','CANCELADO')));
-- Regla de negocio: un solo recorrido «En curso» por conductor y por bus
CREATE UNIQUE INDEX IF NOT EXISTS uq_conductor_en_curso ON recorridos(conductor_id) WHERE estado='EN_CURSO';
CREATE UNIQUE INDEX IF NOT EXISTS uq_bus_en_curso ON recorridos(bus_id) WHERE estado='EN_CURSO';
CREATE TABLE IF NOT EXISTS ubicaciones(id bigserial PRIMARY KEY, bus_id int NOT NULL REFERENCES buses, recorrido_id int NOT NULL REFERENCES recorridos,
  latitud double precision NOT NULL, longitud double precision NOT NULL, velocidad double precision NOT NULL DEFAULT 0, registrada_en timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS ix_ubicaciones_bus_fecha ON ubicaciones(bus_id, registrada_en DESC);
-- Alerta: ACTIVA = activa y sin enviar · ENVIADA = enviada_en con fecha · DESACTIVADA = activa en false
CREATE TABLE IF NOT EXISTS alertas(id serial PRIMARY KEY, usuario_id int NOT NULL REFERENCES usuarios ON DELETE CASCADE, parada_id int NOT NULL REFERENCES paradas,
  ruta_id int NOT NULL REFERENCES rutas, minutos_antes int NOT NULL DEFAULT 3, activa boolean NOT NULL DEFAULT true, enviada_en timestamptz);
CREATE TABLE IF NOT EXISTS favoritos(id serial PRIMARY KEY, usuario_id int NOT NULL REFERENCES usuarios ON DELETE CASCADE,
  ruta_id int REFERENCES rutas, parada_id int REFERENCES paradas, CHECK((ruta_id IS NULL) <> (parada_id IS NULL)));
CREATE TABLE IF NOT EXISTS avisos(id serial PRIMARY KEY, admin_id int NOT NULL REFERENCES usuarios, titulo text NOT NULL, mensaje text NOT NULL,
  publicado_en timestamptz NOT NULL DEFAULT now(), vigente_hasta timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS tokens_push(id serial PRIMARY KEY, usuario_id int NOT NULL REFERENCES usuarios ON DELETE CASCADE, token text UNIQUE NOT NULL);
