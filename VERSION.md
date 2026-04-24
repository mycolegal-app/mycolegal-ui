# mycolegal-ui — Version History

> Formato: `VV.vv.rr` — misma versión que la plataforma.
> Solo se registran las versiones en las que este repo tiene cambios.

---

## 2.0.0 — Versión con BD unificada entre apps e integración inicial con DocFilling (2026-04-23)

Type: **major**




## 1.20.0 — Manual: aside del índice fijo y más aire entre secciones + consolida DocFillingModal (2026-04-22)

Type: **minor**

Este tag consolida dos líneas de trabajo que corrieron en paralelo:

**Manual layout (este repo, continuación de la serie 1.10.x):**
- El aside con el índice del manual ya no hace scroll con la página: el layout del manual es una shell de altura fija (`h-[calc(100vh-8rem)]`, mismo patrón que otras pantallas full-height de la plataforma) y el scroll vive solo en la columna derecha de contenido. El topbar y la línea de breadcrumb permanecen fijos. El índice tiene scroll interno propio si crece.
- Contenido con más respiración: se aumenta la separación entre secciones (`space-y-8` efectivo a 3.5rem), se añade margen inferior a h2/h3 y `scroll-mt` a las secciones para que los anclas no queden pegados al borde.

**DocFillingModal (integrado desde publicaciones puntuales 1.1.0 y 1.2.0 hechas desde otra máquina):**
- Nuevo componente `components/docfilling/DocFillingModal.tsx` — modal de 4 fases (selección de plantilla → revisión de campos → polling de generación → resultado).
- Conecta a `/api/inter/*` de `mycolegal-docfilling` vía `X-Service-Key`.
- Refinado a fases con source docs y pre/post acciones más campos incompletos.

**Nota sobre numeración**: el remoto publicó 1.1.0 y 1.2.0 en paralelo con esta serie 1.10.x. Para evitar colisiones y dejar claro que este tag supera ambos, saltamos a 1.20.0.




## 1.10.0 — Versión con gestor de documentos requeridos por CCAAs y ajustes en la visualización UI (2026-04-22)

Type: **minor**




## 1.8.0 — Activación de RESEND para envío genérico de mails desde mail.mycolegal.app (2026-04-17)

Type: **minor**




## 1.7.0 — Version con audit de sesiones (2026-04-17)

Type: **minor**




## 1.5.1 — Bug con el timeout de inactividad de sesión de usuario (2026-04-16)

Type: **revision**




## 1.5.0 — Configuración de RESEND para servidor genérico de correo de la plataforma (2026-04-16)

Type: **minor**




## 1.4.2 — Selector de aplicaciones en Header y cambios estéticos UI (2026-04-15)

Type: **revision**




## 1.4.1 — Bug fixes (borrado de organizaciones desde admin y otros errores menores) (2026-04-15)

Type: **revision**




## 1.4.0 — Muestra versiones desplegadas en la pantalla de login (2026-04-15)

Type: **minor**




## 1.3.1 — Ajustes menores en los casos de test e2e (2026-04-15)

Type: **revision**




## 1.3.0 — Versión con mejoras UI (nuevos componentes compartidos: header con selector de apps) y con timeout de sesión de usuario (2026-04-14)

Type: **minor**



