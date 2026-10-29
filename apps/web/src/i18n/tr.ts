import type { Copy } from '@/i18n/copy'
import { CONTACT } from '@/lib/spec'

export const tr: Copy = {
	common: {
		skip: 'İçeriğe geç',
		home: 'prodid, başlangıç',
		primary: 'Ana menü',
		nav: {
			spec: 'Şartname',
			specShort: 'Şartname',
			publish: 'Yayınla',
			publishShort: 'Yayınla',
			data: 'Veri',
			dataShort: 'Veri',
		},
		toDark: 'Koyu temaya geç',
		toLight: 'Açık temaya geç',
		language: 'Dil',
		status:
			'Şartname v1. Dizin ve barındırılan yayıncı prodid.org üzerinde çalışıyor. Herkes kendi alan adında ya da barındırılan olarak yayın yapabilir.',
		normative: 'Şartname yalnızca İngilizce yayımlanır ve bağlayıcı metin İngilizce olanıdır.',
		imageAlt:
			'prodid: yayıncılar ürün bilgilerini kendi alan adlarında yayımlar, tek bir açık dizin her kodu kalıcı bir kimliğe bağlar ve dizinin tamamını herkes indirebilir.',
		support: {
			label: 'prodid’yi destekle',
			heading: 'prodid açık kaynak. Büyümesine yardım et.',
			body: 'Başkaları da bulsun diye depoyu yıldızla, yanlış olanı bize bildir, bir düzeltme gönder ya da GitHub hesabın olmadan buradan bize yaz.',
			star: 'GitHub’da yıldızla',
			stars: (count: string) => `${count} yıldız`,
			contribute: 'Katkıda bulun',
			chat: 'Bize yaz',
		},
		footer: {
			tagline: 'Her fiziksel ürün için açık bir kimlik ve veri katmanı.',
			label: 'Alt bilgi',
			site: 'Site',
			specification: 'Şartname',
			publish: 'Ürünlerini yayınla',
			github: 'GitHub’daki kaynak kod',
			contact: 'İletişim',
			report: 'Sorun bildir',
			security: 'Güvenlik',
			licence:
				'Şartname ve şemalar CC0’dır; prodid.org’un yayımladığı `opid`’ler ve tanımlayıcı eşlemeleri de öyle. Diğer her iddia, onu yapan kaynağın lisansını taşır. Referans uygulama Apache-2.0’dır.',
		},
	},

	home: {
		title: 'prodid — her fiziksel ürün için açık kimlik',
		description:
			'prodid her fiziksel ürüne kalıcı, açık bir kimlik verir. GTIN, MPN ve diğer tüm kodlar bu kimliğe çözülür; her bilgi, kaynağı belli bir iddiadır.',
		badge: 'Şartname v1 · yayında',
		headline: 'Barkod ürün değildir.',
		headlineAccent: 'prodid ise ürünün kendisi.',
		lead: 'Her fiziksel ürün için kalıcı ve açık bir kimlik. Her barkod ve parça numarası bu kimliğe çözülür; ürünle ilgili her bilgi, onu söyleyen kaynağı gösterir.',
		ctaPublish: 'Ürünlerini yayınla',
		ctaSpec: 'Şartnameyi oku',
		heroKind: (brand: string) => `Item · ${brand}`,
		heroVariant: (markets: string) => `lacivert · M · ${markets} pazarında`,
		heroLapsed: (source: string) => `lapsed · ${source}`,
		heroCaption: 'Etiketteki kodu okuttuğunda dönen yanıt. Kayıt, şartnamenin kendi örneği.',
		sceneLabel:
			'Kendi alan adında yayın yapanlar, barındırılan yayıncılar ve açık veri setleri iddialarını tek bir açık dizine gönderir; dizin üründeki kodu çözer ve kendisini döküm olarak yayımlar.',
		sceneCaption:
			'Yayıncılar bilgileri kendi alan adlarında, barındırılan olarak ya da açık veri setlerinden yayımlar. Dizin etiketteki her kodu tek bir kalıcı opid’e bağlar; dizinin tamamı indirmeye açıktır.',
		problem: {
			eyebrow: 'Sorun',
			heading: 'Dört kod, tek mont, aralarında hiçbir bağ yok.',
			body: 'Bir ürün her pazar, paket boyu ve ambalaj değişikliği için yeni bir barkod alır; verisi de her biri için ayrı bir sistemde durur. İkisi çeliştiğinde biri sessizce ezilir.',
			answer: 'prodid ürünün kendisine, barkod değişince değişmeyen bir kimlik verir.',
			figure: 'Tek bir varyanta çözülen birkaç kod',
			anotherGtin: 'başka bir GTIN',
			codes: ['DE ve TR için perakende birimi', 'aynı mont, ikili pakette', 'gelecek yılın ambalajı', 'üretici parça numarası'],
			variant: 'Tek varyant',
			variantNote: 'Asla yeniden kullanılmaz, asla silinmez. Buraya bir kez işaret etmiş her kod çalışmaya devam eder.',
		},
		model: {
			eyebrow: 'Model',
			heading: 'Aile, varyant, ürün birimi. Kodlar onlara işaret eder; onların kendisi değildir.',
			lead: 'Her seviyenin kendi `opid`’i var: hiçbir şey kodlamayan 16 karakter. Bu yüzden ürünle ilgili hiçbir değişiklik onları yanlış yapamaz.',
			levels: [
				{ title: 'Acme Trail Jacket', note: 'İnsanların konuştuğu haliyle ürün.' },
				{ title: 'lacivert · M beden', note: 'Renk, beden ve benzerlerinin tek bir birleşimi.' },
				{ title: 'DE ve TR için perakende birimi', note: 'Barkodu taşıyan şey.' },
			],
			after:
				'Yeni ambalaj, aynı varyant ve aynı aile altında yeni barkodlu yeni bir ürün birimi ekler. Eskisine işaret eden hiçbir şey bozulmaz.',
		},
		how: {
			eyebrow: 'Nasıl çalışır',
			heading: 'Alan adında yayınla. prodid dizinler. Herkes çözer.',
			publish: {
				step: '01 · Yayınla',
				title: 'Alan adında üç şey',
				body: 'Bir keşif belgesi, her satırda bir ürün olan bir akış ve alan adının senin olduğunu kanıtlayan bir DNS kaydı.',
				link: 'Nasıl yayınlanır →',
			},
			index: {
				step: '02 · Dizinle',
				title: 'Denetlenir, eşleştirilir, kaynağa bağlanır',
				checks: [
					'her satır şemaya göre doğrulanır',
					'var olan bir opid ile ya da yeni biriyle eşleşir',
					'her alan, alan adının iddiası olarak saklanır',
				],
				body: 'Perakendeciler, sicil kurumları ve açık veri setleri de aynı şekilde birer kaynaktır: üreticinin yanında, asla üstünde değil.',
				link: 'İddialar nasıl çalışır →',
			},
			resolve: {
				step: '03 · Çöz',
				title: 'Ürünün üzerine basılan tek bir URL',
				browser: 'Tarayıcı → okunur bir görünüm',
				api: 'API → JSON kaydı',
				body: 'Yol GS1 Digital Link sözdizimindedir; yani etiketteki QR kodun kendisi olabilir.',
				link: 'Çözümleme nasıl çalışır →',
			},
		},
		claims: {
			eyebrow: 'İddialar',
			heading: 'Her bilgi kaynağını söyler. Anlaşmazlık görünür kalır.',
			lead: 'Hiçbir şey tek bir “doğru”da birleştirilmez. Bir kaynak yayını bıraktığında iddiaları silinmez; saklanır ve lapsed olarak işaretlenir.',
			caption: 'Şartnamedeki örnek ürün biriminin iddiaları',
			columns: ['Özellik', 'Değer', 'Kaynak', 'Güven', 'Görülme'],
			lapsed: ' · lapsed',
			trust: [
				'Alan adını kontrol ediyor ve marka sahibi olduğu teyit edilmiş.',
				'Bir alan adının kontrolünü DNS ile ya da kendi sitesi üzerinden kanıtlamış.',
				'Alan adı olmayan barındırılan bir ad, bir veri seti ya da bir katkı.',
			],
			details: 'İsteği ve JSON kaydının tamamını gör',
			request: 'İstek ve yanıt başlıkları',
		},
		who: {
			eyebrow: 'Kimin için',
			heading: 'Veriyi üretenler ve ona ihtiyaç duyanlar için.',
			audiences: [
				{
					title: 'Üreticiler',
					body: 'Ürün verini bir kez, kendi alan adında söyle. Ürettiğin şeyin tanımı hiçbir bayi ilanına ya da pazaryerine ait olmaz.',
				},
				{
					title: 'E-ticaret, ERP ve PIM sağlayıcıları',
					body: 'Her mağaza alan adı için bir keşif belgesi ve bir akış; zaten elinde olan veriden üretilir.',
				},
				{
					title: 'Geliştiriciler',
					body: 'Her kodu, yeniden ambalajlamaya dayanan bir kimliğe çöz. Her bilgi kimin, ne zaman söylediğini ve o kaynağın hâlâ onu üstlenip üstlenmediğini gösterir.',
				},
			],
			passport:
				'**AB Dijital Ürün Pasaportu hakkında.** ESPR, ürün üzerindeki bir veri taşıyıcıdan erişilebilen bir pasaport istiyor ve GS1 Digital Link bunun için standartlaştırılan taşıyıcı sözdizimlerinden biri. prodid bir pasaport hizmeti değil ve burada yayın yapmak hiçbir şeye uyum anlamına gelmez; yaptığı aynı zemin işidir: her ürün için, senin kontrol ettiğin sabit bir adreste, makinenin okuyabildiği tek bir kayıt.',
		},
		status: {
			eyebrow: 'Durum',
			heading: 'İşler gerçekte nerede.',
			stable: {
				label: 'Kararlı',
				title: 'Şartname v1.',
				body: `Yalnızca ekleme yapılarak değişir; başka her değişiklik v2 olur. v0 keşif belgesi 2027-01-26 00:00 UTC’ye kadar kabul edilir. [Oku](/spec) ve [nerede yanlış olduğunu söyle](${CONTACT.issues}).`,
			},
			sources: {
				label: 'Canary ve bir veri seti',
				title: 'Henüz hiçbir yayıncının kataloğu dizinde değil.',
				body: 'Dizinde iki kaynak var: projenin kendi canary’si [canary.prodid.org](https://prodid.org/source/canary.prodid.org), yayın, tarama ve çözümlemenin uçtan uca çalıştığını kanıtlar; ve [dataset:wikidata](https://prodid.org/source/dataset:wikidata), 5 Wikidata öğesinden oluşan sınırlı bir deneme aktarımı, unverified ve CC0-1.0 altında.',
			},
			design: {
				label: 'Tasarım gereği',
				title: 'Dizin değiştirilebilir.',
				body: 'Şartname, şemalar, opid’ler ve kod eşlemeleri [CC0](/spec#licensing). Her iddia kaynağının lisansını korur. Bilgiler onları yayımlayan alan adlarında durur; böylece herkes onları yeniden tarayabilir ve basılı kodlar anlamını korur.',
			},
		},
	},

	publish: {
		title: 'Ürünlerini yayınla — prodid',
		description:
			'Bir üretici ya da yazılım sağlayıcısı ürün verisini prodid’e nasıl yayınlar: keşif belgesi, NDJSON akışı, kimliği taşıyan tek DNS TXT kaydı ve ping.',
		eyebrow: 'Yayıncı rehberi',
		heading: 'Ürünlerini yayınla',
		lead: 'prodid’e yayın yapmak, web’e iki dosya ve DNS’e bir kayıt koymak demek. Kendi alan adında kayıt olunacak bir yer ya da saklanacak bir anahtar yok: kimlik bilgisi alan adının kendisi; yayımladığını dosyaları değiştirerek değiştirir ya da geri çekersin.',
		discovery: {
			heading: 'Dizin seni nasıl bulur',
			lead: 'Her şeyden önce bilmeye değer, çünkü aşağıdaki üç yoldan hangisinin senin olduğunu bu belirler. Keşif her taramada sıfırdan, önce DNS’le çalışır ve verine giden yol taramalar arasında hatırlanmaz.',
			first: 'Önce',
			firstTitle: '`_prodid.acme.example` adresinde bir DNS TXT kaydı',
			firstBody:
				'Orada bir `v=prodid0` kaydı varsa, kendi alan adını gösterse bile yalnızca o izlenir. Kayıt bir *host* adlandırır; belge her zaman `https://<host>/.well-known/prodid.json` adresindedir.',
			second: 'Yalnızca böyle bir kayıt yoksa',
			secondBody: 'Alan adının kendi üzerindeki belge. Alan adını HTTPS üzerinden kim sunuyorsa onun adına o konuşur.',
			why: 'DNS önce gelir çünkü daha güçlü bir kanıttır: bir host’a dosya koyabilen herkes alan adının sahibi değildir ve sahibin bunu geçersiz kılabilmesi gerekir. Dosyayı kendin sunsan bile kaydı yazman gerekmesinin nedeni de bu; ne kazandırdığını [1. yol, 3. adım](#own-domain) anlatıyor.',
			one: '**Tam olarak bir kayıt, arkasında hiçbir şey yok.** O adda birden fazla `v=prodid0` kaydı bir hatadır, aralarında bir seçim değil; tek bir bozuk ya da fazla uzun kayıt da hatadır. Yedek yol yoktur: bir kayıt varsa ve çalışmıyorsa, keşif tarayıcıyı alan adına yönlendirmek yerine orada biter. Host değiştiriyorsan kaydı değiştir, asla ikinci bir kayıt ekleme. Test vektörleriyle birlikte dilbilgisi [şartnamede](/spec#the-_prodid-txt-record).',
			answer:
				'**Yanıt sayılan nedir.** En fazla bir yönlendirmeden sonra HTTP 200, JSON içerik türü, akış şemasına göre doğrulanan bir gövde ve keşfedilen alan adını gösteren bir `domain`. Bilinmeyen yollara HTML ve 200 ile yanıt veren bir site yanıt vermiş sayılmaz; `text/html` olarak sunulan bir belge de öyle.',
		},
		routes: {
			heading: 'Nasıl yayınlayacağını seç',
			lead: 'Kimlik ve barındırma ayrı şeyler. Kimliğin, kontrol ettiğin bir alan adıdır; belgelerin gerçekte nerede sunulduğu ise kimliğini ya da prodid’in ürünlerine atadığı hiçbir tanımlayıcıyı değiştirmeden sonra değiştirebileceğin bir ayrıntı. Üç yol var ve üçü de birebir aynı kayıtları üretir.',
			route: (n: string) => `${n}. yol`,
			detail: (n: string) => `${n}. yolun ayrıntısı →`,
			start: 'publish.prodid.org’da başla →',
			identity: 'Kimlik',
			trust: 'Güven',
			items: [
				{
					when: 'Kendi alan adında dosya sunabiliyorsun.',
					who: 'BT ekibi olan bir marka ya da barındırdığı her mağaza için yayın yapan bir platform: e-ticaret, ERP, PIM.',
					how: 'Keşif belgesini alan adında sun ve alan adının kendisini gösteren bir TXT kaydı yayınla.',
					identity: 'alan adı',
				},
				{
					when: 'Bir alan adın var ama oradan dosya sunamıyorsun.',
					who: 'Web sitesi kontrol etmediği bir platformda duran bir üretici.',
					how: 'Barındırılan bir slug’da yayınla ve alan adındaki tek bir TXT kaydını o host’a yönlendir.',
					identity: 'DNS ile kanıtlanmış alan adı',
				},
				{
					when: 'Hiç alan adın yok.',
					who: 'Küçük bir üretici ya da bir kooperatif.',
					how: 'Barındırılan bir slug’da yayınla. Sonra hiçbir şey kaybetmeden bir alan adı ekle.',
					identity: 'slug host’u',
				},
			],
			hosted:
				'2. ve 3. yol, `<slug>.prodid.org` adresindeki barındırılan yayın hizmetini kullanır. E-postana gelen bir bağlantıyla [publish.prodid.org](https://publish.prodid.org/)’a giriş yap, bir site oluştur, dosyanı yükle ve varsa alan adını bağla. Her şeyi dışa aktarabilir ya da siteyi istediğin an oradan silebilirsin.',
		},
		table: {
			field: 'Alan',
			required: 'Zorunlu',
			what: 'Ne işe yarar',
			yes: 'evet',
			no: 'hayır',
			delegating: 'devrederken',
		},
		own: {
			eyebrow: '1. yol',
			heading: 'Kendi alan adında yayınla',
			lead: 'İki dosya ve bir DNS kaydı. Mağazalar adına yayın yapan bir platform aynı şeyi her mağazanın alan adında yapar; böylece her mağaza kendi kimliğini ve kendi güven seviyesini korur.',
			step1: '1. adım — Keşif belgesini sun',
			step1Lead: (url: string) => `Sabit bir yolda, ürün akışlarının nerede olduğunu listeleyen tek bir dosya: \`${url}\``,
			feedCaption: 'spec/fixtures/v1/examples/prodid.json örneği, dosyanın kendisinden üretildi.',
			feedTable: 'Keşif belgesi alanları',
			feedFields: [
				'Her zaman org.prodid.feed.',
				'1. Değeri 0 olan bir belge, 2027-01-26 00:00 UTC’den önce başlayan taramalarda kabul edilir; sonrasında kesin olumsuz olarak reddedilir.',
				'İddialarının yanında bir insanın görmesi gereken ad.',
				'Birinin gerçekten okuduğu bir e-posta adresi. Kaynağın lapse olduğunda dizin buraya yazar ve alacağın tek uyarı budur.',
				'Akışlarındaki bilgileri kapsayan SPDX tanımlayıcısı, örneğin CC0-1.0.',
				'En fazla 100 https URL’si, hepsi bu belgeyle aynı host’ta.',
				'Bu belgenin adına konuştuğu alan adı. Belgeye başka bir host’u gösteren bir TXT kaydıyla ulaşıldığında zorunludur ve o alan adına eşit olmalıdır. Belgeyi alan adı kendisi sunuyorsa isteğe bağlıdır; ama varsa yine eşleşmelidir.',
			],
			serve:
				'Varsayılan portta, geçerli bir sertifikayla, HTTPS üzerinden `application/json` olarak sun; ya da herhangi bir `application/…+json` olarak. Başka bir host’a yönlendirme: tarayıcının izlediği tek yönlendirme `acme.example`’dan `www.acme.example`’a olanıdır.',
			step2: '2. adım — Akışı sun',
			step2Lead:
				'Akış NDJSON’dır: her satırda tam bir JSON nesnesi, UTF-8, satırlar yeni satırla ayrılır. Etrafında dizi yok, satırlar arasında virgül yok. Böylece iki milyon ürünlük bir akış satır satır akar ve bozuk bir satır sana geri kalanı değil yalnızca o satırı kaybettirir.',
			itemsCaption:
				'spec/fixtures/v1/examples/items.ndjson dosyasından tek bir ürünün üç varyantı. Aynı group’u paylaştıkları için dizin bunlardan üç varyantlı tek bir aile kurar.',
			sameHost:
				'**Akışlar, onları listeleyen belgeyle aynı host’ta durur.** Başka bir host’taki akışı gösteren bir keşif belgesi kısmen değil bütünüyle reddedilir: tek bir akışı değil tüm kaynağı kaybedersin ve bu kesin olumsuz sayılır, yani aşağıdaki lapse saatini başlatır. JSON’u sitenden, NDJSON’u ayrı bir CDN host adından sunmak istemek normaldir; ama v1’de desteklenmez. İkisini de tek host’a koy.',
			firstLine: 'Bu satırların ilki, okunacak şekilde açılmış haliyle:',
			itemLabel: 'tek bir org.prodid.item kaydı',
			itemTable: 'Ürün kaydı alanları',
			itemFields: [
				'Her zaman org.prodid.item.',
				'Bu kaydın akış içindeki kalıcı adı. Aynı key’i yeniden yayınlamak öncekinin yerine geçer.',
				'Markanın ürün üzerinde göründüğü hali. Bir mpn’i kapsamadan önce normalleştirilir; yani ARÇELİK ve Arçelik iki değil tek markadır.',
				'Varyant eksenleri olmadan ürün adı.',
				'En az bir { scheme, value } ve dizinin saklayabileceği en az bir tane. Değerlerin başında ya da sonunda boşluk olmaz ve boş olmazlar. Bir gtin, doğru kontrol hanesiyle 8, 12, 13 ya da 14 haneli olmalı ve tümü sıfır olmamalıdır; bir mpn, bir şeye normalleşen bir brand ister, çünkü benzersiz olduğu kapsam odur; kısıtlı dolaşım gtin’i saklanır ama yalnızca senin kendi rcn’in olarak. Saklanabilir hiçbir şeyi kalmayan kayıt hiçbir şeyi tanımlamaz ve atlanır.',
				'Bu kayıttaki insanların okuyacağı metin için BCP 47 etiketi.',
				'Kendi gruplama anahtarın. Aynı değeri paylaşan ürün birimleri tek bir ailenin varyantlarıdır.',
				'Bu ürün birimini grup içinde ayıran eksenler: renk, beden, kapasite.',
				'GS1 GPC brick kodu; gpc: ve ardından sekiz hane olarak yazılır.',
				'Bu ürün biriminin satıldığı pazarların ISO 3166-1 alpha-2 kodları.',
				'Metinler, sayılar, mantıksal değerler, listeler ya da bir ölçü için { value, unit }.',
				'En fazla 20 https URL’si; her biri bir kind ve alınabilir listeden bir SPDX lisansıyla. Akışların aksine bunlar herhangi bir host’ta olabilir.',
			],
			flat: 'Düz ürün birimleri gönder. Aileleri ya da varyantları kendin kurmazsın ve asla `opid` göndermezsin: dizin ilkini `group`’tan türetir, ikincisini kendisi atar. Zaten bir Google Merchant akışı üretiyorsan `group` senin `item_group_id`’indir.',
			barcodes:
				'Dışa aktarmadan önce barkodlarla ilgili bilmeye değer iki şey var. Tümü sıfır olan bir `gtin` barkod değil, bir katalog yer tutucusudur; onu taşıyan kayıt hatalı kontrol hanesi gibi reddedilir. [Kısıtlı dolaşım numarası](/spec#which-gtins-are-identifiers), yani mağaza içi aralıklar, saklanır ve sana atfedilir; ama küresel olarak hiçbir şeyi tanımlamaz, bu yüzden ürününü asla başkasınınkiyle birleştirmez ve `/01/` onu çözmez.',
			step3: '3. adım — Kimliği DNS’te sahiplen',
			step3Lead: 'Dosyalar yayına girdikten sonra host olarak kendi alan adını gösteren tek bir kayıt yayınla.',
			step3Why:
				'Kayıt, keşfin zaten bulacağı yeri gösterir; yani verinle ilgili hiçbir şey değişmez. Değişen şey, DNS’ine yalnızca ekleme yetkisi olan birinin yapabildikleridir. Kayıt yoksa, onların eklediği bir kayıt kimliğini sessizce ele geçirir, çünkü DNS dosyaya üstün gelir. Senin kaydın zaten oradaysa, ikinci bir kayıt keşfin *birden fazla kayıt* hatasıyla başarısız olmasına yol açar: görünür, bildirilen ve geri alınabilen bir lapse.',
			neverDelegate:
				'**`_prodid`’i asla bir tedarikçiye devretme.** `_prodid.<domain>` üzerinde yazma yetkisi, tıpkı DKIM ya da ACME DNS-01 doğrulamasında olduğu gibi, kimliğinin kontrolü demektir. DNS’i paylaşılan bir alan adı, paylaşılan bir kimliktir. Ajansa akışı ver, kaydı değil.',
			order:
				'Dosyaları kayıttan önce yükle, sonra değil: henüz orada olmayan bir belgeyi gösteren kayıt başarısız bir keşiftir. Değerler büyük-küçük harf duyarsız okunur ve sondaki tek nokta sorun değildir; yani `ACME.Example.` ile `acme.example` aynı host’tur.',
			step4: '4. adım — Dizine değiştiğini bildir',
			step4Lead: 'İsteğe bağlı. Bilinen her alan adı bir takvime göre yeniden taranır; ping yalnızca bir sonraki taramayı öne çeker.',
			pingLabel: 'dizinden keşfi şimdi çalıştırmasını iste',
			ping: '`{"domains": [...]}` tek seferde en fazla 1000 tane alır; bir platform barındırdığı her mağazayı böyle tanıtır. Gönderilecek bir anahtar yok, çünkü ping çağırana içerik üzerinde hiçbir söz hakkı vermez; tek söylediği de `202`’dir. Alan adının bilinip bilinmediğini, bir şey bulunup bulunmadığını ya da bir dakika önce başka birinin ping atıp atmadığını söylemez. `429` yalnızca *senin* kendi istek bütçeni aştığın anlamına gelir; hatalar `application/problem+json` olarak döner. Alan adına ne olduğu ping’de değil, [kaynak durumunda](#after) görünür.',
		},
		delegated: {
			eyebrow: '2. yol',
			heading: 'Barındırmayı devret, kimliği koru',
			lead: 'Pek çok üreticinin bir alan adı vardır ama ona dosya koyamaz. Akış başka bir yerde barındırılır ve alan adı DNS ile kanıtlanır; böylece kaynak kimliği yine alan adıdır ve güven seviyesi yine `verified` olur. [publish.prodid.org](https://publish.prodid.org/)’da bir site oluştur, alan adını gir; eklemen gereken kaydı birebir gösterir ve senin için denetler.',
			looks: 'Nasıl görünür',
			steps: [
				'**Barındırılan bir slug’a yüklenmiş bir katalog**, örneğin `acme.prodid.org`; hem keşif belgesini hem akışı sunar.',
				'**Sahip olduğun alan adında, o host’u gösteren tek bir TXT kaydı.** URL değil host; böylece bir kayıt tarayıcıyı asla rastgele bir adrese yönlendiremez.',
				'**Alan adını geri gösteren bir belge.** DNS *belgem şurada* der; belge *o alan adı adına konuşuyorum* der. `domain` içermeyen devredilmiş bir belge reddedilir: yokluk asla onay sayılmaz; kimsenin başkasının akışına kayıt yönlendirememesinin nedeni de budur.',
			],
			caption: 'spec/fixtures/v1/examples/prodid.delegated.json dosyasından. 1. yoldan tek farkı domain alanı ve burada zorunlu.',
			window:
				'Barındırılan yayıncı `domain`’i belgeye ancak TXT kaydını kendisi gördükten sonra yazar; böylece bir belgenin, bunu istememiş bir alan adını sahiplendiği bir an olmaz.',
		},
		hosted: {
			eyebrow: '3. yol',
			heading: 'Alan adı olmadan yayınla',
			lead: 'Hiç alan adı olmayan bir üretici, kendi adıyla, barındırılan bir slug’da yayın yapar: `<slug>.prodid.org`. [publish.prodid.org](https://publish.prodid.org/)’dan bir tane al. Kaynak kimliği slug host’udur ve güven seviyesi `unverified`, çünkü bir alan adıyla ilgili hiçbir şey kanıtlanmamıştır. Kayıtlar gerçek kayıtlardır: tanımlayıcılar, çözümleme, kaynak gösterme.',
			merchant:
				'Bu durumdaki yayıncıların çoğunun zaten bir [Google Merchant](https://support.google.com/merchants/answer/7052112) ürün dosyası vardır; bu yüzden böyle bir dosyadan `org.prodid.item` kayıtlarına eşleme şartnamede sütun sütun yazılıdır; bilerek bıraktıklarıyla birlikte: fiyat, stok, kargo ve durum, ürüne değil, belirli bir günde bir satıcıya aittir. Dışa aktarmadan önce [Merchant akışını içe aktarma](/spec#appendix-importing-a-merchant-feed) bölümünü okumaya değer: publish.prodid.org yüklediğin CSV ya da TSV’yi tam olarak bu eşlemeyle dönüştürür. İçindeki dört şey tablonun nasıl görünmesi gerektiğini belirler:',
			rules: [
				'**Dört sütun varyant ekseni olur**: `color`, `size`, `material` ve `pattern`; alıcının tek bir `item_group_id` içinde aralarından seçtikleri. `gender`, `age_group`, `size_type` ve `size_system` sıradan özellik olarak kalır: tüm grubu tanımlarlar ve eksen olsalar, biri onlardan birini iki farklı şekilde yazdığı anda tek ürünü birkaç ürüne bölerlerdi.',
				'**Tekrarlanan bir öznitelik hücre başına değil dosya başına ya virgülle ayrılır ya da başlık tekrarlanır.** Bir hücre, başlığı tüm dosyada yalnızca bir kez geçiyorsa virgüllerden bölünür; başlığı tekrarlarsan altındaki her hücre bütün olarak alınır. İçinde virgül olan bir değeri taşımanın tek yolu budur ve dosya için bir kez verdiğin bir karardır. `additional_image_link`, `product_type`, `product_highlight`, `product_detail` ve `certification` için geçerlidir; virgülle dolu bir `description` dahil geri kalan her şey her iki durumda da bütün olarak alınır.',
				'**Bir `product_detail` hiçbir şeyin üzerine yazmaz.** Ortadaki alt özniteliği özellik anahtarı olur, bölüm adı atılır ve bir anahtar için ilk değer kazanır. Aynı anahtarlı sonraki bir detail ya da eşlemenin zaten ürettiği bir anahtara denk gelen biri atılır ve satırıyla raporlanır; böylece bir detail sütunu satırın geri kalanının söylediğini asla sessizce yeniden tanımlayamaz.',
				'**Bir medya lisansı beyan edilmelidir.** Merchant biçiminde bunun için bir sütun yok ve [lisanssız hiçbir şey alınmaz](/spec#licences-that-can-be-ingested); bu yüzden bir içe aktarma, dosyadaki her görseli ve belgeyi kapsayan tek bir alınabilir SPDX tanımlayıcısı beyan eder. Kendi `license` sütunun bunu satır satır geçersiz kılar; beyan edilen lisansı alınabilir olmayan bir dosya da başarısız kayıtlar değil, medyasız kayıtlar üretir.',
			],
			skipped:
				'Kayda dönüşemeyen bir satır (kullanılabilir tanımlayıcısı olmayan, kontrol hanesi tutmayan GTIN’li) atlanır ve tablo satır numarasıyla raporlanır; başlık 1. satır sayılır. Yani bozuk bir satır içe aktarmanın tamamına değil yalnızca kendisine mal olur. Kendini karşılaştırabileceğin hazır bir örnek [`/spec/fixtures/merchant`](/spec/fixtures/merchant) altında: bir CSV, üretmesi gereken kayıtlar ve atlanması gereken satır.',
			later:
				'Bugün verilen bir karar için önemli olan kısım, sonra ne olacağıdır. Edindiğin bir alan adına aynı host’u gösteren bir TXT kaydı eklemek, bir sonraki taramada slug’ı alan adına çevirir: **aynı kaynak, aynı kayıtlar, her `opid` korunur**; güven de `unverified`’dan `verified`’a yükselir. `sku` tanımlayıcıların kaynağın adına değil kaynağın kendisine bağlıdır; bu yüzden taşınmadan etkilenmez. publish.prodid.org’da bu, 2. yolun kullandığı aynı domain alanıdır.',
		},
		trust: {
			heading: 'Burada güven ne demek',
			lead: 'Güven bir iddianın değil kaynağın özelliğidir. Kimin konuştuğuna dair neyin kanıtlandığını söyler; belirli bir bilginin doğru olup olmadığı hakkında hiçbir şey söylemez. Bununla ne yapacağına veriyi kullanan karar verir.',
			table: 'Güven seviyeleri',
			level: 'Seviye',
			meaning: 'Anlamı',
			levels: [
				'Alan adı kontrolü kanıtlanmış ve markanın sahipliği teyit edilmiş.',
				'Alan adı kontrolü TXT kaydıyla ya da belgeyi alan adının kendisi sunarak kanıtlanmış.',
				'Alan adı olmayan barındırılan bir slug, bir veri seti aktarımı ya da bir topluluk katkısı.',
			],
			only: 'Yalnızca kimliği bir alan adı olan kaynak `unverified`’dan fazlası olabilir. `verified` taramadan gelir. `authoritative` gelmez, çünkü hiçbir tarama bir markanın sahibini kanıtlayamaz: onu dizinin işletmecisi verir ve yalnızca kanıta dayanarak.',
			rules: [
				{
					title: 'Kanıt, GS1 firma önekindir.',
					body: 'Kaynağının marka altında yayımladığı GTIN’lerin GS1 firma öneki, GS1’in herkese açık “Verified by GS1” sorgusunun gösterdiği gibi, alan adını kontrol eden kuruluşa lisanslı olmalıdır. Bu sorgunun URL’si kanıt olarak yetkiyle birlikte saklanır.',
				},
				{
					title: 'Bir yetki tek bir markayı adlandırır ve her biri geri alınabilir.',
					body: 'Marka [normalleştirilmiş](/spec#brand-normalization) haliyle kaydedilir. Bir kaynak birkaç marka için yetki taşıyabilir; işletmeci her birini ayrı ayrı geri alır.',
				},
				{
					title: 'Bir yetki, altındaki kanıttan uzun yaşamaz.',
					body: 'Kaynağın tam olarak şu üçü sağlandığı sürece `authoritative`’dir: alan adının kontrolü kanıtlı, kaynak [lapsed](/spec#lapse) değil ve geri alınmamış en az bir yetkisi var. Alan adı kanıtını kaybedersen ya da lapse olursan, kimse bir şey yapmadan hemen kalan kanıtın desteklediği seviyeye düşer: lapsed iken `verified`, alan adı kanıtı da gittiyse daha aşağı. Üçü yeniden sağlandığı anda tekrar `authoritative` olur.',
				},
				{
					title: 'Markayı değil kaynağı kapsar.',
					body: 'Güven kaynağın özelliği olarak kalır: tek bir marka için verilen yetki, kaynağının yaptığı her iddiayı `authoritative` yapar; yetkisi olmayan markalarla ilgili iddialar dahil.',
				},
			],
			ask: `Bunu istemek için önce kendi alan adında yayın yap, sonra alan adını, markayı ve GTIN’lerinden biri için bir Verified by GS1 sorgusunu belirterek [istek formuyla başvur](${CONTACT.authoritative}). İşletmeci, kaynağının o marka altında yayımladığı GTIN’leri Verified by GS1’de denetler. Başvuru herkese açıktır.`,
		},
		after: {
			heading: 'Yayınladıktan sonra',
			edit: {
				title: 'Bir kaydı değiştirmek bir satırı düzenlemektir.',
				body: 'Zaten var olan bir key ile kayıt yayınlamak öncekinin yerine geçer. Ayrı bir güncelleme uç noktası yok, çünkü durum akışın kendisidir.',
			},
			remove: {
				title: 'Bir satırı silmek ürünü değil, iddialarını geri çeker.',
				body: 'Tarayıcının bütünüyle aldığı bir akıştan kaybolan key, onunla ilgili iddialarını geri çekilmiş olarak işaretler. Varlık ve tanımlayıcısı kalır: başkalarının ona verdiği bağlantılar çalışmaya devam eder, diğer kaynakların iddiaları da.',
			},
			retire: {
				title: 'Bir akış URL’sini belgeden çıkarmak onu hemen emekliye ayırır.',
				body: 'Bir tarama, akış URL’lerinden birini artık göstermeyen bir belge okuduğunda, o akışın taşıdığı her canlı kayıt, sanki tüm key’leri kaybolmuş gibi hemen geri çekilir ve URL bir daha alınmaz. Aşağıdaki yedi günlük tolerans burada geçerli değil: bir URL’yi çıkarmak dosyanın gittiğini söylemektir ve dizin sözüne güvenir. Sonra yeniden listelemek onu geri getirir, sıfırdan okunarak. Yapabiliyorsan belgeyi bir `ETag` ile sun: `304`, listenin değişmediği anlamına gelir; dolayısıyla hiçbir şeyi emekliye ayırmaz.',
			},
			broken: {
				title: 'Bozuk bir satır geri çekmeyi yedi gün geciktirir; devre dışı bırakmaz.',
				body: '64 KiB’tan büyük, ayrıştırılamayan ya da geçersiz bir satır atlanır ve sayılır. Atlanan satırın key’i bilinmediği için, atlanmış satırı olan bir akış yedi gün boyunca hiçbir şeyi geri çekmez. Sonrasında eksik key’ler her zamanki gibi geri çekilir. Sayı herkese açıktır; yani sessizce satır kaybeden bir akış sessiz kalmaz.',
			},
			unreadable: {
				title: 'Tarayıcının okuyamadığı bir akış bedava değildir.',
				body: 'Bir tarama ancak *belgenin listelediği her şey* okunduğunda başarılı olur: kabul edilebilir bir belge ve içindeki her akışın `200` ya da `304` ile yanıt vermesi. Bir akışın zaman aşımına uğraması diğerlerini kaybettirmez (yanıt veren akışlar alınır ve başarısız taramada hiçbir şey geri çekilmez) ama tarama bir iletim hatası sayılır ve durumundaki `feeds_failed` bunu gösterir. Dolayısıyla tamamen sağlıklı bir belge, önünde kalıcı olarak ölü tek bir akış URL’si varken, yanıt vermeyi tamamen bırakmış bir alan adıyla aynı yedi günlük saatle lapse olur ve bundan otuz gün sonra kataloğu kaybeder. Artık sunmadığın bir akış URL’sini çürümeye bırakma, belgeden çıkar.',
			},
			lapse: {
				title: 'Keşif başarılı olmayı bırakırsa kaynağın lapse olur.',
				body: [
					'**Kesin olumsuz**, yani keşfin kabul edilebilir bir belge olmadan bitmesi (ne kayıt ne belge; bozuk, fazla uzun ya da tekrarlı bir kayıt; ya da 200 olmayan, JSON olmayan, geçersiz, `domain` konusunda artık uyuşmayan ya da host’u dışında bir akış listeleyen bir belge) kaynağı hemen lapse eder. **İletim hatası** (DNS zaman aşımı, 5xx, 429, aşılan bir sınır; belgede ya da herhangi bir akışta) tek başına hiçbir şeyi değiştirmez; ama her denemenin böyle bittiği art arda yedi gün seni de lapse eder. Yani sonsuza dek hata döndürmek, iddialarını oldukları yerde sabitlemenin bir yolu değildir.',
					'**Bu şüphe payı sana değil, bir host’a aittir.** Yalnızca kaynağının daha önce doğrulandığı bir host’ta geçerlidir. Hiç doğrulanmadığı bir host’ta (yeni bir slug, `_prodid`’i az önce yönlendirdiğin bir host, 2. ve 3. yoldaki her şey) zaman aşımı ve 5xx dahil her hata kesin olumsuzdur ve seni hemen lapse eder. Bu bilinçli bir tercih: aksi halde doğrulanmış bir kaynak kaydını kontrol etmediği bir host’a yöneltip, lapse’in bugün mü yoksa bir hafta sonra mı başladığından o host’un ayakta olup olmadığını okuyabilirdi. Host değiştirmek bu yüzden sana hiçbir şeye mal olmaz. Yeni host’taki ilk başarılı tarama her şeyi temizler ve bir lapse, hiçbir şey geri çekilmeden önceki 30 gün boyunca geri alınabilir kalır.',
					'Lapsed bir kaynak yeni iddia almaz, okuyuculara lapsed olarak gösterilir ve `publisher.contact` adresine bildirim gider. Lapsed bir kaynağın taraması, tamamen başarılı olana kadar hiçbir şey yazmaz; lapse ancak o zaman kalkar. Kesintisiz 30 günlük lapse’ten sonra **kayıtların ve etkin iddiaları birlikte geri çekilir** ve geçmiş olarak kalır. O 30 gün senin kurtarma pencerendir; iletişim adresinin birinin okuduğu bir adres olması gerekmesinin nedeni de bu.',
					'Geri dönmek hiçbir şeyi değiştirmeyi gerektirmez. Her zamanki belgeyi ve akışı sun; keşif başarılı olduğu anda yayımladığın her şey, tek bir bayt değişmiş olsun ya da olmasın, yeniden ileri sürülür. Senden canlı hiçbir şey tutmadığı sürece dizin koşullu istekleri bırakır; yani değişmemiş bir dosya asla geri çekilmiş kalmak için bir neden olmaz.',
				],
			},
			seen: {
				title: '`seen_at` kesintisiz bir beyandır ve uzun bir lapse onu sıfırlar.',
				body: 'Okuyucunun gördüğü her iddia `seen_at` taşır: bilginin herhangi bir yerde ilk yayımlandığı an değil, *bu kaynağın bu değeri kesintisiz olarak ne zamandan beri ileri sürdüğü*. Aynı değeri bulan her yeniden taramadan sağ çıkar; amacı da budur. Bir geri çekilmeden sağ çıkmaz. Kaynağın 30 günden uzun lapsed kalırsa, yayımladığın her bilginin tarihi geri döndüğün günden yeniden başlar; çünkü aradaki süre boyunca doğrulanabilir hiç kimse onları üstlenmedi. Geri çekilen satırlar kalır; böylece `?history=1` boşluğu gizlemek yerine gösterir. [Okuyucunun ne gördüğü](/spec#an-entity) şartnamede.',
			},
			status: {
				title: 'Kaynağının herkese açık bir durum adresi var.',
				body: '`/source/acme.example` bir şeylerin yanlış gittiğini görmenin yoludur: son taramanın sonucu, keşfin hangi yolu izlediği, kaç kaydın değiştiği, kaç satırın atlandığı, kaç akışın okunamadığı ve lapsed olup olmadığın, olduysan ne zamandan beri. Yalnızca alan adının ne yayımladığını ve dizinin ne zaman baktığını bildirir; bir taramayı kimin istediğini asla.',
			},
			media: {
				title: 'Medyaya güvenilmez, içeriğine bakılır; bozuk bir girdi yalnızca kendisine mal olur.',
				sniffed:
					'Tür baytlar okunarak belirlenir; `Content-Type`’ın yalnızca bir ipucu. Altı tür saklanır, başka hiçbir şey değil: `image` olarak JPEG, PNG, GIF, WebP ve AVIF; `document` olarak PDF. SVG yok, HTML yok, arşiv yok, Office dosyası yok; teknik föy PDF olarak gider. Algılanan tür ile girdinin `kind`’ı uyuşmalı, yoksa girdi atlanır.',
				table: 'Medya sınırları',
				what: 'Ne',
				cap: 'Sınır',
				caps: ['Tek bir görsel', 'Tek bir belge', 'Tek bir medya indirmesi', 'Bir kayıttaki medya girdileri'],
				licence:
					'Lisans, herhangi bir şey indirilmeden önce metin olarak denetlenir ve tam olarak yedi SPDX tanımlayıcısından biri olmalıdır; dosyayı herkesin olduğu gibi yeniden dağıtmasına izin verenler, ki dizin de onunla bunu yapar:',
				licences: 'alınabilir medya lisansları',
				entry:
					'Buradaki her şey girdi başınadır. Reddedilen, fazla büyük ya da erişilemeyen bir girdi yalnızca o girdiye mal olur: **kaydın medyası yüzünden asla geçersiz olmaz**, diğer iddiaları geçerli kalır ve hiçbir medya hatası seni lapse etmez. `media_failed` içinde sayılır ve o kaydın bir sonraki taramasında yeniden denenir. Bir şey akışların tersine işler: aynı host kuralı burada *geçerli değildir*; yani görsellerin bir CDN’de durabilir. Gerekçeler [Neler alınır](/spec#what-is-ingested) ve [lisans listesi](/spec#licences-that-can-be-ingested) bölümlerinde.',
			},
			others: {
				title: 'Başka kaynaklar da senin ürünlerin hakkında yayın yapacak.',
				body: 'Perakendeciler, sicil kurumları, açık veri setleri ve katkıda bulunanlar diğerleri gibi birer kaynaktır. İddiaları onlara atfedilir ve seninkilerin üzerine asla yazmaz; anlaşamadığınız yerde iki iddia da kaynaklarıyla yan yana görünür.',
			},
		},
		checklist: {
			heading: 'Yayına girmeden önce',
			items: [
				'Keşif HTTP 200, JSON içerik türü ve akış şemasına göre doğrulanan bir gövdeyle yanıt veriyor; 200 ile sunulan bir HTML “bulunamadı” yanıtı ile değil.',
				'_prodid.<alan adın> adresinde tam olarak bir v=prodid0 TXT kaydı var. İki tane hatadır, bozuk bir tane de hatadır.',
				'O kayıt v=prodid0; host=<hostname> biçiminde. URL değil host: şema yok, port yok, yol yok.',
				'feeds içindeki her URL https ve onu listeleyen keşif belgesiyle aynı host’ta.',
				'feeds içindeki her URL hâlâ sunduğun bir URL. Alınamayan bir akış tüm taramayı başarısız yapar ve yedi gün böyle giderse kaynak lapse olur.',
				'Devredilmiş bir belge, adına konuştuğu alan adına eşit bir "domain" taşıyor.',
				'Keşif belgesi application/json olarak sunuluyor ve başka bir host’a yönlenmiyor.',
				'Akışlar ve belgeler ETag ya da Last-Modified gönderiyor; böylece değişmemiş bir dosya yalnızca bir 304’e mal oluyor.',
				'Her akış satırı 64 KiB’ın altında tam bir JSON nesnesi; UTF-8, yeni satırla ayrılmış, dizi sarmalayıcısı yok, sonda virgül yok.',
				'Her key kalıcı ve asla farklı bir ürün için yeniden kullanılmıyor.',
				'Her gtin yalnızca rakamlardan oluşuyor, kontrol hanesi doğru ve tümü sıfır değil.',
				'Her tanımlayıcı değeri kırpılmış (başında ya da sonunda boşluk yok) ve her kayıt dizinin saklayabileceği en az bir tanımlayıcı tutuyor; bu da mpn için bir brand gerektiği anlamına gelir.',
				'Her medya girdisinin gerçek baytlarıyla uyuşan bir kind’ı ve yedi alınabilir SPDX lisansından biri var; yoksa o girdi atlanır.',
				'Hiçbir kayıt opid içermiyor. Onları dizin atar.',
				'publisher.contact birinin okuduğu bir adres.',
			],
			check: 'Ping atmadan önce dosyalarını denetle',
			checkLead:
				'`prodid-batch check`, keşif belgeni ve her akışı tam olarak dizinin yapacağı gibi doğrular; token olmadan ve dizine hiçbir şey sormadan. [Bun](https://bun.sh) 1.4.4 ile deponun bir kopyasından çalışır. Dosyaların kendisini ver: `.json` ile biten bir yol tek bir belge, diğer her yol bir NDJSON akışı olarak okunur.',
			checkLabel: 'sunduğunu, dizinin yapacağı gibi doğrula',
			checkResult:
				'Sorunsuz bir dosya `ok` ve dizinin ondan alacağı kayıt sayısını yazar. Aksi halde her sorun için, bulunduğu akış satırıyla birlikte `items.ndjson:12: message` biçiminde bir satır yazar ve sıfır olmayan bir kodla çıkar. DNS’ini ya da sunucunu değil dosyaları okur; yani yukarıdaki listedeki TXT kaydı, içerik türü ve önbellek başlıkları yine senin denetlemen gereken şeyler.',
			rules:
				'Bir kaydın doğrulandığı kurallar [şartnamede](/spec), şemalar [`/spec/schemas/v1`](/spec/schemas/v1) adresinde; [`/spec/fixtures/v1`](/spec/fixtures/v1) ise biri taramadan önce dışa aktarıcını karşısında çalıştırabileceğin, makinenin okuyabildiği vektörleri tutar.',
			status: 'Durum:',
			formats: 'Burada anlatılan dosya biçimleri, ping attığında dizinin okuduğu biçimlerdir.',
		},
	},

	data: {
		title: 'Açık veri — prodid',
		description:
			'prodid dizininin tamamını indir: her kaynağın, varlığın, kaydın, gruplamanın ve birleştirmenin gece alınan gzip NDJSON dökümü; dizinin ürettikleri CC0, iddialar her kaynağın kendi lisansıyla.',
		eyebrow: 'Açık veri',
		heading: 'Dizini indir',
		lead: 'Dizin değiştirilebilir. Bildiği ve bir okuyucunun bilebileceği her şey tam bir dışa aktarım, yani döküm olarak yayımlanır; herkes indirip kendi dizinine yükleyebilir.',
		latest: {
			heading: 'En son döküm',
			before: 'Bu site derlendiğinde en yeni döküm, şu anda alınan anlık görüntüydü:',
			after: '. Her gece 04:30 UTC’de yenisi yazılır ve',
			names: 'her zaman en yenisini gösterir.',
			lines: (count: string) => `${count} satır`,
			per: (what: string) => `Her ${what} için bir satır.`,
			directory: (directory: string, manifest: string, created: string, index: string, claims: string) =>
				`Bu dökümün dizini \`${directory}\`, manifesti ${created} tarihinde yazılmış [\`manifest.json\`](${manifest}). Lisansları \`index: ${index}\` ve \`claims: ${claims}\` olarak okunur.`,
		},
		holds: {
			'sources.ndjson.gz': { per: 'kaynak', line: 'Kaynağın durumu; tam olarak /source/{name} nasıl yanıtlıyorsa öyle.' },
			'entities.ndjson.gz': {
				per: 'varlık (birleştirilenler dahil)',
				line: 'Varlık belgesi; tam olarak /id/{opid}?history=1 nasıl yanıtlıyorsa öyle, geri çekilen iddialar dahil.',
			},
			'records.ndjson.gz': {
				per: 'kayıt (geri çekilenler dahil)',
				line: 'source, key, feed, opid, body, first_seen, last_seen, withdrawn_at.',
			},
			'groupings.ndjson.gz': { per: 'gruplama', line: 'source, kind, key, opid.' },
			'merges.ndjson.gz': { per: 'birleştirme (geri alınanlar dahil)', line: 'from, into, decided_at, reverted_at.' },
		},
		layout: {
			heading: 'Dökümler nerede tutulur',
			lead: 'Bir döküm, yazıldığı sürümün altında, anlık görüntüsünün UTC tarihiyle adlandırılmış bir dizindir. `v1/`, manifesti ile kaynak ve varlık satırları v1 belgesi olan v1 dökümlerini tutar. İçinde beş veri dosyası ve bir manifest bulunur.',
			last: '**latest.json en son yazılır.** En yeni dökümün `manifest.json` dosyasının bir kopyasıdır; o dökümün her dosyası ve manifesti yerine oturduktan sonra yazılır. Ondan başlayan bir okuyucu, henüz orada olmayan bir dosyayı gösteren bir manifestle asla karşılaşmaz ve dizini manifestin kendi `snapshot_at` değerinden bulur.',
			retention:
				'**Saklama.** Günlük bir döküm 7 gün tutulur. Her UTC ayının ilk dökümü kalıcı olarak tutulur. Tutulan bir döküm asla yeniden yazılmaz: dizini, dosyaları ve manifesti bayt bayt olduğu gibi kalır.',
			v0: (dumps: string, latest: string) =>
				`**v0 dökümleri.** v1’den önce yazılan v0 dökümleri aynı saklama kuralıyla \`${dumps}\` altında kalır ve [\`v0/latest.json\`](${latest}) bunların sonuncusunu göstermeye devam eder. v0 şemalarına göre kalıcı olarak doğrulanırlar.`,
			manifest: (schema: string) =>
				`**Manifest.** Beş dosyanın her birini tam olarak bir kez adlandırır; dosyanın sunulduğu haliyle, sıkıştırılmış SHA-256’sı ve boyutuyla ve açıldığındaki satır sayısıyla. Yüklemeden önce her dosyayı özetine göre denetle. Şema [\`${schema}\`](${schema}); vektörler [\`/spec/fixtures/v1/dump\`](/spec/fixtures/v1/dump) altında.`,
		},
		files: {
			heading: 'Her dosya ne tutar',
			lead: 'Her dosya gzip ile sıkıştırılmış NDJSON’dır, her satırda bir JSON nesnesi. Beşi de tutarlı tek bir anlık görüntüden okunur; bu yüzden birbirleriyle uyuşurlar: bir satırın adlandırdığı her kaynağın `sources.ndjson.gz` içinde kendi satırı, adlandırdığı her `opid`’in de `entities.ndjson.gz` içinde kendi satırı vardır.',
			table: 'Döküm dosyaları',
			columns: ['Dosya', 'Satır başına', 'Satır'],
			merged: 'Birleştirilmiş varlıklar',
			mergedBody:
				'Birleştirilmiş bir `opid` çözücüde `308` döner; bu yüzden kopyalanacak kendi belgesi yoktur. Satırı, birleştirilmemiş olsaydı döneceği belgedir (kendi tanımlayıcıları ve iddiaları üzerinde kalır; birleştirmeyi geri alınabilir yapan da budur) ve bir üyesi daha vardır: `merged_into`, yani hayatta kalanın `opid`’i. Birleştirmeler zincirlenmez: hayatta kalan hiçbir zaman kendisi birleştirilmiş değildir.',
			record: 'Bir kayıt satırı',
			recordLead: 'Dizinin tuttuğu haliyle tek bir kayıt. Her zaman UTC, ISO 8601.',
			recordTable: 'Kayıt satırı alanları',
			recordColumns: ['Alan', 'Ne olduğu'],
			recordFields: [
				'Kaynağın adı.',
				'Kaydın o kaynaktaki key’i.',
				'Okunduğu akışın URL’si. Bir veri seti aktarımının yazdığı kayıtta yoktur.',
				'Çözüldüğü ürün birimi.',
				'Yayıncının gönderdiği org.prodid.item, değiştirilmeden.',
				'Dizinin onu ilk okuduğu an.',
				'Dizinin onu son okuduğu an.',
				'Yalnızca kayıt geri çekildiğinde bulunur.',
			],
			grouping: 'Bir gruplama satırı',
			groupingLead:
				'Bir kaynağın gruplamasının hangi varlığa çözüldüğü. `kind`, `family` ya da `variant`’tır; `key` ise kaynağın kayıtlarının neye göre gruplandığıdır. Özetlenmeden açıkça yazılır; böylece başka bir uygulama kendi gruplamasını onunla eşleştirebilir.',
			groupingNotes: [
				'bir yayıncı grubu için; grubu olmayan, kendi başına bir aile olan kayıt için { "key": "<key>" }.',
				'kaydın varyantı; yoksa {}.',
			],
			familyKey: '{ "family": <ailenin key’i>, "variant": { <eksen>: <değer>, … } }',
			merge: 'Bir birleştirme satırı',
			mergeBody:
				'Tek bir birleştirme kararı: `from` birleştirilen `opid`, `into` hayatta kalan, `decided_at` kararın verildiği an ve `reverted_at`, yalnızca geri alındıysa bulunur.',
		},
		never: {
			heading: 'Bir dökümün asla tutmadıkları',
			lead: 'Bir döküm, çözücünün zaten söylediğinden fazlasını söylemez; artı yanıtlarının kurulduğu kayıtlar, gruplamalar ve birleştirmeler.',
			items: [
				'Dizinin yalnızca lapse bildirimini göndermek için tuttuğu yayıncı iletişim adresi.',
				'Tarama günlüğü, tarayıcının hata metni ya da bir taramayla ilgili kaynak durumunun göstermediği başka herhangi bir şey.',
				'Bir birleştirmenin neden yapıldığı ya da kimin karar verdiği.',
				'Bir medya özetinin neden engellendiği.',
				'Medya baytları. Bir medya iddiasının media_url’i dosyayı gösterir ve engellenmiş bir özet sunulmaz.',
				'Dizinin iç satır tanımlayıcıları. Her satır bir kaynağı adıyla, bir varlığı opid’iyle anar.',
				'Yetki kararları ve kanıtları. Bir kaynağın satırı snapshot_at anında authoritative idiyse bunu söyler; ama dökümden yüklenen bir dizin, kendi işletmecisi bir yetki verene kadar hiçbir yetki tutmaz.',
			],
		},
		licences: {
			heading: 'Lisanslar',
			lead: 'İki kural var ve manifestin `licenses` alanı ikisini de belirtir.',
			index: 'Dizinin ürettiği her şey',
			indexBody: '`opid`’ler, tanımlayıcı eşlemeleri, aile ve varyant hiyerarşisi, gruplamalar ve birleştirmeler.',
			claims: 'Her iddia ve her kayıt',
			claimsBody:
				'Kendi kaynağının beyan ettiği lisans altında: o kaynağın `sources.ndjson.gz` içindeki satırının `license` değeri. Lisans beyan etmeyen bir kaynak hiçbir hak vermemiştir ve prodid onun adına hiçbir hak vermez.',
			datasets:
				'Kendine ait keşif belgesi yayımlamayan açık bir veri seti, dizine `dataset:<slug>` adlı bir kaynak olarak girer; dizinin işletmecisi onu veri setinin herkese açık dışa aktarımından içe aktarır. Böyle bir kaynak her zaman `unverified`’dır ve `license` değeri veri setinin kendi lisansıdır. Kurallar [şartnamede](/spec#dataset-sources).',
		},
		load: {
			heading: 'Kendi dizinine yükle',
			lead: '`prodid-batch load-dump`, bir v0 ya da v1 dökümünü aynı sürüme taşınmış boş bir PostgreSQL 18 veritabanına tek bir transaction içinde yükler. Bir dökümün tarihli dizinini, `manifest.json` dosyasını ya da bir `latest.json` alır; yerelden ya da HTTPS üzerinden.',
			label: 'deponun bir kopyasından',
			checked:
				'Herhangi bir şey yazılmadan önce her dosya manifestteki `sha256`, `bytes` ve `lines` değerlerine göre denetlenir; uzak bir döküm önce geçici bir dizine indirilir. Boş olmayan bir veritabanı reddedilir. `PRODID_OPERATOR`, yüklenen birleştirmelerin karar vericisi olarak kaydedilir.',
			peek: 'Bir dosyayı yüklemeden okumak için özetine göre denetle ve aç. Aşağıdaki özet, bu site derlendiğinde en son manifestte yazan özettir.',
			rules: 'Kuralların tamamı şartnamede, [Dumps](/spec#dumps) başlığı altında.',
		},
	},
}
