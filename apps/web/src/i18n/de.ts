import type { Copy } from '@/i18n/copy'
import { CONTACT } from '@/lib/spec'

export const de: Copy = {
	common: {
		skip: 'Zum Inhalt springen',
		home: 'prodid, Startseite',
		primary: 'Hauptnavigation',
		nav: {
			spec: 'Spezifikation',
			specShort: 'Spez.',
			publish: 'Veröffentlichen',
			publishShort: 'Publizieren',
			data: 'Daten',
			dataShort: 'Daten',
			menu: 'Menü',
		},
		toDark: 'Zum dunklen Design wechseln',
		toLight: 'Zum hellen Design wechseln',
		language: 'Sprache',
		status:
			'Spec v1. Der Index und der gehostete Publisher laufen auf prodid.org. Jeder kann veröffentlichen, auf der eigenen Domain oder gehostet.',
		normative: 'Die Spezifikation erscheint nur auf Englisch, und der englische Text ist der maßgebliche.',
		imageAlt:
			'prodid: Publisher veröffentlichen Produktangaben auf ihren eigenen Domains, ein offener Index verbindet jeden Code mit einer dauerhaften Kennung, und jeder kann den gesamten Index herunterladen.',
		support: {
			label: 'prodid unterstützen',
			heading: 'prodid ist Open Source. Hilf mit, dass es wächst.',
			body: 'Gib dem Repository einen Stern, damit andere es finden, sag uns, was falsch ist, schick eine Korrektur oder schreib uns hier, ganz ohne GitHub-Konto.',
			star: 'Stern auf GitHub geben',
			stars: (count: string) => `${count} Sterne`,
			contribute: 'Mitmachen',
			chat: 'Schreib uns',
		},
		footer: {
			tagline: 'Eine offene Identitäts- und Datenschicht für jedes physische Produkt.',
			label: 'Fußzeile',
			site: 'Website',
			specification: 'Spezifikation',
			publish: 'Produkte veröffentlichen',
			github: 'Quellcode auf GitHub',
			contact: 'Kontakt',
			report: 'Problem melden',
			security: 'Sicherheit',
			licence:
				'Die Spezifikation und die Schemas sind CC0, ebenso die `opid`s und die Kennungszuordnungen, die prodid.org veröffentlicht. Jeder andere Claim trägt die Lizenz der Quelle, die ihn gemacht hat. Die Referenzimplementierung steht unter Apache-2.0.',
		},
	},

	home: {
		title: 'prodid — offene Identität für jedes physische Produkt',
		description:
			'prodid gibt jedem physischen Produkt eine dauerhafte, offene Kennung. GTIN, MPN und jeder andere Code lösen darauf auf, und jede Angabe ist ein Claim mit genannter Quelle.',
		badge: 'Spec v1 · live',
		headline: 'Ein Barcode ist kein Produkt.',
		headlineAccent: 'prodid schon.',
		lead: 'Eine dauerhafte, offene Kennung für jedes physische Produkt. Jeder Barcode und jede Teilenummer löst darauf auf, und jede Angabe nennt die Quelle, die sie gemacht hat.',
		ctaPublish: 'Produkte veröffentlichen',
		ctaSpec: 'Spezifikation lesen',
		resolve: {
			label: 'Probieren Sie es aus: einen Code vom Etikett auflösen',
			button: 'Auflösen',
			hint: 'Geben Sie einen Code mit 8 bis 14 Ziffern ein.',
		},
		close: {
			heading: 'Geben Sie Ihren Produkten eine Identität, die den Barcode überdauert.',
			body: 'Zwei Dateien und ein DNS-Eintrag auf Ihrer eigenen Domain, oder eine gehostete Seite ganz ohne Domain.',
		},
		heroKind: (brand: string) => `Item · ${brand}`,
		heroVariant: (markets: string) => `navy · M · verkauft in ${markets}`,
		heroLapsed: (source: string) => `lapsed · ${source}`,
		heroCaption: 'Das liefert ein Scan des Codes auf dem Etikett. Der Datensatz ist das Beispiel aus der Spezifikation.',
		sceneLabel:
			'Publisher auf eigenen Domains, gehostete Publisher und offene Datensätze senden Claims an einen offenen Index, der den Code auf einem Produkt auflöst und den gesamten Index als Dumps veröffentlicht.',
		sceneCaption:
			'Publisher machen ihre Angaben auf eigenen Domains, gehostet oder aus offenen Datensätzen. Der Index verbindet jeden Code auf dem Etikett mit einer dauerhaften opid, und der gesamte Index steht zum Download bereit.',
		problem: {
			eyebrow: 'Das Problem',
			heading: 'Vier Codes, eine Jacke, und nichts verbindet sie.',
			body: 'Ein Produkt bekommt für jeden Markt, jede Packungsgröße und jede neue Verpackung einen neuen Barcode, und seine Daten liegen jeweils in einem anderen System. Widersprechen sich zwei davon, wird einer stillschweigend überschrieben.',
			answer: 'prodid gibt dem Produkt selbst eine Kennung, die sich nicht ändert, wenn sich der Barcode ändert.',
			figure: 'Mehrere Codes, die auf eine Variante auflösen',
			anotherGtin: 'eine weitere GTIN',
			codes: [
				'Verkaufseinheit für DE und TR',
				'dieselbe Jacke im Doppelpack',
				'die Verpackung vom nächsten Jahr',
				'Teilenummer des Herstellers',
			],
			variant: 'Eine Variante',
			variantNote: 'Nie wiederverwendet, nie gelöscht. Jeder Code, der je hierher gezeigt hat, funktioniert weiter.',
		},
		model: {
			eyebrow: 'Das Modell',
			heading: 'Familie, Variante, Item. Codes zeigen darauf; sie sind es nicht.',
			lead: 'Jede Ebene hat ihre eigene `opid`: 16 Zeichen, die nichts kodieren, sodass nichts am Produkt sie falsch machen kann.',
			levels: [
				{ title: 'Acme Trail Jacket', note: 'Das Produkt, wie Menschen darüber sprechen.' },
				{ title: 'navy · Größe M', note: 'Eine Kombination aus Farbe, Größe und Ähnlichem.' },
				{ title: 'Verkaufseinheit für DE und TR', note: 'Das Ding, das einen Barcode trägt.' },
			],
			after:
				'Eine neue Verpackung fügt ein neues Item mit neuem Barcode hinzu, unter derselben Variante und derselben Familie. Nichts, was auf das alte gezeigt hat, geht kaputt.',
		},
		how: {
			start: 'Mit dem Veröffentlichen beginnen',
			eyebrow: 'So funktioniert es',
			heading: 'Auf der eigenen Domain veröffentlichen. prodid indexiert. Jeder löst auf.',
			publish: {
				step: '01 · Veröffentlichen',
				title: 'Drei Dinge auf Ihrer Domain',
				body: 'Ein Discovery-Dokument, ein Feed mit einem Produkt pro Zeile und ein DNS-Eintrag, der beweist, dass die Domain Ihnen gehört.',
				link: 'So veröffentlichen Sie →',
			},
			index: {
				step: '02 · Indexieren',
				title: 'Geprüft, zugeordnet, zugeschrieben',
				checks: [
					'jede Zeile gegen das Schema validiert',
					'einer bestehenden opid zugeordnet oder einer neuen',
					'jedes Feld als Claim Ihrer Domain gespeichert',
				],
				body: 'Händler, Register und offene Datensätze sind auf dieselbe Weise Quellen: neben dem Hersteller, nie über ihm.',
				link: 'So funktionieren Claims →',
			},
			resolve: {
				step: '03 · Auflösen',
				title: 'Eine URL, aufgedruckt auf dem Produkt',
				browser: 'Browser → eine Seite',
				api: 'API → der JSON-Datensatz',
				body: 'Der Pfad folgt der GS1-Digital-Link-Syntax und kann deshalb der QR-Code auf dem Etikett selbst sein.',
				link: 'So funktioniert das Auflösen →',
			},
		},
		claims: {
			eyebrow: 'Claims',
			heading: 'Jede Angabe nennt ihre Quelle. Widersprüche bleiben sichtbar.',
			lead: 'Nichts wird zu einer „Wahrheit“ zusammengeführt. Hört eine Quelle auf zu veröffentlichen, bleiben ihre Claims erhalten und werden als lapsed markiert, nicht gelöscht.',
			caption: 'Die Claims im Beispiel-Item der Spezifikation',
			columns: ['Eigenschaft', 'Wert', 'Quelle', 'Vertrauen', 'Gesehen'],
			lapsed: ' · lapsed',
			trust: [
				'Kontrolliert die Domain und ist als Markeninhaber bestätigt.',
				'Hat die Kontrolle über eine Domain per DNS oder über die eigene Website nachgewiesen.',
				'Ein gehosteter Name ohne Domain, ein Datensatz oder ein Beitrag.',
			],
			details: 'Anfrage und vollständigen JSON-Datensatz ansehen',
			request: 'Anfrage- und Antwort-Header',
		},
		who: {
			links: ['Auf Ihrer Domain veröffentlichen', 'Einen Weg wählen', 'Die Daten holen'],
			eyebrow: 'Für wen',
			heading: 'Für die, die die Daten machen, und für die, die sie brauchen.',
			audiences: [
				{
					title: 'Hersteller',
					body: 'Machen Sie Ihre Produktdaten einmal, auf Ihrer eigenen Domain. Kein Händlerangebot und kein Marktplatz besitzt die Beschreibung dessen, was Sie herstellen.',
				},
				{
					title: 'Anbieter von E-Commerce, ERP und PIM',
					body: 'Ein Discovery-Dokument und ein Feed pro Händlerdomain, erzeugt aus Daten, die Sie bereits haben.',
				},
				{
					title: 'Entwickler',
					body: 'Lösen Sie jeden Code auf eine Kennung auf, die ein Umpacken übersteht. Jede Angabe sagt, wer sie gemacht hat, wann, und ob diese Quelle noch dahintersteht.',
				},
			],
			passport:
				'**Zum EU-Digitalen Produktpass.** Die ESPR verlangt einen Pass, der über einen Datenträger auf dem Produkt erreichbar ist, und GS1 Digital Link ist eine der Trägersyntaxen, die dafür standardisiert werden. prodid ist kein Passdienst, und hier zu veröffentlichen erfüllt keine Vorschrift; es ist dieselbe Grundlage: ein maschinenlesbarer Datensatz pro Produkt, unter einer stabilen Adresse, die Sie kontrollieren.',
		},
		status: {
			eyebrow: 'Stand',
			heading: 'Wo das tatsächlich steht.',
			stable: {
				label: 'Stabil',
				title: 'Spezifikation v1.',
				body: `Sie ändert sich nur durch Ergänzungen; alles andere wäre v2. Ein v0-Discovery-Dokument wird bis 2027-01-26 00:00 UTC akzeptiert. [Lesen Sie sie](/spec) und [sagen Sie, wo sie falsch ist](${CONTACT.issues}).`,
			},
			sources: {
				label: 'Canary und ein Datensatz',
				title: 'Noch ist kein Katalog eines Publishers indexiert.',
				body: 'Der Index enthält zwei Quellen: den eigenen Canary des Projekts, [canary.prodid.org](https://prodid.org/source/canary.prodid.org), der Veröffentlichen, Crawlen und Auflösen von Anfang bis Ende belegt, und [dataset:wikidata](https://prodid.org/source/dataset:wikidata), einen begrenzten Testimport von 5 Wikidata-Einträgen, unverified und unter CC0-1.0.',
			},
			design: {
				label: 'Absichtlich',
				title: 'Der Index ist ersetzbar.',
				body: 'Die Spezifikation, die Schemas, die opids und die Code-Zuordnungen sind [CC0](/spec#licensing). Jeder Claim behält die Lizenz seiner Quelle. Die Angaben liegen auf den Domains, die sie veröffentlichen, sodass jeder sie erneut crawlen kann und gedruckte Codes ihre Bedeutung behalten.',
			},
		},
	},

	publish: {
		title: 'Produkte veröffentlichen — prodid',
		description:
			'Wie ein Hersteller oder Softwareanbieter Produktdaten an prodid veröffentlicht: das Discovery-Dokument, der NDJSON-Feed, der eine DNS-TXT-Eintrag, der die Identität hält, und der Ping.',
		eyebrow: 'Leitfaden für Publisher',
		heading: 'Produkte veröffentlichen',
		lead: 'Bei prodid zu veröffentlichen heißt, zwei Dateien ins Web und einen Eintrag ins DNS zu stellen. Auf der eigenen Domain gibt es keine Registrierung und keinen Schlüssel: Die Domain ist der Nachweis, und Sie ändern oder ziehen zurück, was Sie veröffentlichen, indem Sie die Dateien ändern.',
		discovery: {
			heading: 'Wie der Index Sie findet',
			lead: 'Gut zu wissen, bevor Sie irgendetwas anderes tun, denn es entscheidet, welcher der drei Wege unten Ihrer ist. Discovery läuft bei jedem Crawl von vorn, DNS zuerst, und nichts über den Weg zu Ihren Daten wird zwischen Crawls gespeichert.',
			first: 'Zuerst',
			firstTitle: 'Ein DNS-TXT-Eintrag unter `_prodid.acme.example`',
			firstBody:
				'Gibt es dort einen `v=prodid0`-Eintrag, wird ausschließlich ihm gefolgt, auch wenn er Ihre eigene Domain nennt. Der Eintrag nennt einen *Host*; das Dokument liegt immer unter `https://<host>/.well-known/prodid.json`.',
			second: 'Nur wenn es keinen solchen Eintrag gibt',
			secondBody: 'Das Dokument auf der Domain selbst. Wer die Domain über HTTPS ausliefert, spricht für sie.',
			why: 'DNS kommt zuerst, weil es der stärkere Nachweis ist: Wer eine Datei auf einen Host legen kann, ist nicht immer der Inhaber der Domain, und der Inhaber muss das überstimmen können. Deshalb sollten Sie den Eintrag auch dann schreiben, wenn Sie die Datei selbst ausliefern; [Weg 1, Schritt 3](#own-domain) erklärt, was Ihnen das bringt.',
			one: '**Genau ein Eintrag, und nichts dahinter.** Mehr als ein `v=prodid0`-Eintrag unter diesem Namen ist ein Fehler, keine Auswahl, und ein einzelner fehlerhafter oder zu langer ist ebenfalls ein Fehler. Es gibt keinen Rückfall: Sobald ein Eintrag existiert, beendet ein nicht funktionierender Eintrag die Discovery, statt den Crawler zu Ihrer Domain zu schicken. Wenn Sie den Host wechseln, ersetzen Sie den Eintrag; fügen Sie nie einen zweiten hinzu. Die Grammatik mit Testvektoren steht in der [Spezifikation](/spec#the-_prodid-txt-record).',
			answer:
				'**Was als Antwort zählt.** HTTP 200 nach höchstens einer Weiterleitung, ein JSON-Content-Type, ein Body, der gegen das Feed-Schema validiert, und ein `domain`, der die gesuchte Domain nennt. Eine Website, die unbekannte Pfade mit einer HTML-Seite und 200 beantwortet, antwortet nicht, ebenso wenig ein Dokument, das als `text/html` ausgeliefert wird.',
		},
		routes: {
			heading: 'Wählen Sie, wie Sie veröffentlichen',
			lead: 'Identität und Hosting sind getrennt. Ihre Identität ist eine Domain, die Sie kontrollieren; wo die Dokumente tatsächlich liegen, ist ein Detail, das Sie später ändern können, ohne Ihre Identität oder eine Kennung zu ändern, die prodid Ihren Produkten zugewiesen hat. Drei Wege, die alle genau dieselben Datensätze erzeugen.',
			route: (n: string) => `Weg ${n}`,
			detail: (n: string) => `Weg ${n} im Detail →`,
			start: 'Bei publish.prodid.org starten →',
			identity: 'Identität',
			trust: 'Vertrauen',
			items: [
				{
					when: 'Sie können Dateien auf Ihrer eigenen Domain ausliefern.',
					who: 'Eine Marke mit IT-Team oder eine Plattform (E-Commerce, ERP, PIM), die für jeden gehosteten Händler veröffentlicht.',
					how: 'Liefern Sie das Discovery-Dokument auf der Domain aus und veröffentlichen Sie einen TXT-Eintrag, der die Domain selbst nennt.',
					identity: 'die Domain',
				},
				{
					when: 'Sie besitzen eine Domain, können dort aber keine Dateien ausliefern.',
					who: 'Ein Hersteller, dessen Website auf einer Plattform liegt, die er nicht kontrolliert.',
					how: 'Veröffentlichen Sie unter einem gehosteten Slug und lassen Sie einen TXT-Eintrag auf Ihrer Domain auf diesen Host zeigen.',
					identity: 'die Domain, per DNS nachgewiesen',
				},
				{
					when: 'Sie haben gar keine Domain.',
					who: 'Ein kleiner Erzeuger oder eine Genossenschaft.',
					how: 'Veröffentlichen Sie unter einem gehosteten Slug. Fügen Sie später eine Domain hinzu, ohne etwas zu verlieren.',
					identity: 'der Slug-Host',
				},
			],
			hosted:
				'Die Wege 2 und 3 nutzen den gehosteten Veröffentlichungsdienst unter `<slug>.prodid.org`. Melden Sie sich bei [publish.prodid.org](https://publish.prodid.org/) mit einem Link an, der an Ihre E-Mail geht, legen Sie eine Site an, laden Sie Ihre Datei hoch und verbinden Sie eine Domain, falls Sie eine haben. Dort können Sie jederzeit alles exportieren oder die Site löschen.',
		},
		table: {
			field: 'Feld',
			required: 'Pflicht',
			what: 'Bedeutung',
			yes: 'ja',
			no: 'nein',
			delegating: 'bei Delegation',
		},
		own: {
			copy: 'Kopieren',
			copied: 'Kopiert',
			eyebrow: 'Weg 1',
			heading: 'Auf der eigenen Domain veröffentlichen',
			lead: 'Zwei Dateien und ein DNS-Eintrag. Eine Plattform, die für Händler veröffentlicht, tut dasselbe auf jeder Händlerdomain, sodass jeder Händler seine eigene Identität und seine eigene Vertrauensstufe behält.',
			step1: 'Schritt 1 — Das Discovery-Dokument ausliefern',
			step1Lead: (url: string) => `Eine Datei unter einem festen Pfad, die auflistet, wo Ihre Produkt-Feeds liegen: \`${url}\``,
			feedCaption: 'Das Beispiel aus spec/fixtures/v1/examples/prodid.json, direkt aus der Datei gerendert.',
			feedTable: 'Felder des Discovery-Dokuments',
			feedFields: [
				'Immer org.prodid.feed.',
				'1. Ein Dokument mit 0 wird von Crawls akzeptiert, die vor 2027-01-26 00:00 UTC beginnen, und danach als definitiv negativ abgelehnt.',
				'Der Name, den ein Mensch neben Ihren Claims sehen soll.',
				'Eine E-Mail-Adresse, die jemand wirklich liest. Dorthin schreibt der Index, wenn Ihre Quelle in Lapse geht; es ist die einzige Warnung, die Sie bekommen.',
				'SPDX-Kennung für die Angaben in Ihren Feeds, etwa CC0-1.0.',
				'Bis zu 100 https-URLs, alle auf demselben Host wie dieses Dokument.',
				'Die Domain, für die dieses Dokument spricht. Pflicht, sobald das Dokument über einen TXT-Eintrag erreicht wird, der einen anderen Host nennt, und dann muss sie dieser Domain entsprechen. Optional, wenn die Domain das Dokument selbst ausliefert; ist sie angegeben, muss sie trotzdem passen.',
			],
			serve:
				'Liefern Sie es über HTTPS auf dem Standardport mit gültigem Zertifikat als `application/json` aus, oder als beliebiges `application/…+json`. Leiten Sie nicht auf einen anderen Host weiter: Die eine Weiterleitung, der der Crawler folgt, ist `acme.example` nach `www.acme.example`.',
			step2: 'Schritt 2 — Den Feed ausliefern',
			step2Lead:
				'Ein Feed ist NDJSON: ein vollständiges JSON-Objekt pro Zeile, UTF-8, durch Zeilenumbrüche getrennt. Kein Array drumherum, keine Kommas zwischen den Zeilen. So lässt sich ein Feed mit zwei Millionen Produkten Zeile für Zeile streamen, und eine kaputte Zeile kostet Sie nur diese Zeile, nicht den Rest.',
			itemsCaption:
				'Drei Varianten eines Produkts aus spec/fixtures/v1/examples/items.ndjson. Sie teilen sich eine group, also baut der Index daraus eine Familie mit drei Varianten.',
			sameHost:
				'**Feeds liegen auf demselben Host wie das Dokument, das sie auflistet.** Ein Discovery-Dokument, das einen Feed auf einem anderen Host nennt, wird ganz abgelehnt, nicht teilweise: Sie verlieren die ganze Quelle, nicht einen Feed, und es zählt als definitiv negativ, startet also die Lapse-Uhr weiter unten. Das JSON von der eigenen Website und das NDJSON von einem separaten CDN-Hostnamen auszuliefern ist ein naheliegender Wunsch und wird in v1 nicht unterstützt. Legen Sie beides auf einen Host.',
			firstLine: 'Die erste dieser Zeilen, lesbar formatiert:',
			itemLabel: 'ein org.prodid.item-Datensatz',
			itemTable: 'Felder des Item-Datensatzes',
			itemFields: [
				'Immer org.prodid.item.',
				'Ihr stabiler Name für diesen Datensatz innerhalb des Feeds. Wird derselbe key erneut veröffentlicht, ersetzt er den alten.',
				'Die Marke, wie sie auf dem Produkt steht. Sie wird normalisiert, bevor sie eine mpn eingrenzt, sodass ARÇELİK und Arçelik eine Marke sind, nicht zwei.',
				'Der Produktname ohne die Variantenachsen.',
				'Mindestens ein { scheme, value }, und mindestens eines, das der Index speichern kann. Werte haben an keinem Ende Leerraum und sind nicht leer. Eine gtin muss 8, 12, 13 oder 14 Ziffern mit korrekter Prüfziffer haben und darf nicht nur aus Nullen bestehen; eine mpn braucht eine brand, die zu etwas normalisiert, denn darin ist sie eindeutig; eine gtin mit eingeschränkter Zirkulation wird behalten, aber nur als Ihre eigene rcn. Ein Datensatz ohne speicherbare Kennung identifiziert nichts und wird übersprungen.',
				'BCP-47-Tag für den lesbaren Text in diesem Datensatz.',
				'Ihr eigener Gruppierungsschlüssel. Items mit demselben Wert sind Varianten einer Familie.',
				'Die Achsen, die dieses Item innerhalb der Gruppe unterscheiden: Farbe, Größe, Kapazität.',
				'GS1-GPC-Brick-Code, geschrieben als gpc: gefolgt von acht Ziffern.',
				'ISO-3166-1-alpha-2-Codes der Märkte, in denen dieses Item verkauft wird.',
				'Strings, Zahlen, Booleans, Listen oder { value, unit } für einen Messwert.',
				'Bis zu 20 https-URLs, jeweils mit einem kind und einer SPDX-Lizenz aus der Liste der aufnehmbaren. Anders als Feeds dürfen sie auf beliebigen Hosts liegen.',
			],
			flat: 'Senden Sie flache Items. Sie bauen nie selbst Familien oder Varianten und senden nie eine `opid`: Der Index leitet das Erste aus `group` ab und vergibt das Zweite. Wenn Sie bereits einen Google-Merchant-Feed erzeugen, ist `group` Ihre `item_group_id`.',
			barcodes:
				'Zwei Dinge über Barcodes sollten Sie vor dem Export wissen. Eine `gtin` aus lauter Nullen ist kein Barcode, sondern ein Katalogplatzhalter, und ein Datensatz damit wird wie bei einer falschen Prüfziffer abgelehnt. Eine [Nummer mit eingeschränkter Zirkulation](/spec#which-gtins-are-identifiers), also die Bereiche für den Ladengebrauch, wird gespeichert und Ihnen zugeschrieben, identifiziert aber global nichts; sie führt Ihr Produkt also nie mit dem eines anderen zusammen, und `/01/` löst sie nicht auf.',
			step3: 'Schritt 3 — Die Identität im DNS beanspruchen',
			step3Lead: 'Sobald die Dateien online sind, veröffentlichen Sie einen Eintrag, der Ihre eigene Domain als Host nennt.',
			step3Why:
				'Er zeigt genau auf das, was die Discovery ohnehin gefunden hätte, an Ihren Daten ändert sich also nichts. Was sich ändert, ist, was jemand mit reinem Hinzufügerecht in Ihrem DNS tun kann. Ohne Eintrag übernimmt ein von ihm hinzugefügter Eintrag Ihre Identität stillschweigend, denn DNS gewinnt gegen die Datei. Steht Ihr Eintrag bereits, lässt ein zweiter die Discovery mit *mehr als ein Eintrag* scheitern: ein Lapse, der sichtbar ist, gemeldet wird und sich beheben lässt.',
			neverDelegate:
				'**Delegieren Sie `_prodid` nie an einen Dienstleister.** Schreibzugriff auf `_prodid.<domain>` ist Kontrolle über Ihre Identität, genau wie bei DKIM oder einer ACME-DNS-01-Challenge. Eine Domain mit geteiltem DNS ist eine geteilte Identität. Geben Sie einer Agentur den Feed, nicht den Eintrag.',
			order:
				'Stellen Sie die Dateien vor dem Eintrag online, nicht danach: Ein Eintrag, der auf ein noch nicht vorhandenes Dokument zeigt, ist eine gescheiterte Discovery. Werte werden ohne Beachtung der Groß- und Kleinschreibung gelesen, und ein abschließender Punkt ist in Ordnung, also sind `ACME.Example.` und `acme.example` derselbe Host.',
			step4: 'Schritt 4 — Dem Index die Änderung melden',
			step4Lead: 'Optional. Jede bekannte Domain wird regelmäßig neu gecrawlt; ein Ping zieht nur den nächsten Crawl vor.',
			pingLabel: 'den Index bitten, die Discovery jetzt auszuführen',
			ping: '`{"domains": [...]}` nimmt bis zu 1000 auf einmal; so stellt eine Plattform jeden gehosteten Händler vor. Es gibt keinen Schlüssel, denn der Ping gibt dem Aufrufer keinen Einfluss auf Inhalte, und `202` ist alles, was er je sagt. Er verrät nicht, ob die Domain bekannt war, ob etwas gefunden wurde oder ob jemand anderes sie vor einer Minute gepingt hat. Ein `429` heißt nur, dass *Sie* Ihr eigenes Anfragebudget überschritten haben, und Fehler kommen als `application/problem+json`. Was mit Ihrer Domain passiert ist, steht in Ihrem [Quellstatus](#after), nicht im Ping.',
		},
		delegated: {
			eyebrow: 'Weg 2',
			heading: 'Hosting delegieren, Identität behalten',
			lead: 'Viele Hersteller besitzen eine Domain und können keine Datei darauf legen. Der Feed wird anderswo gehostet und die Domain per DNS nachgewiesen, sodass die Identität der Quelle weiter die Domain ist und die Vertrauensstufe weiter `verified`. Legen Sie bei [publish.prodid.org](https://publish.prodid.org/) eine Site an, geben Sie Ihre Domain ein, und Sie sehen genau den Eintrag, den Sie hinzufügen müssen; geprüft wird er für Sie.',
			looks: 'So sieht es aus',
			steps: [
				'**Ein Katalog, hochgeladen unter einem gehosteten Slug**, etwa `acme.prodid.org`, der sowohl das Discovery-Dokument als auch den Feed ausliefert.',
				'**Ein TXT-Eintrag auf Ihrer Domain**, der diesen Host nennt. Ein Host, nie eine URL, sodass ein Eintrag den Crawler nie auf eine beliebige Adresse richten kann.',
				'**Ein Dokument, das Ihre Domain zurück nennt.** DNS sagt *mein Dokument liegt dort drüben*; das Dokument sagt *ich spreche für diese Domain*. Ein delegiertes Dokument ohne `domain` wird abgelehnt: Fehlen gilt nie als Zustimmung, und genau das verhindert, dass jemand einen Eintrag auf den Feed eines anderen richtet.',
			],
			caption:
				'Aus spec/fixtures/v1/examples/prodid.delegated.json. Der einzige Unterschied zu Weg 1 ist das Feld domain, und hier ist es Pflicht.',
			window:
				'Der gehostete Publisher schreibt `domain` erst ins Dokument, nachdem er Ihren TXT-Eintrag selbst gesehen hat; es gibt also keinen Moment, in dem ein Dokument eine Domain beansprucht, die nicht darum gebeten hat.',
		},
		hosted: {
			eyebrow: 'Weg 3',
			heading: 'Ohne Domain veröffentlichen',
			lead: 'Ein Erzeuger ganz ohne Domain veröffentlicht unter einem gehosteten Slug, `<slug>.prodid.org`, unter eigenem Namen. Sichern Sie sich einen bei [publish.prodid.org](https://publish.prodid.org/). Die Identität der Quelle ist der Slug-Host und die Vertrauensstufe `unverified`, weil über eine Domain nichts nachgewiesen ist. Die Datensätze sind echte Datensätze: Kennungen, Auflösung, Zuschreibung.',
			merchant:
				'Die meisten Publisher in dieser Lage pflegen bereits eine [Google-Merchant](https://support.google.com/merchants/answer/7052112)-Produktdatei; deshalb ist die Zuordnung von einer solchen Datei zu `org.prodid.item`-Datensätzen in der Spezifikation Spalte für Spalte ausgeschrieben, samt dem, was bewusst wegfällt: Preis, Verfügbarkeit, Versand und Zustand gehören zu einem Verkäufer an einem Tag, nicht zum Produkt. [Einen Merchant-Feed importieren](/spec#appendix-importing-a-merchant-feed) lohnt die Lektüre vor dem Export: publish.prodid.org wandelt die hochgeladene CSV- oder TSV-Datei genau mit dieser Zuordnung um. Vier Dinge darin bestimmen, wie Ihre Tabelle aussehen muss:',
			rules: [
				'**Vier Spalten werden zu Variantenachsen**: `color`, `size`, `material` und `pattern`, zwischen denen ein Käufer innerhalb einer `item_group_id` wählt. `gender`, `age_group`, `size_type` und `size_system` bleiben gewöhnliche Eigenschaften: Sie beschreiben die ganze Gruppe, und als Achsen würden sie ein Produkt in mehrere aufspalten, sobald jemand einen davon auf zwei Arten schreibt.',
				'**Ein wiederholtes Attribut ist kommagetrennt oder hat wiederholte Kopfzeilen, pro Datei, nicht pro Zelle.** Eine Zelle wird nur dann an Kommas getrennt, wenn ihre Kopfzeile in der ganzen Datei einmal vorkommt; wiederholen Sie die Kopfzeile, wird jede Zelle darunter als Ganzes genommen. Nur so lässt sich ein Wert mit Komma transportieren, und Sie entscheiden das einmal für die Datei. Es gilt für `additional_image_link`, `product_type`, `product_highlight`, `product_detail` und `certification`; alles andere, auch eine `description` voller Kommas, wird so oder so als Ganzes genommen.',
				'**Ein `product_detail` überschreibt nie etwas.** Sein mittleres Unterattribut wird zum Eigenschaftsschlüssel, der Abschnittsname entfällt, und der erste Wert für einen Schlüssel gewinnt. Ein späteres Detail mit demselben Schlüssel, oder eines, das auf einem schon von der Zuordnung erzeugten Schlüssel landet, wird verworfen und mit seiner Zeile gemeldet; eine Detail-Spalte kann also nie stillschweigend umdeuten, was der Rest der Zeile sagt.',
				'**Eine Medienlizenz muss angegeben werden.** Das Merchant-Format hat keine Spalte dafür, und [ohne Lizenz wird nichts aufgenommen](/spec#licences-that-can-be-ingested); ein Import gibt daher eine einzige aufnehmbare SPDX-Kennung für alle Bilder und Dokumente der Datei an. Eine eigene `license`-Spalte überschreibt sie Zeile für Zeile, und eine Datei mit nicht aufnehmbarer Lizenz erzeugt Datensätze ohne Medien statt fehlschlagender Datensätze.',
			],
			skipped:
				'Eine Zeile, die kein Datensatz werden kann (keine brauchbare Kennung, eine GTIN mit falscher Prüfziffer), wird übersprungen und mit ihrer Tabellenzeilennummer gemeldet, wobei die Kopfzeile Zeile 1 ist; eine schlechte Zeile kostet also diese Zeile und nicht den Import. Eine Beispieldatei zum Abgleichen liegt unter [`/spec/fixtures/merchant`](/spec/fixtures/merchant): eine CSV, die Datensätze, die sie ergeben muss, und die Zeile, die übersprungen werden muss.',
			later:
				'Für eine Entscheidung von heute zählt vor allem, was später passiert. Ein TXT-Eintrag auf einer Domain, die Sie erwerben und die denselben Host nennt, macht beim nächsten Crawl aus dem Slug die Domain: **dieselbe Quelle, dieselben Datensätze, jede `opid` bleibt**, und das Vertrauen steigt von `unverified` auf `verified`. Ihre `sku`-Kennungen gelten für die Quelle selbst, nicht für ihren Namen, und überstehen den Umzug. Auf publish.prodid.org ist das dasselbe Domain-Feld, das Weg 2 nutzt.',
		},
		trust: {
			heading: 'Was Vertrauen hier bedeutet',
			lead: 'Vertrauen ist eine Eigenschaft der Quelle, nicht eines Claims. Es sagt, was darüber nachgewiesen ist, wer spricht, und nichts darüber, ob eine bestimmte Angabe stimmt. Was daraus folgt, entscheidet, wer die Daten nutzt.',
			table: 'Vertrauensstufen',
			level: 'Stufe',
			meaning: 'Bedeutung',
			levels: [
				'Domainkontrolle nachgewiesen und Inhaberschaft der Marke bestätigt.',
				'Domainkontrolle nachgewiesen, per TXT-Eintrag oder dadurch, dass die Domain das Dokument ausliefert.',
				'Ein gehosteter Slug ohne Domain, ein Datensatzimport oder ein Community-Beitrag.',
			],
			only: 'Nur eine Quelle, deren Identität eine Domain ist, kann mehr als `unverified` sein. `verified` kommt aus dem Crawl. `authoritative` nicht, denn kein Crawl kann beweisen, wem eine Marke gehört: Der Betreiber des Index vergibt es, und nur auf Nachweis.',
			rules: [
				{
					title: 'Der Nachweis ist Ihr GS1-Firmenpräfix.',
					body: 'Das GS1-Firmenpräfix der GTINs, die Ihre Quelle unter der Marke veröffentlicht, muss an die Organisation lizenziert sein, die Ihre Domain kontrolliert, wie die öffentliche Abfrage „Verified by GS1“ zeigt. Die URL dieser Abfrage wird als Nachweis bei der Freigabe gespeichert.',
				},
				{
					title: 'Eine Freigabe nennt eine Marke, und jede kann widerrufen werden.',
					body: 'Die Marke wird in ihrer [normalisierten](/spec#brand-normalization) Form gespeichert. Eine Quelle kann Freigaben für mehrere Marken halten, und der Betreiber widerruft jede einzeln.',
				},
				{
					title: 'Eine Freigabe überlebt den Nachweis darunter nicht.',
					body: 'Ihre Quelle ist genau so lange `authoritative`, wie die Kontrolle über ihre Domain nachgewiesen ist, sie nicht [lapsed](/spec#lapse) ist und sie mindestens eine nicht widerrufene Freigabe hält. Verlieren Sie den Domainnachweis oder gehen Sie in Lapse, fällt sie sofort auf das zurück, was der verbleibende Nachweis trägt: `verified` während des Lapse, tiefer, wenn auch der Domainnachweis fehlt, ohne dass jemand eingreift. Sobald alle drei wieder gelten, ist sie wieder `authoritative`.',
				},
				{
					title: 'Sie deckt die Quelle ab, nicht die Marke.',
					body: 'Vertrauen bleibt eine Eigenschaft der Quelle: Eine Freigabe für eine Marke macht jeden Claim Ihrer Quelle `authoritative`, auch Claims über Marken, für die sie keine Freigabe hat.',
				},
			],
			ask: `Um sie zu beantragen, veröffentlichen Sie zuerst auf Ihrer eigenen Domain und [fragen dann mit dem Antragsformular](${CONTACT.authoritative}) an, mit Ihrer Domain, der Marke und einer Verified-by-GS1-Abfrage für eine ihrer GTINs. Der Betreiber prüft die GTINs, die Ihre Quelle unter dieser Marke veröffentlicht, in Verified by GS1. Der Antrag ist öffentlich.`,
		},
		after: {
			heading: 'Nach dem Veröffentlichen',
			edit: {
				title: 'Einen Datensatz ändern heißt, eine Zeile zu bearbeiten.',
				body: 'Ein Datensatz mit einem bereits vorhandenen key ersetzt den vorigen. Es gibt keinen Update-Endpunkt, denn der Feed ist der Zustand.',
			},
			remove: {
				title: 'Eine Zeile zu entfernen zieht Ihre Claims zurück, nicht das Produkt.',
				body: 'Ein key, der aus einem vollständig abgerufenen Feed verschwindet, markiert Ihre Claims dazu als zurückgezogen. Die Entität und ihre Kennung bleiben: Links anderer darauf funktionieren weiter, ebenso die Claims anderer Quellen.',
			},
			retire: {
				title: 'Eine Feed-URL aus dem Dokument zu entfernen legt sie sofort still.',
				body: 'Liest ein Crawl ein Dokument, das eine Ihrer Feed-URLs nicht mehr nennt, wird jeder aktive Datensatz aus diesem Feed sofort zurückgezogen, als wären alle seine keys verschwunden, und die URL wird nicht mehr abgerufen. Die siebentägige Schonfrist weiter unten gilt hier nicht: Eine URL zu streichen heißt, dass die Datei weg ist, und der Index nimmt Sie beim Wort. Wird sie später wieder aufgeführt, kommt sie zurück und wird von vorn gelesen. Liefern Sie das Dokument nach Möglichkeit mit einem `ETag` aus: Ein `304` heißt, dass sich die Liste nicht geändert hat, also wird nichts stillgelegt.',
			},
			broken: {
				title: 'Eine kaputte Zeile verzögert das Zurückziehen um sieben Tage; sie verhindert es nicht.',
				body: 'Eine Zeile über 64 KiB, nicht parsebar oder ungültig, wird übersprungen und gezählt. Weil der key einer übersprungenen Zeile unbekannt ist, zieht ein Feed mit übersprungenen Zeilen sieben Tage lang nichts zurück. Danach werden fehlende keys wie üblich zurückgezogen. Der Zähler ist öffentlich, ein Feed, der still Zeilen verliert, bleibt also nicht still.',
			},
			unreadable: {
				title: 'Ein Feed, den der Crawler nicht lesen kann, ist nicht folgenlos.',
				body: 'Ein Crawl gelingt nur, wenn *alles, was das Dokument auflistet*, gelesen wurde: ein akzeptables Dokument, und jeder Feed darin antwortet mit `200` oder `304`. Ein Feed mit Timeout kostet Sie nicht die anderen (die antwortenden Feeds werden aufgenommen, und bei einem gescheiterten Crawl wird nichts zurückgezogen), aber der Crawl zählt als Transportfehler, und `feeds_failed` zeigt das in Ihrem Status. Ein völlig gesundes Dokument mit einer dauerhaft toten Feed-URL geht deshalb nach derselben Sieben-Tage-Uhr in Lapse wie eine Domain, die gar nicht mehr antwortet, und verliert dreißig Tage später den Katalog. Eine Feed-URL, die Sie nicht mehr ausliefern, gehört aus dem Dokument entfernt, nicht dem Verfall überlassen.',
			},
			lapse: {
				title: 'Wenn die Discovery nicht mehr gelingt, geht Ihre Quelle in Lapse.',
				body: [
					'Ein **definitiv negatives Ergebnis**, also eine Discovery ohne akzeptables Dokument (kein Eintrag und kein Dokument; ein fehlerhafter, zu langer oder doppelter Eintrag; oder ein Dokument, das nicht 200, nicht JSON, nicht gültig ist, bei `domain` nicht mehr übereinstimmt oder einen Feed außerhalb seines Hosts nennt), versetzt die Quelle sofort in Lapse. Ein **Transportfehler** (DNS-Timeout, 5xx, 429, erreichtes Limit, beim Dokument oder bei einem Feed) ändert für sich nichts, aber sieben aufeinanderfolgende Tage, an denen jeder Versuch so endet, versetzen Sie ebenfalls in Lapse; dauerhaft Fehler auszuliefern ist also kein Weg, Ihre Claims einzufrieren.',
					'**Dieser Vertrauensvorschuss gehört einem Host, nicht Ihnen.** Er gilt nur auf einem Host, auf dem Ihre Quelle bereits verifiziert war. Auf einem Host, auf dem sie nie verifiziert war (ein neuer Slug, ein Host, auf den Sie `_prodid` gerade umgestellt haben, alles unter Weg 2 und 3), ist jeder Fehler, auch ein Timeout oder ein 5xx, definitiv negativ und versetzt Sie sofort in Lapse. Das ist Absicht: Sonst könnte eine verifizierte Quelle ihren Eintrag auf einen fremden Host richten und daran, ob ihr Lapse heute oder in einer Woche beginnt, ablesen, ob dieser Host erreichbar ist. Ein Hostwechsel kostet Sie dadurch nichts. Der erste erfolgreiche Crawl auf dem neuen Host setzt alles zurück, und ein Lapse bleibt die 30 Tage lang behebbar, bevor etwas zurückgezogen wird.',
					'Eine Quelle in Lapse nimmt keine neuen Claims an, wird Lesern als lapsed angezeigt, und ihr `publisher.contact` wird benachrichtigt. Ein Crawl einer Quelle in Lapse schreibt nichts, bis er vollständig gelungen ist; erst dann wird der Lapse aufgehoben. Nach 30 Tagen ununterbrochenem Lapse werden Ihre **Datensätze und ihre aktiven Claims gemeinsam zurückgezogen** und bleiben als Verlauf erhalten. Diese 30 Tage sind Ihr Zeitfenster zur Wiederherstellung; deshalb muss die Kontaktadresse eine sein, die jemand liest.',
					'Zurückkommen erfordert keine Änderung. Liefern Sie dasselbe Dokument und denselben Feed wie immer aus, und alles, was Sie veröffentlichen, wird in dem Moment wieder geltend gemacht, in dem die Discovery gelingt, ob sich ein Byte geändert hat oder nicht: Solange der Index nichts Aktives von Ihnen hält, verzichtet er auf bedingte Anfragen, eine unveränderte Datei ist also nie ein Grund, zurückgezogen zu bleiben.',
				],
			},
			seen: {
				title: '`seen_at` ist eine fortlaufende Aussage, und ein langer Lapse setzt sie zurück.',
				body: 'Jeder Claim, den ein Leser sieht, trägt `seen_at`: nicht, wann die Angabe irgendwo zuerst veröffentlicht wurde, sondern *seit wann diese Quelle diesen Wert ohne Unterbrechung behauptet*. Er übersteht jeden erneuten Crawl, der denselben Wert findet, darum geht es. Ein Zurückziehen übersteht er nicht. Bleibt Ihre Quelle länger als 30 Tage in Lapse, beginnt das Datum jeder Angabe ab dem Tag Ihrer Rückkehr neu, weil während der Lücke niemand Überprüfbares dahinterstand. Die zurückgezogenen Zeilen bleiben, also zeigt `?history=1` die Lücke, statt sie zu verbergen; [was ein Leser sieht](/spec#an-entity), steht in der Spezifikation.',
			},
			status: {
				title: 'Ihre Quelle hat eine öffentliche Statusseite.',
				body: '`/source/acme.example` zeigt Ihnen, dass etwas nicht stimmt: das Ergebnis des letzten Crawls, welchen Weg die Discovery genommen hat, wie viele Datensätze sich geändert haben, wie viele Zeilen übersprungen wurden, wie viele Feeds nicht lesbar waren und ob Sie in Lapse sind und seit wann. Sie meldet nur, was Ihre Domain veröffentlicht und wann der Index nachgesehen hat, nie, wer einen Crawl angefordert hat.',
			},
			media: {
				title: 'Medien werden geprüft, nicht geglaubt, und ein schlechter Eintrag kostet nur sich selbst.',
				sniffed:
					'Der Typ wird durch Lesen der Bytes bestimmt; Ihr `Content-Type` ist nur ein Hinweis. Sechs Typen werden gespeichert, sonst nichts: JPEG, PNG, GIF, WebP und AVIF als `image`, PDF als `document`. Kein SVG, kein HTML, keine Archive, keine Office-Dateien; ein Datenblatt geht als PDF raus. Der erkannte Typ und das `kind` des Eintrags müssen übereinstimmen, sonst wird der Eintrag übersprungen.',
				table: 'Medienlimits',
				what: 'Was',
				cap: 'Limit',
				caps: ['Ein Bild', 'Ein Dokument', 'Ein Medienabruf', 'Medieneinträge in einem Datensatz'],
				licence:
					'Die Lizenz wird als String geprüft, bevor etwas abgerufen wird, und sie muss genau eine von sieben SPDX-Kennungen sein: jene, die jedem erlauben, die Datei unverändert weiterzugeben, und genau das tut der Index damit:',
				licences: 'aufnehmbare Medienlizenzen',
				entry:
					'Alles hier gilt pro Eintrag. Ein abgelehnter, zu großer oder unerreichbarer Eintrag kostet diesen Eintrag und sonst nichts: **Ihr Datensatz ist nie wegen seiner Medien ungültig**, seine übrigen Claims bleiben, und kein Medienfehler versetzt Sie in Lapse. Er wird in `media_failed` gezählt und beim nächsten Crawl dieses Datensatzes erneut versucht. Eines funktioniert umgekehrt wie bei Feeds: Die Gleicher-Host-Regel gilt hier *nicht*, Ihre Bilder können also auf einem CDN liegen. [Was aufgenommen wird](/spec#what-is-ingested) und [die Lizenzliste](/spec#licences-that-can-be-ingested) enthalten die Begründung.',
			},
			others: {
				title: 'Andere Quellen werden über Ihre Produkte veröffentlichen.',
				body: 'Händler, Register, offene Datensätze und Beitragende sind Quellen wie alle anderen. Ihre Claims werden ihnen zugeschrieben und überschreiben Ihre nie; wo Sie sich widersprechen, sind beide Claims mit ihren Quellen nebeneinander sichtbar.',
			},
		},
		toc: 'Auf dieser Seite',
		question: 'Wie veröffentlichen Sie?',
		reference: 'Referenz',
		details: 'Details und Feldreferenz',
		go: 'Legen Sie Ihre Seite an',
		done: 'Diesen Schritt als erledigt markieren',
		progress: '{n} von {total} Schritten erledigt',
		check: {
			heading: 'Prüfen Sie Ihre Domain',
			lead: 'Fertig mit dem Veröffentlichen? Geben Sie Ihre Domain ein. Der Index wird gebeten, sie jetzt anzusehen, und Sie landen auf seiner Live-Statusseite.',
			label: 'Ihre Domain',
			placeholder: 'acme.example',
			button: 'Prüfen',
			working: 'Wird geprüft…',
			invalid: 'Geben Sie nur einen Hostnamen ein, etwa acme.example: kein https://, kein Pfad.',
			limited: 'Zu viele Anfragen aus Ihrem Netz. Warten Sie kurz und versuchen Sie es erneut.',
			failed: 'Der Index hat die Anfrage nicht angenommen. Versuchen Sie es in einer Minute erneut.',
			note: 'Der nächste Crawl aktualisiert den Status in wenigen Minuten.',
			looks: 'Worauf die Prüfung schaut',
			noscript: 'Ohne JavaScript öffnen Sie die Statusseite direkt:',
		},
		checklist: {
			heading: 'Bevor Sie live gehen',
			items: [
				'Die Discovery antwortet mit HTTP 200, einem JSON-Content-Type und einem Body, der gegen das Feed-Schema validiert, nicht mit einer HTML-Seite „nicht gefunden“ und Status 200.',
				'Unter _prodid.<Ihre Domain> gibt es genau einen v=prodid0-TXT-Eintrag. Zwei sind ein Fehler, ein fehlerhafter ist ein Fehler.',
				'Dieser Eintrag lautet v=prodid0; host=<hostname>. Ein Host, nie eine URL: kein Schema, kein Port, kein Pfad.',
				'Jede URL in feeds ist https und liegt auf demselben Host wie das Discovery-Dokument, das sie auflistet.',
				'Jede URL in feeds liefern Sie noch aus. Ein nicht abrufbarer Feed lässt den ganzen Crawl scheitern, und sieben Tage davon versetzen die Quelle in Lapse.',
				'Ein delegiertes Dokument enthält "domain", gleich der Domain, für die es spricht.',
				'Das Discovery-Dokument wird als application/json ausgeliefert und leitet nicht auf einen anderen Host weiter.',
				'Feeds und Dokumente senden ETag oder Last-Modified, sodass eine unveränderte Datei nur ein 304 kostet.',
				'Jede Feed-Zeile ist ein vollständiges JSON-Objekt unter 64 KiB, UTF-8, durch Zeilenumbrüche getrennt, ohne umschließendes Array und ohne nachgestellte Kommas.',
				'Jeder key ist stabil und wird nie für ein anderes Produkt wiederverwendet.',
				'Jede gtin besteht nur aus Ziffern, hat eine korrekte Prüfziffer und besteht nicht nur aus Nullen.',
				'Jeder Kennungswert ist getrimmt (kein Leerraum am Anfang oder Ende), und jeder Datensatz behält mindestens eine Kennung, die der Index speichern kann; eine mpn braucht also eine brand.',
				'Jeder Medieneintrag hat ein kind, das zu seinen tatsächlichen Bytes passt, und eine der sieben aufnehmbaren SPDX-Lizenzen, sonst wird er übersprungen.',
				'Kein Datensatz enthält eine opid. Die vergibt der Index.',
				'publisher.contact ist eine Adresse, die jemand liest.',
			],
			check: 'Dateien vor dem Ping prüfen',
			checkLead:
				'`prodid-batch check` validiert Ihr Discovery-Dokument und jeden Feed genau so, wie der Index es täte, ohne Token und ohne den Index zu fragen. Es läuft aus einem Klon des Repositorys mit [Bun](https://bun.sh) 1.4.4. Geben Sie ihm die Dateien selbst: Ein Pfad auf `.json` wird als ein Dokument gelesen, jeder andere als NDJSON-Feed.',
			checkLabel: 'prüfen, was Sie ausliefern, so wie der Index',
			checkResult:
				'Eine Datei ohne Problem gibt `ok` und die Anzahl der Datensätze aus, die der Index daraus übernehmen würde. Sonst gibt es pro Problem eine Zeile im Format `items.ndjson:12: message` mit der betroffenen Feed-Zeile aus und endet mit einem Exit-Code ungleich null. Es liest die Dateien, nicht Ihr DNS oder Ihren Server; TXT-Eintrag, Content-Type und Cache-Header aus der Liste oben müssen Sie also weiterhin selbst prüfen.',
			rules:
				'Die Regeln, gegen die ein Datensatz validiert wird, stehen in der [Spezifikation](/spec), die Schemas liegen unter [`/spec/schemas/v1`](/spec/schemas/v1), und [`/spec/fixtures/v1`](/spec/fixtures/v1) enthält maschinenlesbare Vektoren, gegen die Sie Ihren Exporter laufen lassen können, bevor jemand ihn crawlt.',
			status: 'Stand:',
			formats: 'Die Dateiformate auf dieser Seite sind die, die der Index liest, wenn Sie ihn pingen.',
		},
	},

	data: {
		title: 'Offene Daten — prodid',
		description:
			'Laden Sie den gesamten prodid-Index herunter: ein nächtlicher Dump aller Quellen, Entitäten, Datensätze, Gruppierungen und Zusammenführungen als gzip-NDJSON, unter CC0 für das, was der Index erzeugt, und unter der Lizenz jeder Quelle für ihre Claims.',
		eyebrow: 'Offene Daten',
		heading: 'Den Index herunterladen',
		lead: 'Der Index ist ersetzbar. Alles, was er weiß und ein Leser wissen darf, wird als vollständiger Export veröffentlicht, als Dump, den jeder herunterladen und in einen eigenen Index laden kann.',
		latest: {
			heading: 'Der neueste Dump',
			before: 'Als diese Seite gebaut wurde, war der neueste Dump der Snapshot vom',
			after: '. Jede Nacht um 04:30 UTC wird ein neuer geschrieben, und',
			names: 'nennt immer den neuesten.',
			lines: (count: string, one: boolean) => `${count} ${one ? 'Zeile' : 'Zeilen'}`,
			per: (what: string) => `Eine Zeile pro ${what}.`,
			directory: (directory: string, manifest: string, created: string, index: string, claims: string) =>
				`Das Verzeichnis dieses Dumps ist \`${directory}\`, sein Manifest ist [\`manifest.json\`](${manifest}), geschrieben am ${created}. Seine Lizenzen lauten \`index: ${index}\` und \`claims: ${claims}\`.`,
		},
		holds: {
			'sources.ndjson.gz': { per: 'Quelle', line: 'Der Status der Quelle, genau wie /source/{name} ihn liefert.' },
			'entities.ndjson.gz': {
				per: 'Entität, zusammengeführte eingeschlossen',
				line: 'Das Entitätsdokument genau wie /id/{opid}?history=1 es liefert, zurückgezogene Claims eingeschlossen.',
			},
			'records.ndjson.gz': {
				per: 'Datensatz, zurückgezogene eingeschlossen',
				line: 'source, key, feed, opid, body, first_seen, last_seen, withdrawn_at.',
			},
			'groupings.ndjson.gz': { per: 'Gruppierung', line: 'source, kind, key, opid.' },
			'merges.ndjson.gz': { per: 'Zusammenführung, rückgängig gemachte eingeschlossen', line: 'from, into, decided_at, reverted_at.' },
		},
		layout: {
			heading: 'Wo Dumps liegen',
			lead: 'Ein Dump ist ein Verzeichnis, benannt nach dem UTC-Datum seines Snapshots, unter der Version, in der er geschrieben ist. `v1/` enthält v1-Dumps, deren Manifest und deren Quell- und Entitätszeilen v1-Dokumente sind. Es enthält fünf Datendateien und ein Manifest.',
			last: '**latest.json wird zuletzt geschrieben.** Es ist eine Kopie der `manifest.json` des neuesten Dumps und wird geschrieben, nachdem jede Datei dieses Dumps und sein Manifest bereitliegen. Wer davon ausgeht, findet nie ein Manifest, das eine noch fehlende Datei nennt, und findet das Verzeichnis über das manifesteigene `snapshot_at`.',
			retention:
				'**Aufbewahrung.** Ein täglicher Dump wird 7 Tage aufbewahrt. Der erste Dump jedes UTC-Monats bleibt dauerhaft. Ein aufbewahrter Dump wird nie neu geschrieben: Verzeichnis, Dateien und Manifest bleiben Byte für Byte, wie sie waren.',
			v0: (dumps: string, latest: string) =>
				`**v0-Dumps.** Die vor v1 geschriebenen v0-Dumps bleiben unter \`${dumps}\`, mit derselben Aufbewahrung, und [\`v0/latest.json\`](${latest}) nennt weiterhin den letzten davon. Sie validieren dauerhaft gegen die v0-Schemas.`,
			manifest: (schema: string) =>
				`**Das Manifest.** Es nennt jede der fünf Dateien genau einmal, mit SHA-256 und Größe der Datei, wie sie ausgeliefert wird, komprimiert, und ihrer Zeilenzahl nach dem Entpacken. Prüfen Sie jede Datei vor dem Laden gegen ihren Digest. Das Schema ist [\`${schema}\`](${schema}), mit Vektoren in [\`/spec/fixtures/v1/dump\`](/spec/fixtures/v1/dump).`,
		},
		files: {
			heading: 'Was jede Datei enthält',
			lead: 'Jede Datei ist gzip-komprimiertes NDJSON, ein JSON-Objekt pro Zeile. Alle fünf werden aus einem konsistenten Snapshot gelesen und stimmen deshalb überein: Jede Quelle, die eine Zeile nennt, hat ihre Zeile in `sources.ndjson.gz`, und jede `opid`, die eine Zeile nennt, hat ihre Zeile in `entities.ndjson.gz`.',
			table: 'Dump-Dateien',
			columns: ['Datei', 'Eine Zeile pro', 'Die Zeile'],
			merged: 'Zusammengeführte Entitäten',
			mergedBody:
				'Eine zusammengeführte `opid` antwortet am Resolver mit `308` und hat deshalb kein eigenes Dokument zum Kopieren. Ihre Zeile ist das Dokument, das sie liefern würde, wäre sie nicht zusammengeführt (ihre eigenen Kennungen und Claims bleiben an ihr, das macht eine Zusammenführung umkehrbar), mit einem zusätzlichen Element, `merged_into`, der `opid` der verbleibenden Entität. Zusammenführungen verketten sich nicht: Die verbleibende Entität ist nie selbst zusammengeführt.',
			record: 'Eine Datensatzzeile',
			recordLead: 'Ein Datensatz, wie der Index ihn hält. Jede Zeitangabe ist UTC, ISO 8601.',
			recordTable: 'Felder einer Datensatzzeile',
			recordColumns: ['Feld', 'Bedeutung'],
			recordFields: [
				'Der Name der Quelle.',
				'Der key des Datensatzes in dieser Quelle.',
				'Die URL des Feeds, aus dem er gelesen wurde. Fehlt bei einem Datensatz aus einem Datensatzimport.',
				'Das Item, auf das er aufgelöst wurde.',
				'Das org.prodid.item, das der Publisher gesendet hat, unverändert.',
				'Wann der Index ihn zuerst gelesen hat.',
				'Wann der Index ihn zuletzt gelesen hat.',
				'Genau dann vorhanden, wenn der Datensatz zurückgezogen ist.',
			],
			grouping: 'Eine Gruppierungszeile',
			groupingLead:
				'Auf welche Entität eine Gruppierung einer Quelle aufgelöst wurde. `kind` ist `family` oder `variant`, und `key` ist das, wonach die Datensätze der Quelle gruppiert sind, ausgeschrieben statt gehasht, damit eine andere Implementierung ihre eigene Gruppierung zuordnen kann.',
			groupingNotes: [
				'für eine Publisher-Gruppe; { "key": "<key>" } für einen Datensatz ohne Gruppe, der eine eigene Familie ist.',
				'die Variante des Datensatzes, {} wenn er keine hat.',
			],
			familyKey: '{ "family": <key der Familie>, "variant": { <Achse>: <Wert>, … } }',
			merge: 'Eine Zusammenführungszeile',
			mergeBody:
				'Eine Entscheidung zur Zusammenführung: `from` die zusammengeführte `opid`, `into` die verbleibende, `decided_at` wann sie getroffen wurde, und `reverted_at`, genau dann vorhanden, wenn sie rückgängig gemacht wurde.',
		},
		never: {
			heading: 'Was ein Dump nie enthält',
			lead: 'Ein Dump sagt nicht mehr als der Resolver ohnehin, plus die Datensätze, Gruppierungen und Zusammenführungen, aus denen seine Antworten gebaut sind.',
			items: [
				'Die Kontaktadresse eines Publishers, die der Index nur hält, um die Lapse-Benachrichtigung zu senden.',
				'Das Crawl-Protokoll, die Fehlertexte des Crawlers oder sonst etwas über einen Crawl, das der Status der Quelle nicht zeigt.',
				'Warum eine Zusammenführung erfolgte oder wer sie entschieden hat.',
				'Warum ein Medien-Hash gesperrt wurde.',
				'Medien-Bytes. Die media_url eines Medien-Claims adressiert die Datei, und ein gesperrter Hash wird nicht ausgeliefert.',
				'Die internen Zeilenkennungen des Index. Jede Zeile nennt eine Quelle beim Namen und eine Entität bei ihrer opid.',
				'Die Freigaben und ihre Nachweise. Die Zeile einer Quelle sagt authoritative, wenn sie es zu snapshot_at war, aber ein aus dem Dump geladener Index hält keine Freigabe, bis sein eigener Betreiber eine erteilt.',
			],
		},
		licences: {
			heading: 'Lizenzen',
			lead: 'Zwei Regeln, und `licenses` im Manifest nennt beide.',
			index: 'Alles, was der Index erzeugt',
			indexBody: '`opid`s, die Kennungszuordnungen, die Hierarchie aus Familie und Variante, Gruppierungen und Zusammenführungen.',
			claims: 'Jeder Claim und jeder Datensatz',
			claimsBody:
				'Unter der Lizenz, die seine eigene Quelle angibt: die `license` der Zeile dieser Quelle in `sources.ndjson.gz`. Eine Quelle ohne Angabe hat nichts eingeräumt, und prodid räumt in ihrem Namen nichts ein.',
			datasets:
				'Ein offener Datensatz ohne eigenes Discovery-Dokument kommt als Quelle namens `dataset:<slug>` in den Index, importiert vom Betreiber des Index aus dem öffentlichen Export des Datensatzes. Eine solche Quelle ist immer `unverified`, und ihre `license` ist die des Datensatzes. Die Regeln stehen in der [Spezifikation](/spec#dataset-sources).',
		},
		load: {
			heading: 'In einen eigenen Index laden',
			lead: '`prodid-batch load-dump` lädt einen v0- oder v1-Dump in eine leere PostgreSQL-18-Datenbank, die auf dieselbe Version migriert ist, in einer Transaktion. Es nimmt das datierte Verzeichnis eines Dumps, seine `manifest.json` oder eine `latest.json`, lokal oder über HTTPS.',
			label: 'aus einem Klon des Repositorys',
			checked:
				'Jede Datei wird gegen `sha256`, `bytes` und `lines` des Manifests geprüft, bevor etwas geschrieben wird, und ein entfernter Dump wird zuerst in ein temporäres Verzeichnis geladen. Eine nicht leere Datenbank wird abgelehnt. `PRODID_OPERATOR` wird als Entscheider der geladenen Zusammenführungen gespeichert.',
			peek: 'Um eine Datei ohne Laden zu lesen, prüfen Sie sie gegen ihren Digest und entpacken Sie sie. Der Digest unten ist der aus dem neuesten Manifest zum Zeitpunkt, als diese Seite gebaut wurde.',
			rules: 'Die vollständigen Regeln stehen in der Spezifikation unter [Dumps](/spec#dumps).',
		},
	},
}
