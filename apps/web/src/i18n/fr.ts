import type { Copy } from '@/i18n/copy'
import { CONTACT } from '@/lib/spec'

export const fr: Copy = {
	common: {
		skip: 'Aller au contenu',
		home: 'prodid, accueil',
		primary: 'Navigation principale',
		nav: {
			spec: 'Spécification',
			specShort: 'Spéc.',
			publish: 'Publier',
			publishShort: 'Publier',
			data: 'Données',
			dataShort: 'Données',
			menu: 'Menu',
		},
		toDark: 'Passer au thème sombre',
		toLight: 'Passer au thème clair',
		language: 'Langue',
		status:
			'Spec v1. L’index et l’éditeur hébergé tournent sur prodid.org. Tout le monde peut publier, sur son propre domaine ou en hébergé.',
		normative: 'La spécification est publiée en anglais uniquement, et c’est le texte anglais qui fait foi.',
		imageAlt:
			'prodid : les éditeurs publient les informations produit sur leurs propres domaines, un index ouvert relie chaque code à un identifiant permanent, et chacun peut télécharger l’index entier.',
		support: {
			label: 'Soutenir prodid',
			heading: 'prodid est open source. Aidez-le à grandir.',
			body: 'Mettez une étoile au dépôt pour que d’autres le trouvent, signalez ce qui ne va pas, envoyez un correctif ou écrivez-nous ici, sans compte GitHub.',
			star: 'Mettre une étoile sur GitHub',
			stars: (count: string) => `${count} étoiles`,
			contribute: 'Contribuer',
			chat: 'Nous écrire',
		},
		footer: {
			tagline: 'Une couche ouverte d’identité et de données pour chaque produit physique.',
			label: 'Pied de page',
			site: 'Site',
			specification: 'Spécification',
			publish: 'Publier vos produits',
			github: 'Code source sur GitHub',
			contact: 'Contact',
			report: 'Signaler un problème',
			security: 'Sécurité',
			licence:
				'La spécification et les schémas sont sous CC0, tout comme les `opid` et les correspondances d’identifiants que publie prodid.org. Toute autre assertion porte la licence de la source qui l’a faite. L’implémentation de référence est sous Apache-2.0.',
		},
	},

	home: {
		title: 'prodid — une identité ouverte pour chaque produit physique',
		description:
			'prodid donne à chaque produit physique un identifiant ouvert et permanent. GTIN, MPN et tous les autres codes s’y résolvent, et chaque information est une assertion attribuée à sa source.',
		badge: 'Spec v1 · en ligne',
		headline: 'Un code-barres n’est pas un produit.',
		headlineAccent: 'prodid, si.',
		lead: 'Un identifiant ouvert et permanent pour chaque produit physique. Chaque code-barres et chaque référence fabricant s’y résolvent, et chaque information indique la source qui l’a donnée.',
		ctaPublish: 'Publier vos produits',
		ctaSpec: 'Lire la spécification',
		resolve: {
			label: 'Essayez : résolvez un code d’étiquette',
			button: 'Résoudre',
			hint: 'Saisissez un code de 8 à 14 chiffres.',
		},
		close: {
			heading: 'Donnez à vos produits une identité qui survit au code-barres.',
			body: 'Deux fichiers et un enregistrement DNS sur votre propre domaine, ou un site hébergé sans aucun domaine.',
		},
		heroKind: (brand: string) => `Item · ${brand}`,
		heroVariant: (markets: string) => `marine · M · vendu en ${markets}`,
		heroLapsed: (source: string) => `lapsed · ${source}`,
		heroCaption: 'Ce que renvoie le scan du code sur l’étiquette. L’enregistrement est l’exemple de la spécification.',
		sceneLabel:
			'Les éditeurs sur leurs propres domaines, les éditeurs hébergés et les jeux de données ouverts envoient des assertions à un index ouvert, qui résout le code d’un produit et publie l’index entier sous forme de dumps.',
		sceneCaption:
			'Les éditeurs publient leurs informations sur leurs propres domaines, en hébergé ou depuis des jeux de données ouverts. L’index relie chaque code de l’étiquette à un opid permanent, et l’index entier est téléchargeable.',
		problem: {
			eyebrow: 'Le problème',
			heading: 'Quatre codes, une veste, et rien pour les relier.',
			body: 'Un produit reçoit un nouveau code-barres pour chaque marché, chaque format et chaque changement d’emballage, et ses données vivent dans un système différent pour chacun. Quand deux d’entre eux se contredisent, l’un est écrasé sans bruit.',
			answer: 'prodid donne au produit lui-même un identifiant qui ne change pas quand le code-barres change.',
			figure: 'Plusieurs codes qui se résolvent en une seule variante',
			anotherGtin: 'un autre GTIN',
			codes: ['unité de vente pour DE et TR', 'la même veste en lot de deux', 'l’emballage de l’an prochain', 'référence fabricant'],
			variant: 'Une variante',
			variantNote: 'Jamais réutilisé, jamais supprimé. Tout code qui a un jour pointé ici continue de fonctionner.',
		},
		model: {
			eyebrow: 'Le modèle',
			heading: 'Famille, variante, item. Les codes pointent vers eux ; ils ne sont pas eux.',
			lead: 'Chaque niveau a son propre `opid` : 16 caractères qui n’encodent rien, si bien que rien dans le produit ne peut les rendre faux.',
			levels: [
				{ title: 'Acme Trail Jacket', note: 'Le produit tel qu’on en parle.' },
				{ title: 'marine · taille M', note: 'Une combinaison de couleur, de taille et autres.' },
				{ title: 'Unité de vente pour DE et TR', note: 'L’objet qui porte un code-barres.' },
			],
			after:
				'Un nouvel emballage ajoute un nouvel item avec un nouveau code-barres, sous la même variante et la même famille. Rien de ce qui pointait vers l’ancien ne casse.',
		},
		how: {
			start: 'Commencer à publier',
			eyebrow: 'Comment ça marche',
			heading: 'Publiez sur votre domaine. prodid l’indexe. Tout le monde le résout.',
			publish: {
				step: '01 · Publier',
				title: 'Trois éléments sur votre domaine',
				body: 'Un document de découverte, un flux avec un produit par ligne, et un enregistrement DNS qui prouve que le domaine est à vous.',
				link: 'Comment publier →',
			},
			index: {
				step: '02 · Indexer',
				title: 'Vérifié, rapproché, attribué',
				checks: [
					'chaque ligne validée par le schéma',
					'rapprochée d’un opid existant, ou d’un nouveau',
					'chaque champ enregistré comme une assertion de votre domaine',
				],
				body: 'Distributeurs, registres et jeux de données ouverts sont des sources de la même façon : à côté du fabricant, jamais au-dessus.',
				link: 'Comment fonctionnent les assertions →',
			},
			resolve: {
				step: '03 · Résoudre',
				title: 'Une URL, imprimée sur le produit',
				browser: 'Navigateur → une page',
				api: 'API → l’enregistrement JSON',
				body: 'Le chemin suit la syntaxe GS1 Digital Link : il peut donc être le QR code de l’étiquette lui-même.',
				link: 'Comment fonctionne la résolution →',
			},
		},
		claims: {
			eyebrow: 'Assertions',
			heading: 'Chaque information nomme sa source. Les désaccords restent visibles.',
			lead: 'Rien n’est fusionné en une seule « vérité ». Quand une source cesse de publier, ses assertions sont conservées et marquées lapsed, pas supprimées.',
			caption: 'Les assertions de l’item d’exemple de la spécification',
			columns: ['Propriété', 'Valeur', 'Source', 'Confiance', 'Vu'],
			lapsed: ' · lapsed',
			trust: [
				'Contrôle le domaine et est confirmé comme titulaire de la marque.',
				'A prouvé le contrôle d’un domaine par DNS ou par son propre site.',
				'Un nom hébergé sans domaine, un jeu de données ou une contribution.',
			],
			details: 'Voir la requête et l’enregistrement JSON complet',
			request: 'En-têtes de requête et de réponse',
		},
		who: {
			links: ['Publier sur votre domaine', 'Choisir une voie', 'Obtenir les données'],
			eyebrow: 'Pour qui',
			heading: 'Ceux qui produisent les données, et ceux qui en ont besoin.',
			audiences: [
				{
					title: 'Fabricants',
					body: 'Publiez vos données produit une fois, sur votre propre domaine. Aucune fiche revendeur ni place de marché ne possède la description de ce que vous fabriquez.',
				},
				{
					title: 'Éditeurs d’e-commerce, d’ERP et de PIM',
					body: 'Un document de découverte et un flux par domaine marchand, générés à partir de données que vous avez déjà.',
				},
				{
					title: 'Développeurs',
					body: 'Résolvez n’importe quel code en un identifiant qui survit au reconditionnement. Chaque information dit qui l’a donnée, quand, et si cette source la soutient encore.',
				},
			],
			passport:
				'**À propos du passeport numérique des produits de l’UE.** L’ESPR exige un passeport accessible depuis un support de données sur le produit, et GS1 Digital Link est l’une des syntaxes de support en cours de normalisation pour cela. prodid n’est pas un service de passeport et publier ici ne vaut conformité à rien ; c’est le même travail de fond : un enregistrement lisible par machine par produit, à une adresse stable que vous contrôlez.',
		},
		status: {
			eyebrow: 'État',
			heading: 'Où en est réellement le projet.',
			stable: {
				label: 'Stable',
				title: 'Spécification v1.',
				body: `Elle ne change que par ajout ; tout le reste serait une v2. Un document de découverte v0 est accepté jusqu’au 2027-01-26 00:00 UTC. [Lisez-la](/spec) et [dites où elle se trompe](${CONTACT.issues}).`,
			},
			sources: {
				label: 'Canary et un jeu de données',
				title: 'Aucun catalogue d’éditeur n’est encore indexé.',
				body: 'L’index contient deux sources : le canary du projet, [canary.prodid.org](https://prodid.org/source/canary.prodid.org), qui prouve la publication, l’exploration et la résolution de bout en bout, et [dataset:wikidata](https://prodid.org/source/dataset:wikidata), un import de test limité à 5 éléments Wikidata, unverified et sous CC0-1.0.',
			},
			design: {
				label: 'Par conception',
				title: 'L’index est remplaçable.',
				body: 'La spécification, les schémas, les opid et les correspondances de codes sont sous [CC0](/spec#licensing). Chaque assertion garde la licence de sa source. Les informations vivent sur les domaines qui les publient : chacun peut les explorer à nouveau, et les codes imprimés gardent leur sens.',
			},
		},
	},

	publish: {
		title: 'Publier vos produits — prodid',
		description:
			'Comment un fabricant ou un éditeur de logiciel publie ses données produit sur prodid : le document de découverte, le flux NDJSON, l’unique enregistrement DNS TXT qui porte l’identité, et le ping.',
		eyebrow: 'Guide de l’éditeur',
		heading: 'Publier vos produits',
		lead: 'Publier sur prodid, c’est mettre deux fichiers sur le web et un enregistrement dans le DNS. Sur votre propre domaine, il n’y a ni inscription ni clé à garder : le domaine est l’identifiant, et vous modifiez ou retirez ce que vous publiez en modifiant les fichiers.',
		discovery: {
			heading: 'Comment l’index vous trouve',
			lead: 'À savoir avant tout le reste, car c’est ce qui décide laquelle des trois voies ci-dessous est la vôtre. La découverte repart de zéro à chaque exploration, DNS d’abord, et rien du chemin vers vos données n’est mémorisé d’une exploration à l’autre.',
			first: 'D’abord',
			firstTitle: 'Un enregistrement DNS TXT sur `_prodid.acme.example`',
			firstBody:
				'S’il y a un enregistrement `v=prodid0`, il est suivi exclusivement, même s’il nomme votre propre domaine. L’enregistrement nomme un *hôte* ; le document est toujours `https://<host>/.well-known/prodid.json`.',
			second: 'Seulement s’il n’y a pas d’enregistrement',
			secondBody: 'Le document sur le domaine lui-même. Celui qui sert le domaine en HTTPS parle pour lui.',
			why: 'Le DNS passe en premier parce que c’est la preuve la plus forte : qui peut déposer un fichier sur un hôte n’est pas toujours le propriétaire du domaine, et le propriétaire doit pouvoir passer outre. C’est aussi pourquoi vous devriez écrire l’enregistrement même si vous servez le fichier vous-même ; [voie 1, étape 3](#own-domain) explique ce que cela vous apporte.',
			one: '**Un seul enregistrement, et rien derrière.** Plus d’un enregistrement `v=prodid0` à ce nom est une erreur, pas un choix entre eux, et un seul enregistrement mal formé ou trop long est aussi une erreur. Il n’y a pas de repli : dès qu’un enregistrement existe, un enregistrement qui ne fonctionne pas met fin à la découverte au lieu d’envoyer le robot voir votre domaine. Si vous changez d’hôte, remplacez l’enregistrement ; n’en ajoutez jamais un second. La grammaire, avec vecteurs de test, est dans la [spécification](/spec#the-_prodid-txt-record).',
			answer:
				'**Ce qui compte comme une réponse.** HTTP 200 après au plus une redirection, un type de contenu JSON, un corps valide selon le schéma du flux, et un `domain` qui nomme le domaine découvert. Un site qui répond aux chemins inconnus par une page HTML et un 200 ne répond pas, pas plus qu’un document servi en `text/html`.',
		},
		routes: {
			heading: 'Choisissez comment publier',
			lead: 'L’identité et l’hébergement sont séparés. Votre identité est un domaine que vous contrôlez ; l’endroit où les documents sont servis est un détail que vous pouvez changer plus tard sans changer votre identité ni aucun identifiant que prodid a attribué à vos produits. Trois voies, qui produisent exactement les mêmes enregistrements.',
			route: (n: string) => `Voie ${n}`,
			detail: (n: string) => `La voie ${n} en détail →`,
			start: 'Commencer sur publish.prodid.org →',
			identity: 'Identité',
			trust: 'Confiance',
			items: [
				{
					when: 'Vous pouvez servir des fichiers sur votre propre domaine.',
					who: 'Une marque avec une équipe IT, ou une plateforme (e-commerce, ERP, PIM) qui publie pour chaque marchand qu’elle héberge.',
					how: 'Servez le document de découverte sur le domaine et publiez un enregistrement TXT qui nomme le domaine lui-même.',
					identity: 'le domaine',
				},
				{
					when: 'Vous avez un domaine mais ne pouvez pas y servir de fichiers.',
					who: 'Un fabricant dont le site est sur une plateforme qu’il ne contrôle pas.',
					how: 'Publiez sur un slug hébergé et faites pointer un enregistrement TXT de votre domaine vers cet hôte.',
					identity: 'le domaine, prouvé par le DNS',
				},
				{
					when: 'Vous n’avez pas de domaine du tout.',
					who: 'Un petit producteur ou une coopérative.',
					how: 'Publiez sur un slug hébergé. Ajoutez un domaine plus tard sans rien perdre.',
					identity: 'l’hôte du slug',
				},
			],
			hosted:
				'Les voies 2 et 3 utilisent le service de publication hébergé sur `<slug>.prodid.org`. Connectez-vous sur [publish.prodid.org](https://publish.prodid.org/) avec un lien envoyé par e-mail, créez un site, téléversez votre fichier et connectez un domaine si vous en avez un. Vous pouvez tout exporter ou supprimer le site à tout moment.',
		},
		table: {
			field: 'Champ',
			required: 'Requis',
			what: 'Ce que c’est',
			yes: 'oui',
			no: 'non',
			delegating: 'en délégation',
		},
		own: {
			copy: 'Copier',
			copied: 'Copié',
			eyebrow: 'Voie 1',
			heading: 'Publier sur votre propre domaine',
			lead: 'Deux fichiers et un enregistrement DNS. Une plateforme qui publie pour des marchands fait la même chose sur chaque domaine marchand, si bien que chacun garde sa propre identité et son propre niveau de confiance.',
			step1: 'Étape 1 — Servir le document de découverte',
			step1Lead: (url: string) => `Un fichier, à un chemin fixe, qui indique où sont vos flux produit : \`${url}\``,
			feedCaption: 'L’exemple de spec/fixtures/v1/examples/prodid.json, rendu à partir du fichier lui-même.',
			feedTable: 'Champs du document de découverte',
			feedFields: [
				'Toujours org.prodid.feed.',
				'1. Un document à 0 est accepté par les explorations qui commencent avant le 2027-01-26 00:00 UTC et refusé ensuite, comme un négatif définitif.',
				'Le nom qu’une personne doit voir à côté de vos assertions.',
				'Une adresse e-mail que quelqu’un lit vraiment. C’est là que l’index écrit quand votre source passe en lapse, et c’est le seul avertissement que vous recevrez.',
				'Identifiant SPDX couvrant les informations de vos flux, par exemple CC0-1.0.',
				'Jusqu’à 100 URL https, toutes sur le même hôte que ce document.',
				'Le domaine pour lequel ce document parle. Requis dès que le document est atteint via un enregistrement TXT qui nomme un autre hôte, et il doit alors être égal à ce domaine. Facultatif quand le domaine sert lui-même le document, et s’il est présent il doit quand même correspondre.',
			],
			serve:
				'Servez-le en HTTPS sur le port par défaut, avec un certificat valide, en `application/json`, ou tout `application/…+json`. Ne le redirigez pas vers un autre hôte : la seule redirection que suit le robot va de `acme.example` à `www.acme.example`.',
			step2: 'Étape 2 — Servir le flux',
			step2Lead:
				'Un flux est du NDJSON : un objet JSON complet par ligne, UTF-8, séparé par des retours à la ligne. Pas de tableau autour, pas de virgules entre les lignes. Ainsi un flux de deux millions de produits se lit ligne à ligne, et une ligne défectueuse ne vous coûte que cette ligne, pas le reste.',
			itemsCaption:
				'Trois variantes d’un produit, tirées de spec/fixtures/v1/examples/items.ndjson. Elles partagent un group, donc l’index en construit une famille à trois variantes.',
			sameHost:
				'**Les flux vivent sur le même hôte que le document qui les liste.** Un document de découverte qui nomme un flux sur un autre hôte est rejeté entièrement, pas en partie : vous perdez toute la source, pas un flux, et cela compte comme un négatif définitif, donc cela déclenche l’horloge de lapse décrite plus bas. Servir le JSON depuis votre site et le NDJSON depuis un nom d’hôte CDN séparé est un souhait légitime, mais non pris en charge en v1. Mettez les deux sur un seul hôte.',
			firstLine: 'La première de ces lignes, mise en forme pour la lecture :',
			itemLabel: 'un enregistrement org.prodid.item',
			itemTable: 'Champs de l’enregistrement item',
			itemFields: [
				'Toujours org.prodid.item.',
				'Votre nom stable pour cet enregistrement dans le flux. Publier à nouveau la même key remplace l’ancien.',
				'La marque telle qu’elle figure sur le produit. Elle est normalisée avant de délimiter un mpn, si bien que ARÇELİK et Arçelik sont une seule marque, pas deux.',
				'Le nom du produit, sans les axes de variante.',
				'Au moins un { scheme, value }, et au moins un que l’index peut stocker. Les valeurs n’ont pas d’espace aux extrémités et ne sont pas vides. Un gtin doit avoir 8, 12, 13 ou 14 chiffres avec une clé de contrôle correcte et ne pas être que des zéros ; un mpn exige une brand qui se normalise en quelque chose, car c’est le périmètre dans lequel il est unique ; un gtin à diffusion restreinte est conservé, mais seulement comme votre propre rcn. Un enregistrement sans rien de stockable n’identifie rien et est ignoré.',
				'Étiquette BCP 47 pour le texte lisible de cet enregistrement.',
				'Votre propre clé de regroupement. Les items qui la partagent sont les variantes d’une même famille.',
				'Les axes qui distinguent cet item dans le groupe : couleur, taille, capacité.',
				'Code de brique GS1 GPC, écrit gpc: suivi de huit chiffres.',
				'Codes ISO 3166-1 alpha-2 des marchés où cet item est vendu.',
				'Chaînes, nombres, booléens, listes, ou { value, unit } pour une mesure.',
				'Jusqu’à 20 URL https, chacune avec un kind et une licence SPDX de la liste acceptée. Contrairement aux flux, elles peuvent être sur n’importe quel hôte.',
			],
			flat: 'Envoyez des items à plat. Vous ne construisez jamais vous-même de familles ni de variantes et n’envoyez jamais d’`opid` : l’index déduit les premières de `group` et attribue les seconds. Si vous produisez déjà un flux Google Merchant, `group` est votre `item_group_id`.',
			barcodes:
				'Deux choses à savoir sur les codes-barres avant d’exporter. Un `gtin` composé uniquement de zéros n’est pas un code-barres mais un emplacement réservé de catalogue, et un enregistrement qui en porte un est rejeté comme une mauvaise clé de contrôle. Un [numéro à diffusion restreinte](/spec#which-gtins-are-identifiers), c’est-à-dire les plages réservées au magasin, est stocké et vous est attribué, mais il n’identifie rien au niveau mondial : il ne fusionne jamais votre produit avec celui d’un autre, et `/01/` ne le résout pas.',
			step3: 'Étape 3 — Revendiquer l’identité dans le DNS',
			step3Lead: 'Une fois les fichiers en ligne, publiez un enregistrement qui nomme votre propre domaine comme hôte.',
			step3Why:
				'Il pointe exactement vers ce que la découverte aurait trouvé de toute façon : rien ne change pour vos données. Ce qui change, c’est ce que peut faire quelqu’un qui a seulement le droit d’ajouter des entrées à votre DNS. Sans enregistrement, un enregistrement ajouté par lui s’empare silencieusement de votre identité, car le DNS l’emporte sur le fichier. Avec votre enregistrement déjà en place, un second fait échouer la découverte avec *plus d’un enregistrement* : un lapse, visible, notifié et réversible.',
			neverDelegate:
				'**Ne déléguez jamais `_prodid` à un prestataire.** Le droit d’écriture sur `_prodid.<domain>` est le contrôle de votre identité, exactement comme pour DKIM ou un challenge ACME DNS-01. Un domaine dont le DNS est partagé est une identité partagée. Donnez le flux à une agence, pas l’enregistrement.',
			order:
				'Mettez les fichiers en ligne avant l’enregistrement, pas après : un enregistrement qui pointe vers un document absent est une découverte échouée. Les valeurs sont lues sans tenir compte de la casse et un point final est accepté, donc `ACME.Example.` et `acme.example` sont le même hôte.',
			step4: 'Étape 4 — Signaler le changement à l’index',
			step4Lead:
				'Facultatif. Chaque domaine connu est réexploré selon un calendrier ; un ping ne fait qu’avancer la prochaine exploration.',
			pingLabel: 'demander à l’index de lancer la découverte maintenant',
			ping: '`{"domains": [...]}` en accepte jusqu’à 1000 à la fois : c’est ainsi qu’une plateforme présente chaque marchand qu’elle héberge. Il n’y a pas de clé à envoyer, car le ping ne donne à l’appelant aucune prise sur le contenu, et `202` est tout ce qu’il répond. Il ne dit pas si le domaine était connu, si quelque chose a été trouvé ni si quelqu’un d’autre l’a pingé il y a une minute. Un `429` signifie seulement que *vous* dépassez votre propre budget de requêtes, et les erreurs arrivent en `application/problem+json`. Ce qui est arrivé à votre domaine apparaît dans votre [état de source](#after), pas dans le ping.',
		},
		delegated: {
			eyebrow: 'Voie 2',
			heading: 'Déléguer l’hébergement, garder l’identité',
			lead: 'Beaucoup de fabricants possèdent un domaine sans pouvoir y déposer de fichier. Le flux est hébergé ailleurs et le domaine prouvé par le DNS : l’identité de la source reste le domaine et le niveau de confiance reste `verified`. Créez un site sur [publish.prodid.org](https://publish.prodid.org/), saisissez votre domaine ; il affiche l’enregistrement exact à ajouter et le vérifie pour vous.',
			looks: 'À quoi cela ressemble',
			steps: [
				'**Un catalogue téléversé sur un slug hébergé**, par exemple `acme.prodid.org`, qui sert à la fois le document de découverte et le flux.',
				'**Un enregistrement TXT sur le domaine que vous possédez**, qui nomme cet hôte. Un hôte, jamais une URL : un enregistrement ne peut donc jamais diriger le robot vers une adresse arbitraire.',
				'**Un document qui nomme votre domaine en retour.** Le DNS dit *mon document est là-bas* ; le document dit *je parle pour ce domaine*. Un document délégué sans `domain` est rejeté : l’absence ne vaut jamais consentement, et c’est ce qui empêche quiconque de pointer un enregistrement vers le flux de quelqu’un d’autre.',
			],
			caption:
				'Tiré de spec/fixtures/v1/examples/prodid.delegated.json. La seule différence avec la voie 1 est le champ domain, et ici il est obligatoire.',
			window:
				'L’éditeur hébergé n’écrit `domain` dans le document qu’après avoir vu lui-même votre enregistrement TXT : il n’y a donc aucun moment où un document revendique un domaine qui ne l’a pas demandé.',
		},
		hosted: {
			eyebrow: 'Voie 3',
			heading: 'Publier sans domaine',
			lead: 'Un producteur sans aucun domaine publie sur un slug hébergé, `<slug>.prodid.org`, sous son propre nom. Réservez-en un sur [publish.prodid.org](https://publish.prodid.org/). L’identité de la source est l’hôte du slug et le niveau de confiance `unverified`, car rien n’a été prouvé sur un domaine. Les enregistrements sont de vrais enregistrements : identifiants, résolution, attribution.',
			merchant:
				'La plupart des éditeurs dans cette situation tiennent déjà un fichier produit [Google Merchant](https://support.google.com/merchants/answer/7052112) ; la correspondance entre un tel fichier et des enregistrements `org.prodid.item` est donc écrite dans la spécification, colonne par colonne, avec ce qu’elle écarte délibérément : prix, disponibilité, livraison et état appartiennent à un vendeur un jour donné, pas au produit. [Importer un flux Merchant](/spec#appendix-importing-a-merchant-feed) vaut la lecture avant d’exporter : publish.prodid.org convertit le CSV ou le TSV que vous téléversez avec exactement cette correspondance. Quatre points y décident de la forme de votre tableur :',
			rules: [
				'**Quatre colonnes deviennent des axes de variante** : `color`, `size`, `material` et `pattern`, celles entre lesquelles un acheteur choisit au sein d’un même `item_group_id`. `gender`, `age_group`, `size_type` et `size_system` restent des propriétés ordinaires : elles décrivent tout le groupe, et en axes elles scinderaient un produit en plusieurs dès que quelqu’un écrirait l’une d’elles de deux façons.',
				'**Un attribut répété est séparé par des virgules ou à en-tête répété, par fichier, pas par cellule.** Une cellule n’est découpée sur les virgules que si son en-tête n’apparaît qu’une fois dans tout le fichier ; répétez l’en-tête et chaque cellule en dessous est prise entière. C’est la seule façon de transporter une valeur contenant une virgule, et c’est une décision prise une fois pour le fichier. Cela vaut pour `additional_image_link`, `product_type`, `product_highlight`, `product_detail` et `certification` ; tout le reste, y compris une `description` pleine de virgules, est pris entier dans tous les cas.',
				'**Un `product_detail` n’écrase jamais rien.** Son sous-attribut du milieu devient la clé de propriété, le nom de section est abandonné, et la première valeur d’une clé l’emporte. Un detail ultérieur avec la même clé, ou qui tombe sur une clé déjà produite par la correspondance, est abandonné et signalé avec sa ligne : une colonne detail ne peut jamais redéfinir en douce ce que disait le reste de la ligne.',
				'**Une licence média doit être déclarée.** Le format Merchant n’a pas de colonne pour cela et [rien n’est ingéré sans licence](/spec#licences-that-can-be-ingested) ; un import déclare donc un seul identifiant SPDX acceptable couvrant chaque image et chaque document du fichier. Votre propre colonne `license` le remplace ligne par ligne, et un fichier dont la licence déclarée n’est pas acceptable produit des enregistrements sans média plutôt que des enregistrements en échec.',
			],
			skipped:
				'Une ligne qui ne peut pas devenir un enregistrement (aucun identifiant utilisable, un GTIN dont la clé de contrôle est fausse) est ignorée et signalée par son numéro de ligne dans le tableur, l’en-tête comptant comme ligne 1 : une mauvaise ligne coûte cette ligne et pas l’import. Un fichier d’exemple pour vous comparer se trouve dans [`/spec/fixtures/merchant`](/spec/fixtures/merchant) : un CSV, les enregistrements qu’il doit produire et la ligne qui doit être ignorée.',
			later:
				'Ce qui compte pour une décision prise aujourd’hui, c’est la suite. Ajouter un enregistrement TXT sur un domaine que vous acquérez, nommant ce même hôte, transforme le slug en domaine à la prochaine exploration : **même source, mêmes enregistrements, chaque `opid` conservé**, et la confiance passe de `unverified` à `verified`. Vos identifiants `sku` sont rattachés à la source elle-même plutôt qu’à son nom, ils survivent donc au changement. Sur publish.prodid.org, c’est le même champ domain que celui de la voie 2.',
		},
		trust: {
			heading: 'Ce que la confiance veut dire ici',
			lead: 'La confiance est une propriété de la source, pas d’une assertion. Elle dit ce qui a été prouvé sur qui parle, et rien sur la justesse d’une information donnée. C’est à l’utilisateur des données de décider quoi en faire.',
			table: 'Niveaux de confiance',
			level: 'Niveau',
			meaning: 'Signification',
			levels: [
				'Contrôle du domaine prouvé et propriété de la marque confirmée.',
				'Contrôle du domaine prouvé, par l’enregistrement TXT ou par le domaine qui sert le document.',
				'Un slug hébergé sans domaine, un import de jeu de données ou une contribution de la communauté.',
			],
			only: 'Seule une source dont l’identité est un domaine peut être plus que `unverified`. `verified` vient de l’exploration. `authoritative`, non, car aucune exploration ne peut prouver à qui appartient une marque : l’opérateur de l’index l’accorde, et seulement sur preuve.',
			rules: [
				{
					title: 'La preuve, c’est votre préfixe entreprise GS1.',
					body: 'Le préfixe entreprise GS1 des GTIN que votre source publie sous la marque doit être concédé à l’organisation qui contrôle votre domaine, comme le montre la recherche publique « Verified by GS1 ». L’URL de cette recherche est conservée avec l’attribution comme preuve.',
				},
				{
					title: 'Une attribution nomme une marque, et chacune peut être révoquée.',
					body: 'La marque est enregistrée sous sa forme [normalisée](/spec#brand-normalization). Une source peut détenir des attributions pour plusieurs marques, et l’opérateur révoque chacune séparément.',
				},
				{
					title: 'Une attribution ne survit pas à la preuve qui la fonde.',
					body: 'Votre source est `authoritative` exactement tant que le contrôle de son domaine est prouvé, qu’elle n’est pas [lapsed](/spec#lapse) et qu’elle détient au moins une attribution non révoquée. Perdez la preuve de domaine ou passez en lapse, et elle redescend aussitôt à ce que la preuve restante permet (`verified` pendant le lapse, moins si la preuve de domaine a aussi disparu) sans que personne n’intervienne. Elle redevient `authoritative` dès que les trois conditions sont à nouveau réunies.',
				},
				{
					title: 'Elle couvre la source, pas la marque.',
					body: 'La confiance reste une propriété de la source : une attribution pour une marque rend `authoritative` chaque assertion de votre source, y compris celles sur des marques pour lesquelles elle n’a pas d’attribution.',
				},
			],
			ask: `Pour la demander, publiez d’abord sur votre propre domaine, puis [faites la demande avec le formulaire](${CONTACT.authoritative}), en indiquant votre domaine, la marque et une recherche Verified by GS1 pour l’un de ses GTIN. L’opérateur vérifie dans Verified by GS1 les GTIN que votre source publie sous cette marque. La demande est publique.`,
		},
		after: {
			heading: 'Après la publication',
			edit: {
				title: 'Modifier un enregistrement, c’est modifier une ligne.',
				body: 'Publier un enregistrement avec une key existante remplace le précédent. Il n’y a pas de point d’API de mise à jour, car le flux est l’état.',
			},
			remove: {
				title: 'Supprimer une ligne retire vos assertions, pas le produit.',
				body: 'Une key qui disparaît d’un flux récupéré en entier marque vos assertions à son sujet comme retirées. L’entité et son identifiant restent : les liens des autres vers elle continuent de fonctionner, tout comme les assertions des autres sources.',
			},
			retire: {
				title: 'Retirer une URL de flux du document la met hors service immédiatement.',
				body: 'Quand une exploration lit un document qui ne nomme plus l’une de vos URL de flux, chaque enregistrement actif de ce flux est retiré aussitôt, comme si toutes ses keys avaient disparu, et l’URL n’est plus récupérée. Le délai de grâce de sept jours décrit plus bas ne s’applique pas : retirer une URL, c’est dire que le fichier n’existe plus, et l’index vous prend au mot. La lister à nouveau plus tard la fait revenir, relue depuis zéro. Servez le document avec un `ETag` si possible : un `304` signifie que la liste n’a pas changé, donc rien n’est mis hors service.',
			},
			broken: {
				title: 'Une ligne défectueuse retarde le retrait de sept jours ; elle ne l’empêche pas.',
				body: 'Une ligne de plus de 64 KiB, illisible ou invalide est ignorée et comptée. Comme la key d’une ligne ignorée est inconnue, un flux avec des lignes ignorées ne retire rien pendant sept jours. Ensuite, les keys absentes sont retirées comme d’habitude. Le compteur est public : un flux qui perd des lignes en silence ne passe pas inaperçu.',
			},
			unreadable: {
				title: 'Un flux que le robot ne peut pas lire n’est pas sans conséquence.',
				body: 'Une exploration ne réussit que si *tout ce que liste le document* a été lu : un document acceptable, et chaque flux qu’il contient répond `200` ou `304`. Un flux qui expire ne vous fait pas perdre les autres (les flux qui ont répondu sont ingérés, et rien n’est retiré lors d’une exploration échouée), mais l’exploration compte comme une erreur de transport, et `feeds_failed` l’indique dans votre état. Un document parfaitement sain devant une URL de flux morte pour de bon passe donc en lapse sur la même horloge de sept jours qu’un domaine qui ne répond plus du tout, et perd le catalogue trente jours plus tard. Une URL de flux que vous ne servez plus doit être retirée du document, pas laissée à l’abandon.',
			},
			lapse: {
				title: 'Si la découverte cesse de réussir, votre source passe en lapse.',
				body: [
					'Un **négatif définitif**, c’est-à-dire une découverte qui se termine sans document acceptable (ni enregistrement ni document ; un enregistrement mal formé, trop long ou en double ; ou un document qui n’est pas en 200, pas en JSON, pas valide, qui ne s’accorde plus sur `domain` ou qui liste un flux hors de son hôte), fait passer la source en lapse immédiatement. Une **erreur de transport** (expiration DNS, 5xx, 429, limite atteinte, sur le document ou sur un flux) ne change rien en soi, mais sept jours consécutifs où chaque tentative se termine ainsi vous font aussi passer en lapse : renvoyer des erreurs indéfiniment n’est pas un moyen de figer vos assertions.',
					'**Ce bénéfice du doute appartient à un hôte, pas à vous.** Il ne s’applique qu’à un hôte où votre source a déjà été vérifiée. Sur un hôte où elle ne l’a jamais été (un nouveau slug, un hôte vers lequel vous venez de pointer `_prodid`, tout ce qui relève des voies 2 et 3), toute erreur, expiration et 5xx compris, est un négatif définitif et vous fait passer en lapse immédiatement. C’est voulu : sinon, une source vérifiée pourrait pointer son enregistrement vers un hôte qu’elle ne contrôle pas et déduire, selon que son lapse commence aujourd’hui ou dans une semaine, si cet hôte est en ligne. Changer d’hôte ne vous coûte rien pour autant. La première exploration réussie sur le nouvel hôte efface tout, et un lapse reste réversible pendant les 30 jours qui précèdent tout retrait.',
					'Une source en lapse n’accepte plus de nouvelles assertions, est affichée comme lapsed aux lecteurs, et son `publisher.contact` est prévenu. Une exploration d’une source en lapse n’écrit rien tant qu’elle n’a pas entièrement réussi ; ce n’est qu’alors que le lapse est levé. Après 30 jours de lapse continu, vos **enregistrements et leurs assertions actives sont retirés ensemble** et restent dans l’historique. Ces 30 jours sont votre fenêtre de récupération ; c’est pourquoi l’adresse de contact doit être lue par quelqu’un.',
					'Revenir ne demande aucun changement. Servez le même document et le même flux que d’habitude, et tout ce que vous publiez est de nouveau affirmé dès que la découverte réussit, qu’un octet ait bougé ou non : tant qu’il ne détient rien d’actif de vous, l’index renonce aux requêtes conditionnelles, si bien qu’un fichier inchangé n’est jamais une raison de rester retiré.',
				],
			},
			seen: {
				title: '`seen_at` est une affirmation continue, et un long lapse la remet à zéro.',
				body: 'Chaque assertion qu’un lecteur voit porte `seen_at` : non pas la date de première publication de l’information où que ce soit, mais *depuis quand cette source affirme cette valeur sans interruption*. Il survit à chaque nouvelle exploration qui trouve la même valeur, c’est tout son intérêt. Il ne survit pas à un retrait. Laissez votre source en lapse plus de 30 jours et la date de chaque information repart du jour de votre retour, car pendant l’interruption personne de vérifiable ne la soutenait. Les lignes retirées restent, donc `?history=1` montre l’interruption au lieu de la cacher ; [ce que voit un lecteur](/spec#an-entity) est dans la spécification.',
			},
			status: {
				title: 'Votre source a une page d’état publique.',
				body: '`/source/acme.example` vous montre que quelque chose ne va pas : le résultat de la dernière exploration, le chemin pris par la découverte, le nombre d’enregistrements modifiés, de lignes ignorées, de flux illisibles, et si vous êtes en lapse et depuis quand. Elle ne rapporte que ce que publie votre domaine et quand l’index a regardé, jamais qui a demandé une exploration.',
			},
			media: {
				title: 'Les médias sont analysés, pas crus sur parole, et une mauvaise entrée ne coûte qu’elle-même.',
				sniffed:
					'Le type est déterminé en lisant les octets ; votre `Content-Type` n’est qu’un indice. Six types sont stockés et rien d’autre : JPEG, PNG, GIF, WebP et AVIF en `image`, PDF en `document`. Pas de SVG, pas de HTML, pas d’archives, pas de fichiers Office : une fiche technique part en PDF. Le type détecté et le `kind` de l’entrée doivent concorder, sinon l’entrée est ignorée.',
				table: 'Limites des médias',
				what: 'Quoi',
				cap: 'Limite',
				caps: ['Une image', 'Un document', 'Une récupération de média', 'Entrées média dans un enregistrement'],
				licence:
					'La licence est vérifiée comme une chaîne avant toute récupération, et doit être exactement l’un de sept identifiants SPDX, ceux qui permettent à chacun de redistribuer le fichier tel quel, ce que fait l’index :',
				licences: 'licences média acceptées',
				entry:
					'Tout ici se fait par entrée. Une entrée refusée, trop grande ou injoignable ne coûte que cette entrée : **votre enregistrement n’est jamais invalide à cause de ses médias**, ses autres assertions tiennent, et aucun échec de média ne vous fait passer en lapse. Elle est comptée dans `media_failed` et retentée à la prochaine exploration de cet enregistrement. Une chose fonctionne à l’inverse des flux : la règle du même hôte ne s’applique *pas* ici, vos images peuvent donc être sur un CDN. [Ce qui est ingéré](/spec#what-is-ingested) et [la liste des licences](/spec#licences-that-can-be-ingested) donnent les raisons.',
			},
			others: {
				title: 'D’autres sources publieront sur vos produits.',
				body: 'Distributeurs, registres, jeux de données ouverts et contributeurs sont des sources comme les autres. Leurs assertions leur sont attribuées et n’écrasent jamais les vôtres ; en cas de désaccord, les deux assertions sont visibles côte à côte avec leurs sources.',
			},
		},
		toc: 'Sur cette page',
		question: 'Comment allez-vous publier ?',
		reference: 'Référence',
		details: 'Détails et référence des champs',
		go: 'Créez votre site',
		done: 'Marquer cette étape comme faite',
		progress: '{n} étapes sur {total} faites',
		check: {
			heading: 'Vérifiez votre domaine',
			lead: 'Publication terminée ? Saisissez votre domaine. L’index est invité à l’examiner maintenant, et vous arrivez sur sa page d’état en direct.',
			label: 'Votre domaine',
			placeholder: 'acme.example',
			button: 'Vérifier',
			working: 'Vérification…',
			invalid: 'Saisissez uniquement un nom d’hôte, comme acme.example : pas de https://, pas de chemin.',
			limited: 'Trop de requêtes depuis votre réseau. Patientez un peu et réessayez.',
			failed: 'L’index n’a pas pris la requête en compte. Réessayez dans une minute.',
			note: 'Le prochain crawl met l’état à jour en quelques minutes.',
			looks: 'Ce que regarde la vérification',
			noscript: 'Sans JavaScript, ouvrez directement la page d’état :',
		},
		checklist: {
			heading: 'Avant la mise en ligne',
			items: [
				'La découverte répond par HTTP 200, un type de contenu JSON et un corps valide selon le schéma du flux, pas par une page HTML « introuvable » servie en 200.',
				'Il y a exactement un enregistrement TXT v=prodid0 sur _prodid.<votre domaine>. Deux, c’est une erreur, et un mal formé aussi.',
				'Cet enregistrement est v=prodid0; host=<hostname>. Un hôte, jamais une URL : pas de schéma, pas de port, pas de chemin.',
				'Chaque URL de feeds est en https et sur le même hôte que le document de découverte qui la liste.',
				'Chaque URL de feeds est encore servie. Un flux impossible à récupérer fait échouer toute l’exploration, et sept jours ainsi font passer la source en lapse.',
				'Un document délégué porte "domain", égal au domaine pour lequel il parle.',
				'Le document de découverte est servi en application/json et ne redirige pas vers un autre hôte.',
				'Flux et documents envoient ETag ou Last-Modified, pour qu’un fichier inchangé ne coûte qu’un 304.',
				'Chaque ligne de flux est un objet JSON complet de moins de 64 KiB, UTF-8, séparé par des retours à la ligne, sans tableau autour ni virgules finales.',
				'Chaque key est stable et n’est jamais réutilisée pour un autre produit.',
				'Chaque gtin ne contient que des chiffres, a une clé de contrôle correcte et n’est pas que des zéros.',
				'Chaque valeur d’identifiant est nettoyée (pas d’espace au début ni à la fin), et chaque enregistrement garde au moins un identifiant que l’index peut stocker, ce qui veut dire qu’un mpn exige une brand.',
				'Chaque entrée média a un kind correspondant à ses octets réels et l’une des sept licences SPDX acceptées, sinon elle est ignorée.',
				'Aucun enregistrement ne contient d’opid. C’est l’index qui les attribue.',
				'publisher.contact est une adresse que quelqu’un lit.',
			],
			check: 'Vérifier vos fichiers avant le ping',
			checkLead:
				'`prodid-batch check` valide votre document de découverte et chaque flux exactement comme l’index le ferait, sans jeton et sans rien demander à l’index. Il s’exécute depuis un clone du dépôt avec [Bun](https://bun.sh) 1.4.4. Donnez-lui les fichiers eux-mêmes : un chemin finissant par `.json` est lu comme un document, tout autre chemin comme un flux NDJSON.',
			checkLabel: 'valider ce que vous servez, comme le fera l’index',
			checkResult:
				'Un fichier sans problème affiche `ok` et le nombre d’enregistrements que l’index en tirerait. Sinon, il affiche une ligne par problème, sous la forme `items.ndjson:12: message` avec la ligne du flux concernée, et se termine avec un code non nul. Il lit les fichiers, pas votre DNS ni votre serveur : l’enregistrement TXT, le type de contenu et les en-têtes de cache de la liste ci-dessus restent à vérifier par vous.',
			rules:
				'Les règles de validation d’un enregistrement sont dans la [spécification](/spec), les schémas sont servis sur [`/spec/schemas/v1`](/spec/schemas/v1), et [`/spec/fixtures/v1`](/spec/fixtures/v1) contient des vecteurs lisibles par machine sur lesquels tester votre export avant que quiconque l’explore.',
			status: 'État :',
			formats: 'Les formats de fichier de cette page sont ceux que lit l’index quand vous le pingez.',
		},
	},

	data: {
		title: 'Données ouvertes — prodid',
		description:
			'Téléchargez tout l’index prodid : un dump nocturne de chaque source, entité, enregistrement, regroupement et fusion en NDJSON gzip, sous CC0 pour ce que produit l’index et sous la licence de chaque source pour ses assertions.',
		eyebrow: 'Données ouvertes',
		heading: 'Télécharger l’index',
		lead: 'L’index est remplaçable. Tout ce qu’il sait et qu’un lecteur peut savoir est publié sous forme d’export complet, un dump, que chacun peut télécharger et charger dans son propre index.',
		latest: {
			heading: 'Le dernier dump',
			before: 'Au moment de la construction de cette page, le dump le plus récent était l’instantané pris le',
			after: '. Un nouveau est écrit chaque nuit à 04:30 UTC, et',
			names: 'nomme toujours le plus récent.',
			lines: (count: string, one: boolean) => `${count} ${one ? 'ligne' : 'lignes'}`,
			per: (what: string) => `Une ligne par ${what}.`,
			directory: (directory: string, manifest: string, created: string, index: string, claims: string) =>
				`Le répertoire de ce dump est \`${directory}\`, et son manifeste est [\`manifest.json\`](${manifest}), écrit le ${created}. Ses licences indiquent \`index: ${index}\` et \`claims: ${claims}\`.`,
		},
		holds: {
			'sources.ndjson.gz': { per: 'source', line: 'L’état de la source, exactement comme /source/{name} le renvoie.' },
			'entities.ndjson.gz': {
				per: 'entité, fusionnées comprises',
				line: 'Le document d’entité exactement comme /id/{opid}?history=1 le renvoie, assertions retirées comprises.',
			},
			'records.ndjson.gz': {
				per: 'enregistrement, retirés compris',
				line: 'source, key, feed, opid, body, first_seen, last_seen, withdrawn_at.',
			},
			'groupings.ndjson.gz': { per: 'regroupement', line: 'source, kind, key, opid.' },
			'merges.ndjson.gz': { per: 'fusion, annulées comprises', line: 'from, into, decided_at, reverted_at.' },
		},
		layout: {
			heading: 'Où sont conservés les dumps',
			lead: 'Un dump est un répertoire nommé d’après la date UTC de son instantané, sous la version dans laquelle il est écrit. `v1/` contient les dumps v1, dont le manifeste et les lignes de source et d’entité sont des documents v1. Il contient cinq fichiers de données et un manifeste.',
			last: '**latest.json est écrit en dernier.** C’est une copie du `manifest.json` du dump le plus récent, écrite après que chaque fichier de ce dump et son manifeste sont en place. Un lecteur qui part de lui ne trouve jamais un manifeste nommant un fichier encore absent, et trouve le répertoire grâce au `snapshot_at` du manifeste.',
			retention:
				'**Conservation.** Un dump quotidien est conservé 7 jours. Le premier dump de chaque mois UTC est conservé définitivement. Un dump conservé n’est jamais réécrit : son répertoire, ses fichiers et son manifeste restent identiques à l’octet près.',
			v0: (dumps: string, latest: string) =>
				`**Dumps v0.** Les dumps v0 écrits avant la v1 restent sous \`${dumps}\`, avec la même conservation, et [\`v0/latest.json\`](${latest}) continue de nommer le dernier d’entre eux. Ils restent valides selon les schémas v0.`,
			manifest: (schema: string) =>
				`**Le manifeste.** Il nomme chacun des cinq fichiers exactement une fois, avec le SHA-256 et la taille du fichier tel qu’il est servi, compressé, et son nombre de lignes une fois décompressé. Vérifiez chaque fichier par rapport à son empreinte avant de le charger. Le schéma est [\`${schema}\`](${schema}), avec des vecteurs dans [\`/spec/fixtures/v1/dump\`](/spec/fixtures/v1/dump).`,
		},
		files: {
			heading: 'Ce que contient chaque fichier',
			lead: 'Chaque fichier est du NDJSON compressé en gzip, un objet JSON par ligne. Les cinq sont lus dans un même instantané cohérent, donc ils concordent : chaque source nommée par une ligne a sa ligne dans `sources.ndjson.gz`, et chaque `opid` nommé par une ligne a sa ligne dans `entities.ndjson.gz`.',
			table: 'Fichiers du dump',
			columns: ['Fichier', 'Une ligne par', 'La ligne'],
			merged: 'Entités fusionnées',
			mergedBody:
				'Un `opid` fusionné répond `308` au résolveur, il n’a donc pas de document propre à copier. Sa ligne est le document qu’il renverrait s’il n’était pas fusionné (ses propres identifiants et assertions y restent, ce qui rend une fusion réversible) avec un membre de plus, `merged_into`, l’`opid` de l’entité conservée. Les fusions ne s’enchaînent pas : l’entité conservée n’est jamais elle-même fusionnée.',
			record: 'Une ligne d’enregistrement',
			recordLead: 'Un enregistrement tel que l’index le conserve. Toutes les dates sont en UTC, ISO 8601.',
			recordTable: 'Champs d’une ligne d’enregistrement',
			recordColumns: ['Champ', 'Ce que c’est'],
			recordFields: [
				'Le nom de la source.',
				'La key de l’enregistrement dans cette source.',
				'L’URL du flux d’où il a été lu. Absente pour un enregistrement écrit par un import de jeu de données.',
				'L’item auquel il s’est résolu.',
				'L’org.prodid.item envoyé par l’éditeur, inchangé.',
				'Quand l’index l’a lu pour la première fois.',
				'Quand l’index l’a lu pour la dernière fois.',
				'Présent exactement quand l’enregistrement est retiré.',
			],
			grouping: 'Une ligne de regroupement',
			groupingLead:
				'L’entité à laquelle un regroupement d’une source s’est résolu. `kind` vaut `family` ou `variant`, et `key` est ce sur quoi les enregistrements de la source sont regroupés, écrit en clair plutôt que haché, pour qu’une autre implémentation puisse y faire correspondre son propre regroupement.',
			groupingNotes: [
				'pour un groupe de l’éditeur ; { "key": "<key>" } pour un enregistrement sans groupe, qui forme une famille à lui seul.',
				'la variante de l’enregistrement, {} s’il n’en a pas.',
			],
			familyKey: '{ "family": <la key de la famille>, "variant": { <axe>: <valeur>, … } }',
			merge: 'Une ligne de fusion',
			mergeBody:
				'Une décision de fusion : `from` l’`opid` fusionné, `into` l’entité conservée, `decided_at` le moment de la décision, et `reverted_at`, présent exactement quand elle a été annulée.',
		},
		never: {
			heading: 'Ce qu’un dump ne contient jamais',
			lead: 'Un dump n’en dit pas plus que le résolveur, plus les enregistrements, regroupements et fusions à partir desquels ses réponses sont construites.',
			items: [
				'L’adresse de contact d’un éditeur, que l’index ne garde que pour envoyer l’avis de lapse.',
				'Le journal d’exploration, les messages d’erreur du robot, ou tout autre élément d’une exploration que l’état de la source ne montre pas.',
				'Pourquoi une fusion a été faite ou qui l’a décidée.',
				'Pourquoi une empreinte de média a été bloquée.',
				'Les octets des médias. Le media_url d’une assertion média désigne le fichier, et une empreinte bloquée n’est pas servie.',
				'Les identifiants de ligne internes de l’index. Chaque ligne désigne une source par son nom et une entité par son opid.',
				'Les attributions d’autorité et leurs preuves. La ligne d’une source indique authoritative si elle l’était à snapshot_at, mais un index chargé depuis le dump ne détient aucune attribution tant que son propre opérateur n’en a pas accordé.',
			],
		},
		licences: {
			heading: 'Licences',
			lead: 'Deux règles, et le champ `licenses` du manifeste énonce les deux.',
			index: 'Tout ce que produit l’index',
			indexBody: 'Les `opid`, les correspondances d’identifiants, la hiérarchie famille et variante, les regroupements et les fusions.',
			claims: 'Chaque assertion et chaque enregistrement',
			claimsBody:
				'Sous la licence que déclare sa propre source : la `license` de la ligne de cette source dans `sources.ndjson.gz`. Une source qui n’en déclare aucune n’a rien accordé, et prodid n’accorde rien en son nom.',
			datasets:
				'Un jeu de données ouvert qui ne publie pas de document de découverte entre dans l’index comme une source nommée `dataset:<slug>`, importée par l’opérateur de l’index depuis l’export public du jeu de données. Une telle source est toujours `unverified`, et sa `license` est celle du jeu de données. Les règles sont dans la [spécification](/spec#dataset-sources).',
		},
		load: {
			heading: 'Le charger dans votre propre index',
			lead: '`prodid-batch load-dump` charge un dump v0 ou v1 dans une base PostgreSQL 18 vide migrée à la même version, en une seule transaction. Il prend le répertoire daté d’un dump, son `manifest.json` ou un `latest.json`, en local ou en HTTPS.',
			label: 'depuis un clone du dépôt',
			checked:
				'Chaque fichier est vérifié par rapport aux `sha256`, `bytes` et `lines` du manifeste avant toute écriture, et un dump distant est d’abord téléchargé dans un répertoire temporaire. Une base non vide est refusée. `PRODID_OPERATOR` est enregistré comme décideur des fusions chargées.',
			peek: 'Pour lire un fichier sans le charger, vérifiez-le par rapport à son empreinte et décompressez-le. L’empreinte ci-dessous est celle du dernier manifeste au moment de la construction de cette page.',
			rules: 'Les règles complètes sont dans la spécification, sous [Dumps](/spec#dumps).',
		},
	},
}
