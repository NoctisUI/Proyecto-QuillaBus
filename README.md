# QuillaBus

Aplicación completa de rastreo de buses universitarios en Barranquilla.

- **Repositorio:** <https://github.com/NoctisUI/Proyecto-QuillaBus>
- **Código, API, app web y documentación:** [`quillabus-backend/`](quillabus-backend/README.md)
- **App local:** <http://localhost:3000> después de `npm start`
- **Despliegue en Render:** el archivo [`render.yaml`](render.yaml) de esta raíz ya configura el servicio y la base PostgreSQL. La carpeta `quillabus-backend` se toma como directorio raíz del servicio. También puedes abrir directamente el [flujo de Blueprint en Render](https://render.com/deploy?repo=https://github.com/NoctisUI/Proyecto-QuillaBus).

## Arranque rápido

```powershell
cd quillabus-backend
npm install
npm run build
npm run setup
npm start
```

Cuentas demo locales (clave `Quilla2026!`): `estudiante@universidad.edu.co`, `conductor@universidad.edu.co`, `admin@universidad.edu.co`.

Para desplegar, abre el [flujo de Blueprint en Render](https://render.com/deploy?repo=https://github.com/NoctisUI/Proyecto-QuillaBus) y autoriza el repositorio. Render genera `JWT_SECRET` y `DEMO_PASSWORD`; copia el valor de `DEMO_PASSWORD` desde el panel de variables de entorno para iniciar sesión como administrador.

Consulta la [documentación completa](quillabus-backend/README.md) para GPS, Firebase, Railway, endpoints y solución de problemas.
