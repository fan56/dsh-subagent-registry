---
name: dsh-subagent-registry-config
description: "Guía de subagentes de dsh: use_agent/ask_agent, /registry-config, directorio agents, agent .md, reanudación; config: frontmatter de ~/.dsh/agents/*.md, entry config (agentsDir…/language/disabledAgents/ptcEnabled/jev*), agentes opcionales (ptc-subagent/minimal-subagent; experimentales, desactivados por defecto), asistente ask_user_question, diagnóstico. Activadores: subagente, agent, /registry-config, desactivar, disabledAgents, ptc, codemode, reanudar, depurar, no se invoca, idioma."
---

# Guía de dsh-subagent-registry (subagentes personalizados / use_agent)

> Plugin de dsh: registra `~/.dsh/agents/*.md` como subagentes personalizados que se pueden lanzar —
> `use_agent` lanza por nombre, `ask_agent` hace una pregunta de seguimiento a una ejecución en segundo
> plano y espera su respuesta, y una ejecución interrumpida se reanuda automáticamente
> cuando se vuelve a invocar. Cada subagente es una sesión real de dsh (sesión completa,
> persistencia, continuable) que se ejecuta sobre el proveedor `spawn` integrado en dsh; el
> plugin no modifica dsh en sí.

## Compatibilidad con dos hosts

El mismo paquete del plugin se ha verificado con los SDK publicados reales de DSH `0.2.0-rc.2` y `0.2.1-rc.2` (líneas RC/estable; la línea alfa no es compatible). El método de lanzamiento se elige automáticamente según la API pública (detección de funcionalidades): en la línea antigua, `start` en primer plano y `startContinuable` en segundo plano; en la línea nueva, `startActivation` con entrega `caller` en primer plano y `parent` en segundo plano, y la persona y las restricciones de herramientas de hoja se instalan en el ámbito propio del subagente en el punto `subagent/start`. Si una llamada a la interfaz falla, devuelve un error de inmediato — el lanzamiento nunca se reintenta a través de la otra interfaz. La reanudación y las preguntas de seguimiento leen cada una el formato de sesión de su propio host; no se ofrece migración entre versiones. El host debe montar la persistencia de sesiones y `sessionQuery`; las instrucciones de delegación de roles en inglés mantienen la misma redacción en ambas líneas.

## Formato de definición de agentes (`<agentsDir>/<name>.md`)

Un archivo markdown es un agente: el frontmatter `---` contiene los metadatos y el cuerpo se usa **literalmente** como persona (prompt de sistema) de ese subagente. Todas las claves del frontmatter:

| Clave | Obligatoria | Predeterminado | Descripción y comportamiento ante fallos |
| -------------- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `name` | sí | — | id del agente = nombre del archivo (sin .md). Si falta o está vacío → **se descarta el archivo entero**. |
| `deep` | no | `1` | Entero no negativo. `0` = hoja (puede trabajar, pero no puede lanzar subagentes); `≥1` = presupuesto de profundidad relativa que permite volver a lanzar. Si no es entero o es negativo → se descarta el archivo entero. |
| `display_name` | no | ausente | Etiqueta opcional de la interfaz; el subagente se etiqueta como `display_name ?? name`, y la reanudación y las preguntas de seguimiento localizan con ella las ejecuciones anteriores. |
| `description` | no | ausente | Descripción de una línea que aparece en la lista de agentes de la descripción de la herramienta `use_agent`, para que el modelo principal elija un agente. |
| `model` | no | ausente = heredar | Ruta `provider/model`; un valor sin barra se trata como nombre de proveedor + el modelo predeterminado de ese despliegue. |
| `thinking` | no | ausente = heredar | `off`/`low`/`medium`/`high`/`max`, **distingue mayúsculas y minúsculas**; cualquier otro valor → se descarta el archivo entero. |
| `background` | no | ausente = primer plano | Estrictamente `true`/`false` (distingue mayúsculas y minúsculas, sin abreviaturas); cualquier otro valor → se descarta el archivo entero. `true` = se lanza en segundo plano por defecto y admite preguntas de seguimiento con ask_agent. |
| `maxRounds` | no | ausente = global | Entero positivo, límite de rondas por agente (prevalece sobre el valor global `dsh-tui.maxRounds`); si no es un entero positivo → se descarta el archivo entero. Lo consume la escalera de parada forzosa de la TUI del host. |

