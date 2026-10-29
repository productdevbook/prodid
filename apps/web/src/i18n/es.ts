import type { Copy } from '@/i18n/copy'
import { CONTACT } from '@/lib/spec'

export const es: Copy = {
	common: {
		skip: 'Saltar al contenido',
		home: 'prodid, inicio',
		primary: 'Navegación principal',
		nav: {
			spec: 'Especificación',
			specShort: 'Espec.',
			publish: 'Publicar',
			publishShort: 'Publicar',
			data: 'Datos',
			dataShort: 'Datos',
		},
		toDark: 'Cambiar al tema oscuro',
		toLight: 'Cambiar al tema claro',
		language: 'Idioma',
		status:
			'Spec v1. El índice y el publicador alojado funcionan en prodid.org. Cualquiera puede publicar, en su propio dominio o alojado.',
		normative: 'La especificación se publica solo en inglés, y el texto en inglés es el normativo.',
		imageAlt:
			'prodid: los publicadores declaran datos de producto en sus propios dominios, un índice abierto une cada código a un identificador permanente y cualquiera puede descargar el índice completo.',
		support: {
			label: 'Apoya prodid',
			heading: 'prodid es de código abierto. Ayúdalo a crecer.',
			body: 'Dale una estrella al repositorio para que otros lo encuentren, cuéntanos qué está mal, envía una corrección o escríbenos aquí sin cuenta de GitHub.',
			star: 'Dar una estrella en GitHub',
			stars: (count: string) => `${count} estrellas`,
			contribute: 'Contribuir',
			chat: 'Escríbenos',
		},
		footer: {
			tagline: 'Una capa abierta de identidad y datos para cada producto físico.',
			label: 'Pie de página',
			site: 'Sitio',
			specification: 'Especificación',
			publish: 'Publica tus productos',
			github: 'Código fuente en GitHub',
			contact: 'Contacto',
			report: 'Informar de un problema',
			security: 'Seguridad',
			licence:
				'La especificación y los esquemas son CC0, igual que los `opid` y las correspondencias de identificadores que publica prodid.org. Cualquier otra afirmación lleva la licencia de la fuente que la hizo. La implementación de referencia es Apache-2.0.',
		},
	},

	home: {
		title: 'prodid — identidad abierta para cada producto físico',
		description:
			'prodid da a cada producto físico un identificador abierto y permanente. GTIN, MPN y cualquier otro código se resuelven a él, y cada dato es una afirmación atribuida a su fuente.',
		badge: 'Spec v1 · en marcha',
		headline: 'Un código de barras no es un producto.',
		headlineAccent: 'prodid sí.',
		lead: 'Un identificador abierto y permanente para cada producto físico. Cada código de barras y número de pieza se resuelve a él, y cada dato sobre él nombra la fuente que lo dijo.',
		ctaPublish: 'Publica tus productos',
		ctaSpec: 'Leer la especificación',
		heroKind: (brand: string) => `Item · ${brand}`,
		heroVariant: (markets: string) => `azul marino · M · se vende en ${markets}`,
		heroLapsed: (source: string) => `lapsed · ${source}`,
		heroCaption: 'Lo que devuelve escanear el código de la etiqueta. El registro es el propio ejemplo de la especificación.',
		sceneLabel:
			'Publicadores en sus propios dominios, publicadores alojados y conjuntos de datos abiertos envían afirmaciones a un índice abierto, que resuelve el código de un producto y publica el índice completo como volcados.',
		sceneCaption:
			'Los publicadores declaran datos en sus propios dominios, alojados o desde conjuntos de datos abiertos. El índice une cada código de la etiqueta a un opid permanente, y el índice completo se puede descargar.',
		problem: {
			eyebrow: 'El problema',
			heading: 'Cuatro códigos, una chaqueta y nada que los una.',
			body: 'Un producto recibe un código de barras nuevo por cada mercado, tamaño de envase y cambio de embalaje, y sus datos viven en un sistema distinto para cada uno. Cuando dos no coinciden, uno se sobrescribe sin avisar.',
			answer: 'prodid da al producto en sí un identificador que no cambia cuando cambia el código de barras.',
			figure: 'Varios códigos que se resuelven a una sola variante',
			anotherGtin: 'otro GTIN',
			codes: [
				'unidad de venta para DE y TR',
				'la misma chaqueta en pack de dos',
				'el embalaje del año que viene',
				'número de pieza del fabricante',
			],
			variant: 'Una variante',
			variantNote: 'Nunca se reutiliza ni se borra. Cualquier código que haya apuntado aquí sigue funcionando.',
		},
		model: {
			eyebrow: 'El modelo',
			heading: 'Familia, variante, item. Los códigos apuntan a ellos; no son ellos.',
			lead: 'Cada nivel tiene su propio `opid`: 16 caracteres que no codifican nada, así que nada del producto puede volverlos incorrectos.',
			levels: [
				{ title: 'Acme Trail Jacket', note: 'El producto tal como se habla de él.' },
				{ title: 'azul marino · talla M', note: 'Una combinación de color, talla y similares.' },
				{ title: 'Unidad de venta para DE y TR', note: 'Lo que lleva un código de barras.' },
			],
			after:
				'Un embalaje nuevo añade un item nuevo con un código nuevo, bajo la misma variante y la misma familia. Nada de lo que apuntaba al anterior se rompe.',
		},
		how: {
			eyebrow: 'Cómo funciona',
			heading: 'Publica en tu dominio. prodid lo indexa. Cualquiera lo resuelve.',
			publish: {
				step: '01 · Publicar',
				title: 'Tres cosas en tu dominio',
				body: 'Un documento de descubrimiento, un feed con un producto por línea y un registro DNS que demuestra que el dominio es tuyo.',
				link: 'Cómo publicar →',
			},
			index: {
				step: '02 · Indexar',
				title: 'Comprobado, emparejado, atribuido',
				checks: [
					'cada línea validada contra el esquema',
					'emparejada con un opid existente o con uno nuevo',
					'cada campo guardado como afirmación de tu dominio',
				],
				body: 'Minoristas, registros y conjuntos de datos abiertos son fuentes del mismo modo: junto al fabricante, nunca por encima.',
				link: 'Cómo funcionan las afirmaciones →',
			},
			resolve: {
				step: '03 · Resolver',
				title: 'Una URL, impresa en el producto',
				browser: 'Navegador → una página',
				api: 'API → el registro JSON',
				body: 'La ruta usa la sintaxis de GS1 Digital Link, así que puede ser el propio código QR de la etiqueta.',
				link: 'Cómo funciona la resolución →',
			},
		},
		claims: {
			eyebrow: 'Afirmaciones',
			heading: 'Cada dato nombra su fuente. Los desacuerdos siguen a la vista.',
			lead: 'Nada se fusiona en una única «verdad». Cuando una fuente deja de publicar, sus afirmaciones se conservan y se marcan como lapsed, no se borran.',
			caption: 'Las afirmaciones del item de ejemplo de la especificación',
			columns: ['Propiedad', 'Valor', 'Fuente', 'Confianza', 'Visto'],
			lapsed: ' · lapsed',
			trust: [
				'Controla el dominio y está confirmada como titular de la marca.',
				'Demostró el control de un dominio por DNS o por su propio sitio web.',
				'Un nombre alojado sin dominio, un conjunto de datos o una contribución.',
			],
			details: 'Ver la petición y el registro JSON completo',
			request: 'Cabeceras de petición y respuesta',
		},
		who: {
			eyebrow: 'Para quién',
			heading: 'Para quienes crean los datos y para quienes los necesitan.',
			audiences: [
				{
					title: 'Fabricantes',
					body: 'Declara los datos de tus productos una vez, en tu propio dominio. Ningún anuncio de revendedor ni marketplace es dueño de la descripción de lo que fabricas.',
				},
				{
					title: 'Proveedores de e-commerce, ERP y PIM',
					body: 'Un documento de descubrimiento y un feed por dominio de comercio, generados con datos que ya tienes.',
				},
				{
					title: 'Desarrolladores',
					body: 'Resuelve cualquier código a un identificador que sobrevive al reenvasado. Cada dato dice quién lo dijo, cuándo y si esa fuente lo sigue respaldando.',
				},
			],
			passport:
				'**Sobre el Pasaporte Digital de Producto de la UE.** El ESPR pide un pasaporte accesible desde un soporte de datos en el producto, y GS1 Digital Link es una de las sintaxis de soporte que se están normalizando para ello. prodid no es un servicio de pasaportes y publicar aquí no supone cumplir nada; es el mismo trabajo de base: un registro legible por máquina por producto, en una dirección estable que tú controlas.',
		},
		status: {
			eyebrow: 'Estado',
			heading: 'Dónde está esto de verdad.',
			stable: {
				label: 'Estable',
				title: 'Especificación v1.',
				body: `Solo cambia por adición; cualquier otra cosa sería v2. Se acepta un documento de descubrimiento v0 hasta el 2027-01-26 00:00 UTC. [Léela](/spec) y [di dónde se equivoca](${CONTACT.issues}).`,
			},
			sources: {
				label: 'Canary y un conjunto de datos',
				title: 'Aún no hay ningún catálogo de publicador indexado.',
				body: 'El índice tiene dos fuentes: el canary del propio proyecto, [canary.prodid.org](https://prodid.org/source/canary.prodid.org), que demuestra la publicación, el rastreo y la resolución de punta a punta, y [dataset:wikidata](https://prodid.org/source/dataset:wikidata), una importación de prueba acotada de 5 elementos de Wikidata, unverified y bajo CC0-1.0.',
			},
			design: {
				label: 'Por diseño',
				title: 'El índice es reemplazable.',
				body: 'La especificación, los esquemas, los opid y las correspondencias de códigos son [CC0](/spec#licensing). Cada afirmación conserva la licencia de su fuente. Los datos viven en los dominios que los publican, así que cualquiera puede volver a rastrearlos y los códigos impresos conservan su significado.',
			},
		},
	},

	publish: {
		title: 'Publica tus productos — prodid',
		description:
			'Cómo un fabricante o un proveedor de software publica datos de producto en prodid: el documento de descubrimiento, el feed NDJSON, el único registro DNS TXT que guarda la identidad y el ping.',
		eyebrow: 'Guía para publicadores',
		heading: 'Publica tus productos',
		lead: 'Publicar en prodid significa poner dos archivos en la web y un registro en el DNS. En tu propio dominio no hay que registrarse ni guardar ninguna clave: el dominio es la credencial, y cambias o retiras lo que publicas cambiando los archivos.',
		discovery: {
			heading: 'Cómo te encuentra el índice',
			lead: 'Conviene saberlo antes que nada, porque decide cuál de las tres vías de abajo es la tuya. El descubrimiento empieza de cero en cada rastreo, primero por DNS, y entre rastreos no se recuerda nada del camino hasta tus datos.',
			first: 'Primero',
			firstTitle: 'Un registro DNS TXT en `_prodid.acme.example`',
			firstBody:
				'Si hay un registro `v=prodid0`, se sigue en exclusiva, aunque nombre tu propio dominio. El registro nombra un *host*; el documento siempre está en `https://<host>/.well-known/prodid.json`.',
			second: 'Solo si no hay tal registro',
			secondBody: 'El documento en el propio dominio. Quien sirve el dominio por HTTPS habla por él.',
			why: 'El DNS va primero porque es la prueba más fuerte: quien puede poner un archivo en un host no siempre es el dueño del dominio, y el dueño tiene que poder imponerse. Por eso conviene escribir el registro aunque sirvas el archivo tú mismo; [vía 1, paso 3](#own-domain) explica qué ganas.',
			one: '**Exactamente un registro, y nada detrás.** Más de un registro `v=prodid0` con ese nombre es un error, no una elección entre ellos, y uno solo mal formado o demasiado largo también es un error. No hay alternativa: si existe un registro y no funciona, el descubrimiento termina ahí en lugar de mandar al rastreador a mirar tu dominio. Si cambias de host, sustituye el registro; nunca añadas un segundo. La gramática, con vectores de prueba, está en la [especificación](/spec#the-_prodid-txt-record).',
			answer:
				'**Qué cuenta como respuesta.** HTTP 200 tras como mucho una redirección, un tipo de contenido JSON, un cuerpo que valida contra el esquema del feed y un `domain` que nombra el dominio que se descubre. Un sitio que responde a rutas desconocidas con una página HTML y un 200 no está respondiendo, como tampoco un documento servido como `text/html`.',
		},
		routes: {
			heading: 'Elige cómo publicar',
			lead: 'Identidad y alojamiento van por separado. Tu identidad es un dominio que controlas; dónde se sirven los documentos es un detalle que puedes cambiar más adelante sin cambiar tu identidad ni ningún identificador que prodid haya asignado a tus productos. Tres vías, y todas producen exactamente los mismos registros.',
			route: (n: string) => `Vía ${n}`,
			detail: (n: string) => `La vía ${n} en detalle →`,
			start: 'Empieza en publish.prodid.org →',
			identity: 'Identidad',
			trust: 'Confianza',
			items: [
				{
					when: 'Puedes servir archivos en tu propio dominio.',
					who: 'Una marca con equipo de TI, o una plataforma (e-commerce, ERP, PIM) que publica para cada comercio que aloja.',
					how: 'Sirve el documento de descubrimiento en el dominio y publica un registro TXT que nombre al propio dominio.',
					identity: 'el dominio',
				},
				{
					when: 'Tienes un dominio pero no puedes servir archivos en él.',
					who: 'Un fabricante cuya web está en una plataforma que no controla.',
					how: 'Publica en un slug alojado y apunta un registro TXT de tu dominio a ese host.',
					identity: 'el dominio, probado por DNS',
				},
				{
					when: 'No tienes ningún dominio.',
					who: 'Un pequeño productor o una cooperativa.',
					how: 'Publica en un slug alojado. Añade un dominio más adelante sin perder nada.',
					identity: 'el host del slug',
				},
			],
			hosted:
				'Las vías 2 y 3 usan el servicio de publicación alojado en `<slug>.prodid.org`. Entra en [publish.prodid.org](https://publish.prodid.org/) con un enlace que te llega por correo, crea un sitio, sube tu archivo y conecta un dominio si tienes uno. Puedes exportarlo todo o borrar el sitio en cualquier momento.',
		},
		table: {
			field: 'Campo',
			required: 'Obligatorio',
			what: 'Qué es',
			yes: 'sí',
			no: 'no',
			delegating: 'al delegar',
		},
		own: {
			eyebrow: 'Vía 1',
			heading: 'Publica en tu propio dominio',
			lead: 'Dos archivos y un registro DNS. Una plataforma que publica en nombre de comercios hace lo mismo en el dominio de cada uno, así que cada comercio conserva su identidad y su nivel de confianza.',
			step1: 'Paso 1 — Sirve el documento de descubrimiento',
			step1Lead: (url: string) => `Un archivo, en una ruta fija, que indica dónde están tus feeds de producto: \`${url}\``,
			feedCaption: 'El ejemplo de spec/fixtures/v1/examples/prodid.json, generado a partir del propio archivo.',
			feedTable: 'Campos del documento de descubrimiento',
			feedFields: [
				'Siempre org.prodid.feed.',
				'1. Un documento con 0 se acepta en los rastreos que empiezan antes del 2027-01-26 00:00 UTC y después se rechaza, como negativo definitivo.',
				'El nombre que una persona debe ver junto a tus afirmaciones.',
				'Una dirección de correo que alguien lea de verdad. Es donde escribe el índice cuando tu fuente entra en lapse, y es el único aviso que recibirás.',
				'Identificador SPDX que cubre los datos de tus feeds, por ejemplo CC0-1.0.',
				'Hasta 100 URL https, todas en el mismo host que este documento.',
				'El dominio por el que habla este documento. Obligatorio siempre que se llegue al documento a través de un registro TXT que nombre otro host, y entonces debe ser igual a ese dominio. Opcional cuando el dominio sirve el documento él mismo, y si está presente debe coincidir igualmente.',
			],
			serve:
				'Sírvelo por HTTPS en el puerto por defecto, con un certificado válido, como `application/json`, o cualquier `application/…+json`. No lo redirijas a otro host: la única redirección que sigue el rastreador es de `acme.example` a `www.acme.example`.',
			step2: 'Paso 2 — Sirve el feed',
			step2Lead:
				'Un feed es NDJSON: un objeto JSON completo por línea, UTF-8, separado por saltos de línea. Sin un array alrededor ni comas entre líneas. Así un feed de dos millones de productos se lee línea a línea, y una línea mala te cuesta esa línea y no el resto.',
			itemsCaption:
				'Tres variantes de un producto, de spec/fixtures/v1/examples/items.ndjson. Comparten un group, así que el índice construye con ellas una familia de tres variantes.',
			sameHost:
				'**Los feeds viven en el mismo host que el documento que los lista.** Un documento de descubrimiento que nombra un feed en otro host se rechaza entero, no en parte: pierdes toda la fuente, no un feed, y cuenta como negativo definitivo, así que pone en marcha el reloj del lapse que se explica abajo. Servir el JSON desde tu web y el NDJSON desde otro host de CDN es algo normal de querer y no está admitido en v1. Pon ambos en un solo host.',
			firstLine: 'La primera de esas líneas, formateada para leerla:',
			itemLabel: 'un registro org.prodid.item',
			itemTable: 'Campos del registro de item',
			itemFields: [
				'Siempre org.prodid.item.',
				'Tu nombre estable para este registro dentro del feed. Volver a publicar la misma key sustituye al anterior.',
				'La marca tal como aparece en el producto. Se normaliza antes de acotar un mpn, así que ARÇELİK y Arçelik son una marca, no dos.',
				'El nombre del producto, sin los ejes de variante.',
				'Al menos un { scheme, value }, y al menos uno que el índice pueda guardar. Los valores no llevan espacios en los extremos y no están vacíos. Un gtin debe tener 8, 12, 13 o 14 dígitos con un dígito de control correcto y no ser todo ceros; un mpn necesita una brand que se normalice a algo, porque ese es el ámbito en el que es único; un gtin de circulación restringida se conserva, pero solo como tu propio rcn. Un registro que se queda sin nada guardable no identifica nada y se omite.',
				'Etiqueta BCP 47 del texto legible de este registro.',
				'Tu propia clave de agrupación. Los items que la comparten son variantes de una misma familia.',
				'Los ejes que distinguen este item dentro del grupo: color, talla, capacidad.',
				'Código de brick GS1 GPC, escrito gpc: seguido de ocho dígitos.',
				'Códigos ISO 3166-1 alfa-2 de los mercados donde se vende este item.',
				'Cadenas, números, booleanos, listas o { value, unit } para una medida.',
				'Hasta 20 URL https, cada una con un kind y una licencia SPDX de la lista admitida. A diferencia de los feeds, pueden estar en cualquier host.',
			],
			flat: 'Envía items planos. Nunca construyes familias ni variantes tú mismo y nunca envías un `opid`: el índice deduce lo primero de `group` y asigna lo segundo. Si ya generas un feed de Google Merchant, `group` es tu `item_group_id`.',
			barcodes:
				'Dos cosas sobre los códigos de barras que conviene saber antes de exportar. Un `gtin` todo ceros no es un código de barras, es un marcador de catálogo, y un registro que lo lleve se rechaza igual que uno con dígito de control erróneo. Un [número de circulación restringida](/spec#which-gtins-are-identifiers), los rangos de uso en tienda, se guarda y se te atribuye, pero no identifica nada a nivel global, así que nunca fusiona tu producto con el de otro y `/01/` no lo resuelve.',
			step3: 'Paso 3 — Reclama la identidad en el DNS',
			step3Lead: 'Con los archivos ya publicados, publica un registro que nombre tu propio dominio como host.',
			step3Why:
				'Apunta exactamente a lo que el descubrimiento habría encontrado de todos modos, así que nada cambia en tus datos. Lo que cambia es lo que puede hacer alguien con acceso de solo añadir a tu DNS. Sin registro, uno que añada esa persona se queda con tu identidad sin hacer ruido, porque el DNS gana al archivo. Con tu registro ya puesto, un segundo hace que el descubrimiento falle con *más de un registro*: un lapse visible, notificado y recuperable.',
			neverDelegate:
				'**Nunca delegues `_prodid` en un proveedor.** El acceso de escritura a `_prodid.<domain>` es el control de tu identidad, igual que para DKIM o un desafío ACME DNS-01. Un dominio con DNS compartido es una identidad compartida. Dale a una agencia el feed, no el registro.',
			order:
				'Sube los archivos antes que el registro, no después: un registro que apunta a un documento que aún no existe es un descubrimiento fallido. Los valores se leen sin distinguir mayúsculas y un punto final está bien, así que `ACME.Example.` y `acme.example` son el mismo host.',
			step4: 'Paso 4 — Avisa al índice del cambio',
			step4Lead: 'Opcional. Cada dominio conocido se vuelve a rastrear según un calendario; un ping solo adelanta el siguiente rastreo.',
			pingLabel: 'pedir al índice que ejecute el descubrimiento ahora',
			ping: '`{"domains": [...]}` admite hasta 1000 a la vez; así es como una plataforma presenta cada comercio que aloja. No hay clave que enviar, porque el ping no da a quien llama ningún poder sobre el contenido, y `202` es lo único que responde. No dice si el dominio era conocido, si se encontró algo ni si otra persona lo pingueó hace un minuto. Un `429` solo significa que *tú* has superado tu propio presupuesto de peticiones, y los errores llegan como `application/problem+json`. Lo que le pasó a tu dominio aparece en el [estado de tu fuente](#after), no en el ping.',
		},
		delegated: {
			eyebrow: 'Vía 2',
			heading: 'Delega el alojamiento, conserva la identidad',
			lead: 'Muchos fabricantes tienen un dominio y no pueden poner un archivo en él. El feed se aloja en otro sitio y el dominio se prueba con DNS, así que la identidad de la fuente sigue siendo el dominio y el nivel de confianza sigue siendo `verified`. Crea un sitio en [publish.prodid.org](https://publish.prodid.org/), escribe tu dominio y te muestra el registro exacto que debes añadir y lo comprueba por ti.',
			looks: 'Cómo queda',
			steps: [
				'**Un catálogo subido a un slug alojado**, por ejemplo `acme.prodid.org`, que sirve tanto el documento de descubrimiento como el feed.',
				'**Un registro TXT en el dominio que tienes**, que nombra ese host. Un host, nunca una URL, así que un registro nunca puede dirigir al rastreador a una dirección cualquiera.',
				'**Un documento que nombra tu dominio de vuelta.** El DNS dice *mi documento está allí*; el documento dice *hablo por ese dominio*. Un documento delegado sin `domain` se rechaza: la ausencia nunca se toma como consentimiento, y eso impide que alguien apunte un registro al feed de otro.',
			],
			caption:
				'De spec/fixtures/v1/examples/prodid.delegated.json. La única diferencia con la vía 1 es el campo domain, y aquí es obligatorio.',
			window:
				'El publicador alojado escribe `domain` en el documento solo después de ver tu registro TXT él mismo, así que no hay ningún momento en que un documento reclame un dominio que no lo ha pedido.',
		},
		hosted: {
			eyebrow: 'Vía 3',
			heading: 'Publica sin dominio',
			lead: 'Un productor sin ningún dominio publica en un slug alojado, `<slug>.prodid.org`, con su propio nombre. Reserva uno en [publish.prodid.org](https://publish.prodid.org/). La identidad de la fuente es el host del slug y el nivel de confianza `unverified`, porque no se ha probado nada sobre un dominio. Los registros son registros de verdad: identificadores, resolución, atribución.',
			merchant:
				'Casi todos los publicadores en esta situación ya tienen un archivo de producto de [Google Merchant](https://support.google.com/merchants/answer/7052112), así que la correspondencia de ese archivo a registros `org.prodid.item` está escrita en la especificación, columna por columna, junto con lo que descarta a propósito: precio, disponibilidad, envío y estado pertenecen a un vendedor en un día concreto, no al producto. Vale la pena leer [Importar un feed de Merchant](/spec#appendix-importing-a-merchant-feed) antes de exportar: publish.prodid.org convierte el CSV o TSV que subes con exactamente esa correspondencia. Cuatro cosas de ahí deciden cómo tiene que ser tu hoja de cálculo:',
			rules: [
				'**Cuatro columnas se convierten en ejes de variante**: `color`, `size`, `material` y `pattern`, entre las que elige un comprador dentro de un mismo `item_group_id`. `gender`, `age_group`, `size_type` y `size_system` siguen siendo propiedades normales: describen todo el grupo, y como ejes partirían un producto en varios la primera vez que alguien escribiera uno de ellos de dos maneras.',
				'**Un atributo repetido va separado por comas o con cabecera repetida, por archivo, no por celda.** Una celda se divide por comas solo cuando su cabecera aparece una vez en todo el archivo; si repites la cabecera, cada celda bajo ella se toma entera. Es la única forma de llevar un valor con una coma dentro, y es una decisión que tomas una vez para el archivo. Se aplica a `additional_image_link`, `product_type`, `product_highlight`, `product_detail` y `certification`; todo lo demás, incluida una `description` llena de comas, se toma entero en cualquier caso.',
				'**Un `product_detail` nunca sobrescribe nada.** Su subatributo central pasa a ser la clave de la propiedad, el nombre de sección se descarta y gana el primer valor de cada clave. Un detail posterior con la misma clave, o uno que cae en una clave que la correspondencia ya produjo, se descarta y se informa con su fila, así que una columna de detail nunca puede redefinir en silencio lo que decía el resto de la fila.',
				'**Hay que declarar una licencia para los medios.** El formato Merchant no tiene columna para ello y [nada se ingiere sin licencia](/spec#licences-that-can-be-ingested), así que una importación declara un único identificador SPDX admitido que cubre cada imagen y documento del archivo. Una columna `license` propia lo sustituye fila a fila, y un archivo cuya licencia declarada no es admitida produce registros sin medios, no registros que fallan.',
			],
			skipped:
				'Una fila que no puede convertirse en registro (sin identificador útil, con un GTIN cuyo dígito de control falla) se omite y se informa por su número de fila en la hoja, contando la cabecera como fila 1, así que una fila mala cuesta esa fila y no la importación. Hay un archivo resuelto con el que comprobarte en [`/spec/fixtures/merchant`](/spec/fixtures/merchant): un CSV, los registros que debe producir y la fila que debe omitirse.',
			later:
				'Lo que importa de una decisión de hoy es lo que pasa después. Añadir un registro TXT en un dominio que adquieras, nombrando ese mismo host, convierte el slug en el dominio en el siguiente rastreo: **la misma fuente, los mismos registros, cada `opid` conservado**, con la confianza subiendo de `unverified` a `verified`. Tus identificadores `sku` dependen de la propia fuente y no de su nombre, así que sobreviven al cambio. En publish.prodid.org es el mismo campo de dominio que usa la vía 2.',
		},
		trust: {
			heading: 'Qué significa aquí la confianza',
			lead: 'La confianza es una propiedad de la fuente, no de una afirmación. Dice qué se ha probado sobre quién habla, y nada sobre si un dato concreto es correcto. Quien usa los datos decide qué hacer con eso.',
			table: 'Niveles de confianza',
			level: 'Nivel',
			meaning: 'Significado',
			levels: [
				'Control del dominio probado y titularidad de la marca confirmada.',
				'Control del dominio probado, por el registro TXT o porque el dominio sirve el documento.',
				'Un slug alojado sin dominio, una importación de datos o una contribución de la comunidad.',
			],
			only: 'Solo una fuente cuya identidad es un dominio puede ser más que `unverified`. `verified` sale del rastreo. `authoritative` no, porque ningún rastreo puede probar quién es dueño de una marca: lo concede el operador del índice, y solo con pruebas.',
			rules: [
				{
					title: 'La prueba es tu prefijo de empresa GS1.',
					body: 'El prefijo de empresa GS1 de los GTIN que tu fuente publica bajo la marca debe estar licenciado a la organización que controla tu dominio, según la consulta pública «Verified by GS1». La URL de esa consulta se guarda con la concesión como prueba.',
				},
				{
					title: 'Una concesión nombra una marca, y cada una puede revocarse.',
					body: 'La marca se guarda en su forma [normalizada](/spec#brand-normalization). Una fuente puede tener concesiones para varias marcas, y el operador revoca cada una por separado.',
				},
				{
					title: 'Una concesión no sobrevive a la prueba que la sostiene.',
					body: 'Tu fuente es `authoritative` exactamente mientras el control de su dominio esté probado, no esté [lapsed](/spec#lapse) y tenga al menos una concesión sin revocar. Si pierdes la prueba de dominio o entras en lapse, baja al instante a lo que permita la prueba que quede (`verified` durante el lapse, menos si también falta la prueba de dominio) sin que nadie intervenga. Vuelve a ser `authoritative` en cuanto se cumplan otra vez las tres.',
				},
				{
					title: 'Cubre la fuente, no la marca.',
					body: 'La confianza sigue siendo una propiedad de la fuente: una concesión para una marca hace `authoritative` cada afirmación de tu fuente, también las de marcas para las que no tiene concesión.',
				},
			],
			ask: `Para pedirla, publica primero en tu propio dominio y luego [solicítala con el formulario](${CONTACT.authoritative}), indicando tu dominio, la marca y una consulta Verified by GS1 de uno de sus GTIN. El operador comprueba en Verified by GS1 los GTIN que tu fuente publica bajo esa marca. La solicitud es pública.`,
		},
		after: {
			heading: 'Después de publicar',
			edit: {
				title: 'Cambiar un registro es editar una línea.',
				body: 'Publicar un registro con una key que ya existe sustituye al anterior. No hay endpoint de actualización, porque el feed es el estado.',
			},
			remove: {
				title: 'Quitar una línea retira tus afirmaciones, no el producto.',
				body: 'Una key que desaparece de un feed que el rastreador obtuvo entero marca tus afirmaciones sobre ella como retiradas. La entidad y su identificador se quedan: los enlaces de otros siguen funcionando, igual que las afirmaciones de otras fuentes.',
			},
			retire: {
				title: 'Quitar una URL de feed del documento la retira de inmediato.',
				body: 'Cuando un rastreo lee un documento que ya no nombra una de tus URL de feed, cada registro activo de ese feed se retira al momento, como si hubieran desaparecido todas sus keys, y la URL no se vuelve a pedir. El margen de siete días de abajo no se aplica: quitar una URL es decir que el archivo ya no existe, y el índice te toma la palabra. Volver a listarla más tarde la recupera, leída desde cero. Sirve el documento con un `ETag` si puedes: un `304` significa que la lista no ha cambiado, así que no retira nada.',
			},
			broken: {
				title: 'Una línea rota retrasa la retirada siete días; no la anula.',
				body: 'Una línea de más de 64 KiB, imposible de analizar o no válida se omite y se cuenta. Como la key de una línea omitida es desconocida, un feed con líneas omitidas no retira nada durante siete días. Después, las keys ausentes se retiran como siempre. El recuento es público, así que un feed que pierde líneas en silencio no pasa desapercibido.',
			},
			unreadable: {
				title: 'Un feed que el rastreador no puede leer no sale gratis.',
				body: 'Un rastreo solo tiene éxito cuando se ha leído *todo lo que lista el documento*: un documento aceptable, y cada feed de él respondiendo `200` o `304`. Que un feed agote el tiempo no te hace perder los demás (los que respondieron se ingieren y en un rastreo fallido no se retira nada), pero el rastreo cuenta como fallo de transporte y `feeds_failed` lo indica en tu estado. Un documento perfectamente sano con una URL de feed muerta para siempre entra por tanto en lapse con el mismo reloj de siete días que un dominio que dejó de responder del todo, y pierde el catálogo treinta días después. Una URL de feed que ya no sirves debe quitarse del documento, no dejarse pudrir.',
			},
			lapse: {
				title: 'Si el descubrimiento deja de funcionar, tu fuente entra en lapse.',
				body: [
					'Un **negativo definitivo**, es decir, un descubrimiento que termina sin documento aceptable (ni registro ni documento; un registro mal formado, demasiado largo o duplicado; o un documento que no es 200, no es JSON, no es válido, ya no coincide en `domain` o lista un feed fuera de su host), pone la fuente en lapse al instante. Un **fallo de transporte** (un timeout de DNS, un 5xx, un 429, un límite alcanzado, en el documento o en cualquier feed) no cambia nada por sí solo, pero siete días seguidos en los que cada intento termina así también te ponen en lapse, así que servir errores para siempre no es una forma de congelar tus afirmaciones.',
					'**Ese beneficio de la duda pertenece a un host, no a ti.** Solo se aplica en un host en el que tu fuente ya se verificó. En un host donde nunca se ha verificado (un slug nuevo, un host al que acabas de apuntar `_prodid`, todo lo de las vías 2 y 3), cualquier fallo, timeouts y 5xx incluidos, es un negativo definitivo y te pone en lapse al instante. Es deliberado: si no, una fuente verificada podría apuntar su registro a un host que no controla y deducir, según su lapse empiece hoy o dentro de una semana, si ese host está activo. Cambiar de host no te cuesta nada por ello. El primer rastreo con éxito en el nuevo host lo limpia todo, y un lapse sigue siendo recuperable durante los 30 días anteriores a cualquier retirada.',
					'Una fuente en lapse no acepta afirmaciones nuevas, se muestra como lapsed a los lectores y se avisa a su `publisher.contact`. Un rastreo de una fuente en lapse no escribe nada hasta que tiene éxito completo; solo entonces se levanta el lapse. Tras 30 días seguidos de lapse, tus **registros y sus afirmaciones activas se retiran juntos** y quedan como historial. Esos 30 días son tu ventana de recuperación, y por eso la dirección de contacto tiene que leerla alguien.',
					'Volver no exige cambiar nada. Sirve el mismo documento y el mismo feed de siempre y todo lo que publicas se vuelve a afirmar en cuanto el descubrimiento tiene éxito, se haya movido un byte o no: mientras no tiene nada activo tuyo, el índice deja de usar peticiones condicionales, así que un archivo sin cambios nunca es motivo para seguir retirado.',
				],
			},
			seen: {
				title: '`seen_at` es una afirmación continua, y un lapse largo lo reinicia.',
				body: 'Cada afirmación que ve un lector lleva `seen_at`: no cuándo se publicó el dato por primera vez en ningún sitio, sino *desde cuándo esta fuente afirma este valor sin interrupción*. Sobrevive a cada nuevo rastreo que encuentra el mismo valor, que es su razón de ser. No sobrevive a una retirada. Deja tu fuente en lapse más de 30 días y la fecha de cada dato que publicas vuelve a empezar el día que regreses, porque durante el hueco nadie verificable los respaldaba. Las filas retiradas se quedan, así que `?history=1` muestra el hueco en vez de ocultarlo; [lo que ve un lector](/spec#an-entity) está en la especificación.',
			},
			status: {
				title: 'Tu fuente tiene una página de estado pública.',
				body: '`/source/acme.example` es donde ves que algo va mal: el resultado del último rastreo, qué camino siguió el descubrimiento, cuántos registros cambiaron, cuántas líneas se omitieron, cuántos feeds no se pudieron leer y si estás en lapse y desde cuándo. Solo informa de lo que publica tu dominio y de cuándo miró el índice, nunca de quién pidió un rastreo.',
			},
			media: {
				title: 'Los medios se inspeccionan, no se creen, y una entrada mala solo se cuesta a sí misma.',
				sniffed:
					'El tipo se decide leyendo los bytes; tu `Content-Type` es una pista. Se guardan seis tipos y nada más: JPEG, PNG, GIF, WebP y AVIF como `image`, PDF como `document`. Sin SVG, sin HTML, sin archivos comprimidos, sin archivos de Office: una ficha técnica va en PDF. El tipo detectado y el `kind` de la entrada tienen que coincidir, o la entrada se omite.',
				table: 'Límites de medios',
				what: 'Qué',
				cap: 'Límite',
				caps: ['Una imagen', 'Un documento', 'Una descarga de medio', 'Entradas de medios en un registro'],
				licence:
					'La licencia se comprueba como texto antes de descargar nada, y debe ser exactamente uno de siete identificadores SPDX: los que permiten a cualquiera redistribuir el archivo tal cual, que es lo que hace el índice con él:',
				licences: 'licencias de medios admitidas',
				entry:
					'Aquí todo va por entrada. Una entrada rechazada, demasiado grande o inaccesible cuesta esa entrada y nada más: **tu registro nunca es inválido por sus medios**, sus demás afirmaciones se mantienen y ningún fallo de medios te pone en lapse. Se cuenta en `media_failed` y se reintenta en el siguiente rastreo de ese registro. Una cosa funciona al revés que en los feeds: la regla del mismo host *no* se aplica aquí, así que tus imágenes pueden estar en una CDN. [Qué se ingiere](/spec#what-is-ingested) y [la lista de licencias](/spec#licences-that-can-be-ingested) explican el porqué.',
			},
			others: {
				title: 'Otras fuentes publicarán sobre tus productos.',
				body: 'Minoristas, registros, conjuntos de datos abiertos y colaboradores son fuentes como cualquier otra. Sus afirmaciones se les atribuyen y nunca sobrescriben las tuyas; donde no coincidís, ambas afirmaciones se ven juntas con sus fuentes.',
			},
		},
		checklist: {
			heading: 'Antes de salir en vivo',
			items: [
				'El descubrimiento responde con HTTP 200, un tipo de contenido JSON y un cuerpo que valida contra el esquema del feed, no con una página HTML de «no encontrado» servida con un 200.',
				'Hay exactamente un registro TXT v=prodid0 en _prodid.<tu dominio>. Dos es un error, y uno mal formado también.',
				'Ese registro es v=prodid0; host=<hostname>. Un host, nunca una URL: sin esquema, sin puerto, sin ruta.',
				'Cada URL de feeds es https y está en el mismo host que el documento de descubrimiento que la lista.',
				'Cada URL de feeds es una que sigues sirviendo. Un feed que no se puede obtener hace fallar todo el rastreo, y siete días así ponen la fuente en lapse.',
				'Un documento delegado lleva "domain", igual al dominio por el que habla.',
				'El documento de descubrimiento se sirve como application/json y no redirige a otro host.',
				'Feeds y documentos envían ETag o Last-Modified, para que un archivo sin cambios cueste un 304.',
				'Cada línea del feed es un objeto JSON completo de menos de 64 KiB, UTF-8, separado por saltos de línea, sin array envolvente ni comas finales.',
				'Cada key es estable y nunca se reutiliza para otro producto.',
				'Cada gtin tiene solo dígitos, un dígito de control correcto y no es todo ceros.',
				'Cada valor de identificador está recortado (sin espacios al principio ni al final) y cada registro conserva al menos un identificador que el índice puede guardar, lo que significa que un mpn necesita una brand.',
				'Cada entrada de medios tiene un kind que coincide con sus bytes reales y una de las siete licencias SPDX admitidas, o esa entrada se omite.',
				'Ningún registro contiene un opid. Los asigna el índice.',
				'publisher.contact es una dirección que alguien lee.',
			],
			check: 'Comprueba tus archivos antes del ping',
			checkLead:
				'`prodid-batch check` valida tu documento de descubrimiento y cada feed exactamente como lo haría el índice, sin token y sin preguntarle nada al índice. Se ejecuta desde un clon del repositorio con [Bun](https://bun.sh) 1.4.4. Dale los archivos en sí: una ruta que termina en `.json` se lee como un documento, cualquier otra como un feed NDJSON.',
			checkLabel: 'valida lo que sirves, como lo hará el índice',
			checkResult:
				'Un archivo sin problemas imprime `ok` y el número de registros que el índice tomaría de él. Si no, imprime una línea por problema, como `items.ndjson:12: message` con la línea del feed en la que está, y sale con un código distinto de cero. Lee los archivos, no tu DNS ni tu servidor, así que el registro TXT, el tipo de contenido y las cabeceras de caché de la lista de arriba siguen siendo cosa tuya.',
			rules:
				'Las reglas con las que se valida un registro están en la [especificación](/spec), los esquemas se sirven en [`/spec/schemas/v1`](/spec/schemas/v1), y [`/spec/fixtures/v1`](/spec/fixtures/v1) tiene vectores legibles por máquina con los que probar tu exportador antes de que nadie lo rastree.',
			status: 'Estado:',
			formats: 'Los formatos de archivo de esta página son los que lee el índice cuando le haces ping.',
		},
	},

	data: {
		title: 'Datos abiertos — prodid',
		description:
			'Descarga el índice completo de prodid: un volcado nocturno de cada fuente, entidad, registro, agrupación y fusión en NDJSON con gzip, bajo CC0 para lo que crea el índice y bajo la licencia de cada fuente para sus afirmaciones.',
		eyebrow: 'Datos abiertos',
		heading: 'Descarga el índice',
		lead: 'El índice es reemplazable. Todo lo que sabe y que un lector puede saber se publica como una exportación completa, un volcado, que cualquiera puede descargar y cargar en su propio índice.',
		latest: {
			heading: 'El último volcado',
			before: 'Cuando se generó esta página, el volcado más reciente era la instantánea tomada el',
			after: '. Cada noche a las 04:30 UTC se escribe uno nuevo, y',
			names: 'siempre nombra el más reciente.',
			lines: (count: string, one: boolean) => `${count} ${one ? 'línea' : 'líneas'}`,
			per: (what: string) => `Una línea por ${what}.`,
			directory: (directory: string, manifest: string, created: string, index: string, claims: string) =>
				`El directorio de este volcado es \`${directory}\`, y su manifiesto es [\`manifest.json\`](${manifest}), escrito el ${created}. Sus licencias dicen \`index: ${index}\` y \`claims: ${claims}\`.`,
		},
		holds: {
			'sources.ndjson.gz': { per: 'fuente', line: 'El estado de la fuente, exactamente como lo responde /source/{name}.' },
			'entities.ndjson.gz': {
				per: 'entidad, incluidas las fusionadas',
				line: 'El documento de la entidad exactamente como lo responde /id/{opid}?history=1, incluidas las afirmaciones retiradas.',
			},
			'records.ndjson.gz': {
				per: 'registro, incluidos los retirados',
				line: 'source, key, feed, opid, body, first_seen, last_seen, withdrawn_at.',
			},
			'groupings.ndjson.gz': { per: 'agrupación', line: 'source, kind, key, opid.' },
			'merges.ndjson.gz': { per: 'fusión, incluidas las revertidas', line: 'from, into, decided_at, reverted_at.' },
		},
		layout: {
			heading: 'Dónde se guardan los volcados',
			lead: 'Un volcado es un directorio con el nombre de la fecha UTC de su instantánea, bajo la versión en la que está escrito. `v1/` contiene los volcados v1, cuyo manifiesto y cuyas líneas de fuente y entidad son documentos v1. Contiene cinco archivos de datos y un manifiesto.',
			last: '**latest.json se escribe el último.** Es una copia del `manifest.json` del volcado más reciente, escrita después de que todos los archivos de ese volcado y su manifiesto estén en su sitio. Quien empieza por él nunca encuentra un manifiesto que nombre un archivo que aún no está, y encuentra el directorio a partir del propio `snapshot_at` del manifiesto.',
			retention:
				'**Conservación.** Un volcado diario se guarda 7 días. El primer volcado de cada mes UTC se guarda para siempre. Un volcado que se guarda nunca se reescribe: su directorio, sus archivos y su manifiesto quedan byte a byte como estaban.',
			v0: (dumps: string, latest: string) =>
				`**Volcados v0.** Los volcados v0 escritos antes de v1 siguen en \`${dumps}\`, con la misma conservación, y [\`v0/latest.json\`](${latest}) sigue nombrando el último. Validan contra los esquemas v0 para siempre.`,
			manifest: (schema: string) =>
				`**El manifiesto.** Nombra cada uno de los cinco archivos exactamente una vez, con el SHA-256 y el tamaño del archivo tal como se sirve, comprimido, y su número de líneas ya descomprimido. Comprueba cada archivo contra su resumen antes de cargarlo. El esquema es [\`${schema}\`](${schema}), con vectores en [\`/spec/fixtures/v1/dump\`](/spec/fixtures/v1/dump).`,
		},
		files: {
			heading: 'Qué contiene cada archivo',
			lead: 'Cada archivo es NDJSON comprimido con gzip, un objeto JSON por línea. Los cinco se leen de una misma instantánea coherente, así que coinciden entre sí: cada fuente que nombra una línea tiene su línea en `sources.ndjson.gz`, y cada `opid` que nombra una línea tiene la suya en `entities.ndjson.gz`.',
			table: 'Archivos del volcado',
			columns: ['Archivo', 'Una línea por', 'La línea'],
			merged: 'Entidades fusionadas',
			mergedBody:
				'Un `opid` fusionado responde `308` en el resolutor, así que no tiene documento propio que copiar. Su línea es el documento que respondería si no estuviera fusionado (sus propios identificadores y afirmaciones se quedan en él, que es lo que hace reversible una fusión) con un miembro más, `merged_into`, el `opid` de la entidad que queda. Las fusiones no se encadenan: la entidad que queda nunca está fusionada a su vez.',
			record: 'Una línea de registro',
			recordLead: 'Un registro tal como lo guarda el índice. Todas las horas en UTC, ISO 8601.',
			recordTable: 'Campos de la línea de registro',
			recordColumns: ['Campo', 'Qué es'],
			recordFields: [
				'El nombre de la fuente.',
				'La key del registro en esa fuente.',
				'La URL del feed del que se leyó. Ausente en un registro escrito por una importación de datos.',
				'El item al que se resolvió.',
				'El org.prodid.item que envió el publicador, sin cambios.',
				'Cuándo lo leyó el índice por primera vez.',
				'Cuándo lo leyó el índice por última vez.',
				'Presente exactamente cuando el registro está retirado.',
			],
			grouping: 'Una línea de agrupación',
			groupingLead:
				'A qué entidad se resolvió una agrupación de una fuente. `kind` es `family` o `variant`, y `key` es aquello por lo que se agrupan los registros de la fuente, escrito en claro y no resumido, para que otra implementación pueda emparejar con ello su propia agrupación.',
			groupingNotes: [
				'para un grupo del publicador; { "key": "<key>" } para un registro sin grupo, que forma una familia propia.',
				'la variante del registro, {} si no tiene.',
			],
			familyKey: '{ "family": <la key de la familia>, "variant": { <eje>: <valor>, … } }',
			merge: 'Una línea de fusión',
			mergeBody:
				'Una decisión de fusión: `from` el `opid` fusionado, `into` la entidad que queda, `decided_at` cuándo se tomó y `reverted_at`, presente exactamente cuando se revirtió.',
		},
		never: {
			heading: 'Lo que un volcado nunca contiene',
			lead: 'Un volcado no dice más que el resolutor, más los registros, agrupaciones y fusiones con los que se construyen sus respuestas.',
			items: [
				'La dirección de contacto de un publicador, que el índice guarda solo para enviar el aviso de lapse.',
				'El registro de rastreo, el texto de error del rastreador o cualquier otra cosa de un rastreo que el estado de la fuente no muestre.',
				'Por qué se hizo una fusión o quién la decidió.',
				'Por qué se bloqueó un hash de medio.',
				'Los bytes de los medios. El media_url de una afirmación de medio apunta al archivo, y un hash bloqueado no se sirve.',
				'Los identificadores internos de fila del índice. Cada línea nombra una fuente por su nombre y una entidad por su opid.',
				'Las concesiones de autoridad y sus pruebas. La línea de una fuente dice authoritative si lo era en snapshot_at, pero un índice cargado desde el volcado no tiene ninguna concesión hasta que su propio operador la conceda.',
			],
		},
		licences: {
			heading: 'Licencias',
			lead: 'Dos reglas, y el `licenses` del manifiesto dice ambas.',
			index: 'Todo lo que crea el índice',
			indexBody:
				'Los `opid`, las correspondencias de identificadores, la jerarquía de familias y variantes, las agrupaciones y las fusiones.',
			claims: 'Cada afirmación y cada registro',
			claimsBody:
				'Bajo la licencia que declara su propia fuente: la `license` de la línea de esa fuente en `sources.ndjson.gz`. Una fuente que no declara ninguna no ha concedido nada, y prodid no concede nada en su nombre.',
			datasets:
				'Un conjunto de datos abierto que no publica documento de descubrimiento propio entra en el índice como una fuente llamada `dataset:<slug>`, importada por el operador del índice desde la exportación pública del conjunto. Una fuente así es siempre `unverified`, y su `license` es la del propio conjunto. Las reglas están en la [especificación](/spec#dataset-sources).',
		},
		load: {
			heading: 'Cárgalo en tu propio índice',
			lead: '`prodid-batch load-dump` carga un volcado v0 o v1 en una base de datos PostgreSQL 18 vacía migrada a la misma versión, en una sola transacción. Acepta el directorio con fecha de un volcado, su `manifest.json` o un `latest.json`, en local o por HTTPS.',
			label: 'desde un clon del repositorio',
			checked:
				'Cada archivo se comprueba contra los `sha256`, `bytes` y `lines` del manifiesto antes de escribir nada, y un volcado remoto se descarga primero a un directorio temporal. Una base de datos que no está vacía se rechaza. `PRODID_OPERATOR` queda registrado como quien decidió las fusiones cargadas.',
			peek: 'Para leer un archivo sin cargarlo, compruébalo contra su resumen y descomprímelo. El resumen de abajo es el del último manifiesto cuando se generó esta página.',
			rules: 'Las reglas completas están en la especificación, en [Dumps](/spec#dumps).',
		},
	},
}