Plantilla mínima:

```markdown
---
name: my-agent
display_name: Mi agente
description: "Descripción de una línea que aparece en la lista de use_agent"
model: opencode-go/deepseek-v4-flash
thinking: high
deep: 0
---

Eres my-agent. Este cuerpo markdown se usa literalmente como prompt de sistema.
```

Nota: **las claves desconocidas se ignoran sin avisar** — `extensions` / `tools` / `color`, etc. no tienen ningún efecto (aquí no se admite la convención `extensions` de fun-agent); mantenerlas solo confunde a quien lea el archivo más adelante.

## Asistente de configuración interactivo (ask_user_question)

Cuando el usuario diga «créame un subagente XX / añade un agente», no le sueltes la documentación — usa `ask_user_question` para recoger las respuestas pregunta a pregunta y luego **escribe tú el archivo**:

1. **Nombre + responsabilidad**: un nombre en kebab-case (= nombre del archivo) y una `description` de una frase (va a la lista de agentes de use_agent; indica con claridad cuándo hay que lanzarlo).
2. **Modelo**: heredar el predeterminado del despliegue (recomendado, dejar vacío) / indicar una ruta `provider/model`.
3. **Nivel de razonamiento (thinking)**: sin definir (heredar el predeterminado) / off / low / medium / high / max.
4. **Profundidad de lanzamiento**: `deep: 0` (hoja, no puede crear subagentes) / `deep: 1` (predeterminado, puede volver a lanzar).
5. **Primer o segundo plano**: puntual en primer plano (predeterminado) / `background: true` (sesión continua en segundo plano; la conversación principal no se bloquea y `ask_agent` puede hacerle preguntas de seguimiento).

Cuando tengas las respuestas, genera `<agentsDir>/<name>.md` y escríbelo en el directorio de agentes (redacta el cuerpo como un prompt de sistema de persona a partir de la descripción del usuario, **úsalo literalmente**, no lo parafrasees), y dile al usuario cuándo se aplica:

- **Un archivo nuevo se puede invocar por nombre de inmediato** — `use_agent` vuelve a leer los archivos del disco al ejecutarse. Abre «Subagentes» en la navegación izquierda de la web o actualiza manualmente; la lista de agentes de la herramienta se sincroniza en las siguientes peticiones al modelo, sin necesidad de reiniciar; guardar o eliminar desde la página también la actualiza automáticamente. En CLI/TUI puros, sin la página web de gestión, la lista de agentes se actualiza en el siguiente montaje del plugin.
- **Los cambios en archivos existentes** (cuerpo, frontmatter) se aplican en la siguiente llamada a `use_agent`, sin necesidad de reiniciar.

## Configuración propia del plugin (entry config)

El plugin no tiene espacio de nombres de ajustes; su configuración cuelga del **bloque de montaje del parche que lo carga** (la sección `config:` de la entrada `insert` del cordis.patch.yml del bundle, es decir, la configuración de entrada o entry config). Nueve claves de registro más seis claves jev (la capacidad ptc, que se explica más abajo) más cinco claves agy (experimentales, desactivadas por defecto; véase más abajo):

```yaml
- insert:
    - id: dsh-subagent-registry
      name: '@aiwayds/dsh-subagent-registry'
      config:
        agentsDir: ~/.dsh/agents   # directorio de archivos de agentes; solo este literal predeterminado se resuelve respecto a $DSH_HOME, las rutas personalizadas se usan tal cual (con ~ expandido)
        provider: spawn            # proveedor de subagentes con el que se ejecutan los hijos (reutiliza el spawn de dsh-base)
        toolName: use_agent        # nombre de la herramienta de lanzamiento
        askToolName: ask_agent     # nombre de la herramienta de preguntas de seguimiento
        # leafDenyTools: []        # herramientas denegadas a los hijos hoja deep:0; vacía = valor estático predeterminado (herramientas de lanzamiento integradas de dsh + toolName) intersecado con las herramientas registradas en el host; si no está vacía, se pasa tal cual (sin intersección)
        resume: auto               # auto | opt-in | off
        language: zh               # zh | en | ru | es (zh por defecto), consulta «Cambiar el idioma del plugin» más abajo
        disabledAgents: []         # interruptor de la lista de agentes: nombres de agentes que se desactivan (se ocultan de la lista y se rechazan sus llamadas; los archivos no se tocan)
        ptcEnabled: false          # opcional: interruptor de la cadena de herramientas codemode (jev + store); false no registra ninguna herramienta adicional
        # jevEnabled: false        # interruptor general de jev (desactivado por defecto: cero llamadas a jev)
        # jevBackend: zen          # zen | native | openrouter
        # jevModel: ''             # id de modelo fijado; vacío = el predeterminado del backend en el momento de la llamada
        # jevTimeoutMs: 3000       # plazo máximo por cada classify; una sola señal, sin reintentos
        # jevSecretFile: ''        # lista de literales del filtro de secretos salientes (uno por línea)
        # storageDir: ''           # directorio del registro de uso (usage sink); vacío = <dsh home>/storages/ptc-subagent
        # --- miembro agy experimental (desactivado por defecto; véase "Experimental: agy" más abajo) ---
        # agyEnabled: false        # interruptor general (no volátil): true = registrar el proveedor ACP; 'agy' en use_agent, no en ask_agent
        # agyPermission: reject    # 'allow' | 'reject': cómo responder a las solicitudes de permiso ACP de agy; 'reject' = no responder por el usuario
        # agyTimeoutMs: 600000     # plazo máximo por tarea tras el handshake (ms)
        # agyHandshakeTimeoutMs: 20000 # plazo de initialize + session/new (ms)
        # agyMaxConcurrent: 1      # ejecuciones agy simultáneas por proceso dsh; la 2.ª falla de inmediato con ACP_BUSY (sin cola)
```

| Clave | Predeterminado | Descripción |
| --------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| `agentsDir` | `~/.dsh/agents` | Solo el literal predeterminado se resuelve respecto a `$DSH_HOME` (es decir, `$DSH_HOME/agents`); un valor personalizado se usa **tal cual** tras expandir `~`, sin volver a anclarlo al directorio home de dsh. |
| `provider` | `spawn` | Proveedor de subagentes. |
| `toolName` | `use_agent` | Nombre de la herramienta de lanzamiento; si usas un nombre personalizado, la lista de denegación de las hojas lo sigue automáticamente. |
| `askToolName` | `ask_agent` | Nombre de la herramienta de preguntas de seguimiento. |
| `leafDenyTools` | `[]` | Vacía = valor estático predeterminado (`subagent`/`subagent_fork`/`workflow`/`ralph` + `toolName`) ∩ las herramientas registradas actualmente en el host (evita que nombres obsoletos disparen el fail-fast del host); si no está vacía, se **pasa tal cual**, sin intersección, y la validación del host rechaza las entradas obsoletas. |
| `resume` | `auto` | Modo de reanudación; consulta la sección siguiente. |
| `language` | `zh` | Idioma de la interfaz, de la guía y de las plantillas de agentes incluidas: `zh` / `en` / `ru` / `es`; reinicia dsh tras cambiarlo; consulta la sección siguiente. |
| `disabledAgents` | `[]` (volátil) | El interruptor de la lista de agentes: los nombres incluidos desaparecen de las listas de `use_agent`/`ask_agent`; la ruta de ejecución vuelve a comprobar el valor vigente y rechaza las llamadas que los nombran explícitamente. **La semántica de desactivación está en esta clave de configuración, no en el frontmatter** — los archivos de agentes nunca se modifican. Una escritura volátil se aplica en caliente (junto con la actualización de la lista); el comando `/registry-config` la escribe por ti. |
| `ptcEnabled` | `false` | El interruptor de la cadena de herramientas codemode: false no registra nada adicional; true registra la herramienta `codemode` en ámbito permanente (standing scope) en el siguiente montaje del plugin (reinicio de dsh). Las seis claves jev son volátiles y se leen en cada llamada. |

## El comando /registry-config (interruptor de la lista de agentes + instalaciones opcionales)

Escribe `/registry-config` en la sesión para abrir el asistente de gestión (dos preguntas de selección múltiple mediante ask_user_question):

1. **Interruptor de desactivación**: marca los agentes que quieras desactivar (el conjunto marcado PASA A SER la nueva lista `disabledAgents`; sin nada marcado = todos activados; los nombres que ya están desactivados deben SEGUIR marcados para continuar desactivados — las descripciones de las opciones indican el estado actual). Desactivar solo oculta un agente de la lista y rechaza las llamadas por nombre — **los archivos de agentes nunca se modifican**.
2. **Instalaciones opcionales**: marca los agentes opcionales que quieras instalar — `ptc-subagent` (el especialista en trabajo de decisión por lotes; vinculado a `ptcEnabled`) y `minimal-subagent` (el ejecutor que solo usa el terminal; sin vínculo con la configuración). ⚠️ Ambos están marcados como **Experimental: desactivado por defecto** — la capacidad ya se ha migrado e integrado, pero la parte visible del producto sigue siendo experimental hasta que se estabilice, y no se activa nada hasta que lo marques explícitamente o escribas las claves de configuración. La instalación copia `templates/opt-in-agents/<language>/<name>.md` del paquete al directorio de agentes (un archivo existente nunca se sobrescribe; desmarcar nunca elimina un archivo copiado). Seleccionar `ptc-subagent` establece `ptcEnabled: true`; deseleccionarlo lo revierte (escribe false y aparca ptc-subagent en `disabledAgents`, conservando el archivo).

Momento de aplicación: `disabledAgents` es volátil — la escritura se aplica en caliente y el comando actualiza la lista de agentes al terminar; un cambio en `ptcEnabled` se aplica en el siguiente montaje del plugin (reinicio de dsh), que registra o retira la herramienta codemode. En un despliegue headless, sin interfaz (no hay panel de preguntas — la pregunta se rechaza con NO_PROVIDER), el comando se degrada a un mensaje de error con los pasos manuales (las claves `disabledAgents` / `ptcEnabled` y la ruta desde la que copiar la plantilla).

## La capacidad ptc (opcional: la herramienta codemode)

Desde la 0.18.0, este paquete incluye todo el antiguo `@aiwayds/dsh-ptc-subagent`: la herramienta `codemode` (la vinculación de decisión jev + la vinculación store con ámbito de sesión sobre el punto de extensión público `ctx.ptcRuntime`) se registra detrás del interruptor `ptcEnabled` y, una vez registrada, es visible para el agente principal Y para todos los subagentes lanzados (ámbito permanente, como en el plugin independiente). Todo viene desactivado por defecto (`jevEnabled: false` = cero llamadas a jev). `jev.classify` responde en una sola llamada a un lote de preguntas choice/score/noul y devuelve resultados estructurados `{error}` en lugar de rechazar; `store` es una memoria clave/valor con ámbito de sesión que se apoya en el registro duradero de la sesión (256 KB por valor / 1 MB por rama). Cada llamada a jev (incluidos los fallos) añade una fila a `<dsh home>/storages/ptc-subagent/usage.jsonl` (solo metadatos y recuentos de tokens). Desde la 0.19.1, el parche del bundle solo incluye las dos filas de preajuste protegidas (preset-native / preset-codemode, que se desactivan automáticamente en los perfiles que seleccionan @deepseek-ai/dsh-web-app); las dos filas de servicio (agent-preset-registry / subagent-model-selection-settings) se montan en tiempo de ejecución sobre el árbol de include, solo donde no existe una entrada con el mismo id, de modo que un perfil que ya monta una capa agent-preset no necesita eliminar duplicados a mano (issue #9, consulta docs/TROUBLESHOOTING-PRESET-ROWS.md).

### Límites de concurrencia y profundidad (dsh 0.1.7+, gestionados oficialmente)

El número de subagentes activos a la vez y la profundidad de anidamiento los gestiona el **servicio oficial dsh-subagent** (el plugin no mantiene ningún contador ni cola de concurrencia propios): `maxActiveSubagents` (por defecto `8`) y `maxDepth` (por defecto `1`), ambos campos volátiles que se pueden ajustar en caliente sin reiniciar. Cuando el usuario quiera «varios subagentes en paralelo / más niveles de anidamiento», escribe `subagent: { maxActiveSubagents: N, maxDepth: M }` en un parche de perfil o llama a `settings.update('subagent', …)` en tiempo de ejecución; el `deep` de un archivo de agente solo restringe dentro de este presupuesto oficial (a las hojas `deep: 0` se les quitan directamente las herramientas de lanzamiento). `maxRounds` (límite de rondas por agente) sigue siendo una clave frontmatter de este plugin — la interfaz oficial no ofrece presupuesto de rondas, así que lo sigue consumiendo la escalera de parada forzosa de la TUI del host.

## Experimental: `agy` con la cuota del plan Gemini (desactivado por defecto)

> ⚠️ **Experimental — desactivado por defecto**: esta sección solo aplica cuando
> `agyEnabled: true`; con el valor predeterminado, nada cambia para los usuarios
> existentes.

`agy` es la CLI de Antigravity. Con el interruptor activado, el plugin usa su
propio cliente ACP para conectarse directamente al `agy acp` local y usar la
**cuota del plan Google Gemini AI Pro**: sin depender de ningún perfil, sin
consumir cuota de DeepSeek, y el uso de agy **no entra** en la contabilidad de uso
de dsh. `agy` aparece solo en la lista de `use_agent`, **no en `ask_agent`** (que
hace preguntas de seguimiento a subagentes dsh en segundo plano). Si existe
`~/.dsh/agents/agy.md`, la lista muestra ese archivo de agente normal y no el agy
integrado.

Cómo activarlo/desactivarlo: en la sesión, escribe `/registry-config` y marca
«agy (Gemini · experimental)» en la pregunta opcional para escribir
`agyEnabled: true` (desmarcar escribe `false`); el cambio se aplica en el siguiente
montaje del plugin (reinicio de dsh). Una vez activado, también puedes marcar agy en
la pregunta de desactivación para retirarlo de la lista (`disabledAgents`, se aplica
en caliente y no toca archivos). Si el asistente no se puede abrir (sin interfaz de
preguntas), edita a mano la sección `config:` de la fila del plugin en
`~/.dsh/profiles/<profile>/cordis.patch.yml`: añade `agyEnabled: true` y reinicia
dsh. Claves (en esa misma sección `config:`): `agyEnabled` (por defecto `false`, no
volátil), `agyPermission` (por defecto `reject`), `agyTimeoutMs` (`600000`),
`agyHandshakeTimeoutMs` (`20000`), `agyMaxConcurrent` (`1`); las cuatro últimas son
volátiles y se leen en cada llamada, solo `agyEnabled` requiere reinicio al cambiar.

Limitaciones (tal cual, no son TODO ni defectos):

- **Solo primer plano, sin reanudación**: `background` / `resume` / `fresh` fallan
  con `ACP_FOREGROUND_ONLY`; vuelve a enviar la tarea, no la reanudes.
- **Concurrencia 1**: la segunda llamada falla de inmediato con `ACP_BUSY` (sin
  cola); envía las tareas de una en una.
- **El resultado solo se devuelve cuando termina el proceso agy**: tiempo de la
  tarea más la espera de salida, hasta ~9 s; la primera llamada tarda ~20–30 s
  (arranque en frío ~20 s).
- **No está en el panel de subagentes y no se puede interrumpir desde él**: la
  ejecución externa no tiene una sesión dsh local; pulsa Esc para cancelar la
  llamada de herramienta actual.
- **Requiere `agy` instalado y con sesión iniciada en la máquina**: si no está o
  no ha iniciado sesión → no aparece en la lista o el diagnóstico `ACP_AUTH_REQUIRED`.
- Plataforma: macOS / Linux (Windows sin verificar).

Seguridad: los permisos reales de agy los decide la **configuración del propio agy
local** (la máquina puede estar en `always-proceed`, en cuyo caso no envía ninguna
solicitud de permiso). El plugin solo reenvía las solicitudes de permiso ACP y las
responde según `agyPermission`; **no limita lo que agy puede hacer**. Enviarlo a un
directorio significa que se ejecutan los hooks de ese directorio; trata los
escenarios de solo revisión como de alto riesgo.

## Cambiar el idioma del plugin (language)

El plugin incluye cuatro idiomas: `zh` (chino, el predeterminado), `en` (inglés), `ru` (ruso) y `es` (español), que se eligen con la clave `language` de la entry config.

- Cómo cambiarlo: establece `language` en `zh` / `en` / `ru` / `es` en la configuración del plugin (cordis.patch.yml o los ajustes del plugin en la web) y reinicia dsh para que se aplique.
- Alcance: los textos del panel web de gestión, esta guía (el cuerpo correspondiente y la descripción de enrutamiento dirigida al modelo) y las plantillas de agentes que se crean en la primera instalación (`templates/agents/<language>/`).
- Los archivos de agentes existentes nunca se reescriben: para cambiar el idioma de los agentes existentes, edita directamente `~/.dsh/agents/*.md`, o vacía el directorio de agentes y deja que la creación inicial lo vuelva a generar en el nuevo idioma.
- Cuando el usuario pregunte cómo cambiar la interfaz a inglés, ruso o español: explícale los pasos anteriores, o edita la configuración por él y recuérdale que reinicie. Palabras clave: idioma, idioma de la interfaz, cambiar idioma, language.

## Reanudación y preguntas de seguimiento

- **Los tres modos de reanudación**: `auto` (predeterminado) = si este agente tiene una ejecución interrumpida en esta conversación, se reanuda automáticamente; `opt-in` = solo se reanuda cuando la llamada pasa explícitamente `resume: true`; `off` = nunca se reanuda automáticamente (un `resume: true` explícito del llamante aún puede forzar la reanudación). `fresh: true` hace lo contrario — fuerza un inicio completamente nuevo. A nivel de parámetros de la herramienta, `resume` y `fresh`, así como `background` y `resume`, son mutuamente excluyentes.
- **Detección de ejecuciones interrumpidas**: se basa en el **último `turn/end` de contabilidad** del registro de eventos persistido del subagente — cualquier valor distinto de `completed` (error / aborted / max-tokens / caída sin registro) significa que la ejecución se interrumpió y se puede reanudar. Una reanudación reutiliza la misma combinación de persona/modelo/herramientas y avanza exactamente un turno de continuación; los fallos se pueden reanudar una y otra vez, y el progreso se sigue acumulando. La reanudación depende de la persistencia de sesiones; los fallos al leer, reclamar o restaurar una ejecución anterior ya seleccionada se notifican como errores, nunca se crea automáticamente una segunda tarea, y solo un `fresh: true` explícito vuelve a lanzar.
  Las nuevas ejecuciones en primer plano de la línea de activación usan la etiqueta con prefijo corto `[fg] <display_name ?? name>` (la v0.14.0 usaba el prefijo largo `[use_agent foreground] `, que se sigue reconociendo por compatibilidad); en la línea antigua, el primer plano sigue siendo una ejecución puntual con etiqueta simple. El segundo plano mantiene la etiqueta simple; las dos variantes de primer plano se pueden reanudar.
  Una entrada pendiente cancelada más tarde o un turno nuevo sin cerrar también cuentan como reanudables — no te fijes solo en un turno anterior completado.
  Las API públicas de las dos versiones compatibles aún no admiten la reanudación en frío gestionada con la composición actual y entrega solo al llamante (caller-only); la reanudación en primer plano la impulsa `agents.resume` y se puede detener cancelando la llamada, pero no ocupa las ranuras de concurrencia del gestor, no la controla `interrupt_agent` y no puede usar el `send_message` estándar para comunicarse con el padre. Los lanzamientos nuevos y las preguntas de seguimiento en segundo plano sí pasan por el gestor.
- **`ask_agent` está pensado para ejecuciones en segundo plano**: hace una pregunta de seguimiento a la ejecución en segundo plano más reciente y **espera su respuesta** (por nombre con `agent` o por el `agent_id` devuelto al lanzarla — pasa exactamente uno de los dos; límite opcional `timeout` en segundos, `≤0` se trata como si no se hubiera indicado). Una ejecución puntual en primer plano no admite preguntas de seguimiento — su reanudación pasa por el mecanismo de reanudación de `use_agent`.

## Diagnóstico de instalación y uso (debug)

Localiza el problema en tres pasos — «instalado → montado → conectado» — y luego revisa los rastros de uso. Sustituye `<profile>` por el nombre real del perfil (`tui` / `web` / `desktop` / `headless`…); los plugins y montajes de cada perfil son independientes.

### Paso 1: ¿está instalado? (¿está el paquete en el perfil?)

```sh
dsh plugin --profile <profile> list    # en realidad solo reenvía los argumentos a pnpm en el directorio del perfil; debería aparecer @aiwayds/dsh-subagent-registry
ls ~/.dsh/profiles/<profile>/node_modules/@aiwayds/   # comprobación equivalente
```

### Paso 2: ¿está montado? (¿ha llegado el bloque insert a la capa de composición?)

```sh
dsh dump-config --profile <profile>    # debería aparecer la entrada insert con id: dsh-subagent-registry y su config
grep dsh-subagent-registry ~/.dsh/profiles/<profile>/cordis.patch.yml
```

Nota: dump-config muestra el **resultado de la composición** de la capa de parches, no los valores de tiempo de ejecución materializados a partir del esquema.

### Paso 3: ¿está conectado? (escaneo del directorio + registro de herramientas + visibilidad para el modelo)

- `ls ~/.dsh/agents/`: en el primer arranque (con el directorio vacío) se crean los tres agentes predefinidos workhorse / oldfox / rubber-duck — si están, el escaneo de agentsDir funciona.
- Pregunta al modelo en la sesión: «enumera las herramientas que tienes disponibles ahora mismo» — deberían aparecer `use_agent` / `ask_agent`, y la descripción de `use_agent` debería incluir la lista de agentes.
- De paso, comprueba el enrutamiento de skills: dile al modelo «ayúdame a configurar un subagente» — debería activarse la skill `dsh-subagent-registry-config`.

### ¿Se ha usado? (rastros de uso)

- **Tarjetas/reproductor**: la reproducción de sesiones `/history` de tui-pi, o la sección de actividad de las tarjetas de turno de la web/Feishu — cada línea `🔧 use_agent · ✔` es un lanzamiento.
- **Comprobación directa en disco (funciona con cualquier perfil)**: cada sesión es
  `~/.dsh/sessions/<workspace dir>/<session id>/session.v3.jsonl.zstd`; cuenta las llamadas directamente:

  ```sh
  zstdcat ~/.dsh/sessions/<workspace dir>/<session id>/session.v3.jsonl.zstd | grep -c use_agent
  ```

  Un resultado mayor que 0 significa que esa sesión lo ha invocado; el propio subagente también es una sesión de dsh independiente bajo la misma raíz de sesiones.

### Síntoma → punto de fallo

| Síntoma | Dónde falla | Cómo solucionarlo |
| --- | --- | --- |
| El plugin no aparece en `dsh plugin … list` | Instalación | `dsh plugin --profile <profile> add @aiwayds/dsh-subagent-registry` y reinicia dsh |
| No hay bloque insert en dump-config | Montaje | Revisa el cordis.patch.yml del perfil, vuelve a montarlo y reinicia |
| La herramienta está, pero la lista de agentes está vacía | agentsDir / ubicación del archivo / frontmatter | Consulta los puntos 1 y 2 de «Solución de problemas» más abajo |
| La herramienta y la lista están, pero el modelo no lo invoca | Elección del modelo | Redacta la `description` del agente para que diga claramente «cuándo lanzarme»; en la TUI, el registeredOnly de tui-pi también puede ayudar |
| Las llamadas fallan con `ctx.subagents.start is not a function` | Se ha cargado un plugin antiguo o el host está fuera del rango verificado | Verificado con DSH `0.2.0-rc.2` y `0.2.1-rc.2` (líneas RC/estable; la línea alfa no es compatible); confirma la versión real del plugin, actualízalo y reinicia; no des por supuesta la compatibilidad con otras versiones del host |

## Solución de problemas

1. **Se descarta un archivo de agente** → busca errores de análisis en los registros de arranque/del cargador: la falta de `name`, un `deep` no entero o negativo, o un valor no válido de `thinking`/`background` **descartan el archivo entero** (no hay reparación con valores degradados).
2. **Un agente no aparece en la herramienta `use_agent`** → comprueba, por orden: si agentsDir está bien configurado (por defecto, `$DSH_HOME/agents`); si el archivo `<name>.md` está directamente en el nivel superior del directorio (no se recorren los subdirectorios); si el frontmatter es válido y name coincide con el nombre del archivo (consulta el punto anterior). Abrir o actualizar la página web de gestión sincroniza la lista de agentes; en CLI/TUI puros, la lista se actualiza en el siguiente montaje, y los archivos nuevos se pueden invocar por nombre de inmediato.
3. **Agentes predefinidos perdidos o modificados** → el primer arranque crea los tres agentes predefinidos workhorse / oldfox / rubber-duck solo cuando el directorio está vacío («el trío inicial»); ptc-subagent / minimal-subagent son los **dos agentes opcionales** (Experimental: desactivado por defecto), que solo se instalan con el comando `/registry-config` o copiándolos a mano — nunca se crean automáticamente. Los archivos existentes nunca se sobrescriben, y lo que se elimina, eliminado queda. Desinstalar el plugin tampoco toca nunca los archivos de `~/.dsh/agents/`. Si falta un agente en la lista, comprueba primero si lo ha desactivado el interruptor de `/registry-config` (`disabledAgents`) — desactivar solo oculta, nunca toca los archivos.
