import type { Copy } from '@/i18n/copy'
import { CONTACT } from '@/lib/spec'

export const pt: Copy = {
	common: {
		skip: 'Pular para o conteúdo',
		home: 'prodid, início',
		primary: 'Navegação principal',
		nav: {
			spec: 'Especificação',
			specShort: 'Espec.',
			publish: 'Publicar',
			publishShort: 'Publicar',
			data: 'Dados',
			dataShort: 'Dados',
			menu: 'Menu',
		},
		toDark: 'Mudar para o tema escuro',
		toLight: 'Mudar para o tema claro',
		language: 'Idioma',
		status:
			'Spec v1. O índice e o publicador hospedado rodam em prodid.org. Qualquer pessoa pode publicar, no próprio domínio ou hospedado.',
		normative: 'A especificação é publicada apenas em inglês, e o texto em inglês é o normativo.',
		imageAlt:
			'prodid: publicadores declaram dados de produto nos próprios domínios, um índice aberto liga cada código a um identificador permanente e qualquer pessoa pode baixar o índice inteiro.',
		support: {
			label: 'Apoie o prodid',
			heading: 'O prodid é código aberto. Ajude-o a crescer.',
			body: 'Dê uma estrela ao repositório para que outros o encontrem, conte o que está errado, envie uma correção ou escreva para nós aqui, sem conta no GitHub.',
			star: 'Dar uma estrela no GitHub',
			stars: (count: string) => `${count} estrelas`,
			contribute: 'Contribuir',
			chat: 'Fale conosco',
		},
		footer: {
			tagline: 'Uma camada aberta de identidade e dados para cada produto físico.',
			label: 'Rodapé',
			site: 'Site',
			specification: 'Especificação',
			publish: 'Publique seus produtos',
			github: 'Código-fonte no GitHub',
			contact: 'Contato',
			report: 'Relatar um problema',
			security: 'Segurança',
			licence:
				'A especificação e os schemas são CC0, assim como os `opid` e os mapeamentos de identificadores que o prodid.org publica. Toda outra afirmação carrega a licença da fonte que a fez. A implementação de referência é Apache-2.0.',
		},
	},

	home: {
		title: 'prodid — identidade aberta para cada produto físico',
		description:
			'O prodid dá a cada produto físico um identificador aberto e permanente. GTIN, MPN e qualquer outro código resolvem para ele, e cada informação é uma afirmação atribuída à sua fonte.',
		badge: 'Spec v1 · no ar',
		headline: 'Código de barras não é produto.',
		headlineAccent: 'prodid é.',
		lead: 'Um identificador aberto e permanente para cada produto físico. Todo código de barras e número de peça resolve para ele, e cada informação sobre ele indica a fonte que a disse.',
		ctaPublish: 'Publique seus produtos',
		ctaSpec: 'Ler a especificação',
		resolve: {
			label: 'Experimente: resolva um código de uma etiqueta',
			button: 'Resolver',
			hint: 'Digite um código de 8 a 14 dígitos.',
		},
		close: {
			heading: 'Dê aos seus produtos uma identidade que sobreviva ao código de barras.',
			body: 'Dois arquivos e um registro DNS no seu próprio domínio, ou um site hospedado sem domínio nenhum.',
		},
		heroKind: (brand: string) => `Item · ${brand}`,
		heroVariant: (markets: string) => `azul-marinho · M · vendido em ${markets}`,
		heroLapsed: (source: string) => `lapsed · ${source}`,
		heroCaption: 'O que o escaneamento do código da etiqueta retorna. O registro é o próprio exemplo da especificação.',
		sceneLabel:
			'Publicadores nos próprios domínios, publicadores hospedados e conjuntos de dados abertos enviam afirmações a um índice aberto, que resolve o código de um produto e publica o índice inteiro como dumps.',
		sceneCaption:
			'Publicadores declaram informações nos próprios domínios, hospedados ou a partir de conjuntos de dados abertos. O índice liga cada código da etiqueta a um opid permanente, e o índice inteiro está aberto para download.',
		problem: {
			eyebrow: 'O problema',
			heading: 'Quatro códigos, uma jaqueta e nada ligando um ao outro.',
			body: 'Um produto ganha um código de barras novo a cada mercado, tamanho de embalagem e mudança de embalagem, e os dados dele ficam num sistema diferente para cada um. Quando dois discordam, um é sobrescrito sem aviso.',
			answer: 'O prodid dá ao próprio produto um identificador que não muda quando o código de barras muda.',
			figure: 'Vários códigos resolvendo para uma variante',
			anotherGtin: 'outro GTIN',
			codes: [
				'unidade de venda para DE e TR',
				'a mesma jaqueta em kit com duas',
				'a embalagem do ano que vem',
				'número de peça do fabricante',
			],
			variant: 'Uma variante',
			variantNote: 'Nunca reutilizado, nunca apagado. Todo código que já apontou para cá continua funcionando.',
		},
		model: {
			eyebrow: 'O modelo',
			heading: 'Família, variante, item. Códigos apontam para eles; não são eles.',
			lead: 'Cada nível tem o seu `opid`: 16 caracteres que não codificam nada, então nada no produto pode torná-los errados.',
			levels: [
				{ title: 'Acme Trail Jacket', note: 'O produto como as pessoas falam dele.' },
				{ title: 'azul-marinho · tamanho M', note: 'Uma combinação de cor, tamanho e afins.' },
				{ title: 'Unidade de venda para DE e TR', note: 'A coisa que leva um código de barras.' },
			],
			after:
				'Uma embalagem nova adiciona um item novo com um código novo, sob a mesma variante e a mesma família. Nada que apontava para o antigo quebra.',
		},
		how: {
			start: 'Começar a publicar',
			eyebrow: 'Como funciona',
			heading: 'Publique no seu domínio. O prodid indexa. Qualquer um resolve.',
			publish: {
				step: '01 · Publicar',
				title: 'Três coisas no seu domínio',
				body: 'Um documento de descoberta, um feed com um produto por linha e um registro DNS que prova que o domínio é seu.',
				link: 'Como publicar →',
			},
			index: {
				step: '02 · Indexar',
				title: 'Verificado, correspondido, atribuído',
				checks: [
					'cada linha validada contra o schema',
					'correspondida a um opid existente ou a um novo',
					'cada campo guardado como afirmação do seu domínio',
				],
				body: 'Varejistas, registros e conjuntos de dados abertos são fontes do mesmo jeito: ao lado do fabricante, nunca acima dele.',
				link: 'Como as afirmações funcionam →',
			},
			resolve: {
				step: '03 · Resolver',
				title: 'Uma URL, impressa no produto',
				browser: 'Navegador → uma página',
				api: 'API → o registro JSON',
				body: 'O caminho segue a sintaxe GS1 Digital Link, então pode ser o próprio QR code da etiqueta.',
				link: 'Como a resolução funciona →',
			},
		},
		claims: {
			eyebrow: 'Afirmações',
			heading: 'Cada informação diz sua fonte. A discordância continua visível.',
			lead: 'Nada é fundido numa única “verdade”. Quando uma fonte para de publicar, as afirmações dela são mantidas e marcadas como lapsed, não apagadas.',
			caption: 'As afirmações do item de exemplo da especificação',
			columns: ['Propriedade', 'Valor', 'Fonte', 'Confiança', 'Visto'],
			lapsed: ' · lapsed',
			trust: [
				'Controla o domínio e está confirmada como dona da marca.',
				'Provou o controle de um domínio por DNS ou pelo próprio site.',
				'Um nome hospedado sem domínio, um conjunto de dados ou uma contribuição.',
			],
			details: 'Ver a requisição e o registro JSON completo',
			request: 'Cabeçalhos de requisição e resposta',
		},
		who: {
			links: ['Publique no seu domínio', 'Escolha uma via', 'Obtenha os dados'],
			eyebrow: 'Para quem',
			heading: 'Para quem produz os dados e para quem precisa deles.',
			audiences: [
				{
					title: 'Fabricantes',
					body: 'Declare os dados dos seus produtos uma vez, no seu próprio domínio. Nenhum anúncio de revendedor ou marketplace é dono da descrição do que você fabrica.',
				},
				{
					title: 'Fornecedores de e-commerce, ERP e PIM',
					body: 'Um documento de descoberta e um feed por domínio de loja, gerados a partir de dados que você já tem.',
				},
				{
					title: 'Desenvolvedores',
					body: 'Resolva qualquer código para um identificador que sobrevive a uma nova embalagem. Cada informação diz quem a disse, quando e se essa fonte ainda a sustenta.',
				},
			],
			passport:
				'**Sobre o Passaporte Digital de Produto da UE.** O ESPR exige um passaporte acessível a partir de um portador de dados no produto, e o GS1 Digital Link é uma das sintaxes de portador em padronização para isso. O prodid não é um serviço de passaporte e publicar aqui não significa conformidade com nada; é a mesma base: um registro legível por máquina por produto, num endereço estável que você controla.',
		},
		status: {
			eyebrow: 'Status',
			heading: 'Onde isto realmente está.',
			stable: {
				label: 'Estável',
				title: 'Especificação v1.',
				body: `Só muda por adição; qualquer outra coisa seria v2. Um documento de descoberta v0 é aceito até 2027-01-26 00:00 UTC. [Leia](/spec) e [diga onde está errada](${CONTACT.issues}).`,
			},
			sources: {
				label: 'Canary e um conjunto de dados',
				title: 'Nenhum catálogo de publicador está indexado ainda.',
				body: 'O índice tem duas fontes: o canary do próprio projeto, [canary.prodid.org](https://prodid.org/source/canary.prodid.org), que prova publicação, rastreamento e resolução de ponta a ponta, e [dataset:wikidata](https://prodid.org/source/dataset:wikidata), uma importação de teste limitada a 5 itens do Wikidata, unverified e sob CC0-1.0.',
			},
			design: {
				label: 'Por projeto',
				title: 'O índice é substituível.',
				body: 'A especificação, os schemas, os opid e os mapeamentos de códigos são [CC0](/spec#licensing). Cada afirmação mantém a licença da sua fonte. As informações ficam nos domínios que as publicam, então qualquer pessoa pode rastreá-las de novo e os códigos impressos mantêm seu significado.',
			},
		},
	},

	publish: {
		title: 'Publique seus produtos — prodid',
		description:
			'Como um fabricante ou fornecedor de software publica dados de produto no prodid: o documento de descoberta, o feed NDJSON, o único registro DNS TXT que guarda a identidade e o ping.',
		eyebrow: 'Guia do publicador',
		heading: 'Publique seus produtos',
		lead: 'Publicar no prodid é colocar dois arquivos na web e um registro no DNS. No seu próprio domínio não há cadastro nem chave para guardar: o domínio é a credencial, e você altera ou retira o que publica alterando os arquivos.',
		discovery: {
			heading: 'Como o índice encontra você',
			lead: 'Vale saber antes de tudo, porque decide qual dos três caminhos abaixo é o seu. A descoberta começa do zero a cada rastreamento, primeiro pelo DNS, e nada do caminho até seus dados é lembrado entre rastreamentos.',
			first: 'Primeiro',
			firstTitle: 'Um registro DNS TXT em `_prodid.acme.example`',
			firstBody:
				'Se houver um registro `v=prodid0`, só ele é seguido, mesmo que nomeie o seu próprio domínio. O registro nomeia um *host*; o documento está sempre em `https://<host>/.well-known/prodid.json`.',
			second: 'Só se não houver esse registro',
			secondBody: 'O documento no próprio domínio. Quem serve o domínio por HTTPS fala por ele.',
			why: 'O DNS vem primeiro porque é a prova mais forte: quem consegue colocar um arquivo num host nem sempre é o dono do domínio, e o dono precisa poder passar por cima disso. É também por isso que vale escrever o registro mesmo quando você serve o arquivo; [caminho 1, passo 3](#own-domain) explica o que isso garante.',
			one: '**Exatamente um registro, e nada atrás dele.** Mais de um registro `v=prodid0` nesse nome é um erro, não uma escolha entre eles, e um único malformado ou longo demais também é erro. Não há plano B: se existe um registro e ele não funciona, a descoberta termina ali em vez de mandar o rastreador olhar o seu domínio. Se for trocar de host, substitua o registro; nunca adicione um segundo. A gramática, com vetores de teste, está na [especificação](/spec#the-_prodid-txt-record).',
			answer:
				'**O que conta como resposta.** HTTP 200 depois de no máximo um redirecionamento, um content type JSON, um corpo que valida contra o schema do feed e um `domain` que nomeia o domínio sendo descoberto. Um site que responde caminhos desconhecidos com uma página HTML e 200 não está respondendo, nem um documento servido como `text/html`.',
		},
		routes: {
			heading: 'Escolha como publicar',
			lead: 'Identidade e hospedagem são coisas separadas. Sua identidade é um domínio que você controla; onde os documentos são servidos é um detalhe que você pode mudar depois sem mudar sua identidade nem nenhum identificador que o prodid atribuiu aos seus produtos. Três caminhos, e todos produzem exatamente os mesmos registros.',
			route: (n: string) => `Caminho ${n}`,
			detail: (n: string) => `Caminho ${n} em detalhe →`,
			start: 'Comece em publish.prodid.org →',
			identity: 'Identidade',
			trust: 'Confiança',
			items: [
				{
					when: 'Você consegue servir arquivos no seu próprio domínio.',
					who: 'Uma marca com equipe de TI, ou uma plataforma (e-commerce, ERP, PIM) que publica para cada loja que hospeda.',
					how: 'Sirva o documento de descoberta no domínio e publique um registro TXT que nomeie o próprio domínio.',
					identity: 'o domínio',
				},
				{
					when: 'Você tem um domínio mas não consegue servir arquivos nele.',
					who: 'Um fabricante cujo site fica numa plataforma que ele não controla.',
					how: 'Publique num slug hospedado e aponte um registro TXT do seu domínio para esse host.',
					identity: 'o domínio, provado por DNS',
				},
				{
					when: 'Você não tem domínio nenhum.',
					who: 'Um pequeno produtor ou uma cooperativa.',
					how: 'Publique num slug hospedado. Adicione um domínio depois sem perder nada.',
					identity: 'o host do slug',
				},
			],
			hosted:
				'Os caminhos 2 e 3 usam o serviço de publicação hospedado em `<slug>.prodid.org`. Entre em [publish.prodid.org](https://publish.prodid.org/) com um link enviado ao seu e-mail, crie um site, envie seu arquivo e conecte um domínio se tiver. Você pode exportar tudo ou excluir o site lá a qualquer momento.',
		},
		table: {
			field: 'Campo',
			required: 'Obrigatório',
			what: 'O que é',
			yes: 'sim',
			no: 'não',
			delegating: 'ao delegar',
		},
		own: {
			copy: 'Copiar',
			copied: 'Copiado',
			eyebrow: 'Caminho 1',
			heading: 'Publique no seu próprio domínio',
			lead: 'Dois arquivos e um registro DNS. Uma plataforma que publica em nome de lojas faz o mesmo no domínio de cada uma, então cada loja mantém a própria identidade e o próprio nível de confiança.',
			step1: 'Passo 1 — Sirva o documento de descoberta',
			step1Lead: (url: string) => `Um arquivo, num caminho fixo, listando onde estão seus feeds de produto: \`${url}\``,
			feedCaption: 'O exemplo de spec/fixtures/v1/examples/prodid.json, gerado a partir do próprio arquivo.',
			feedTable: 'Campos do documento de descoberta',
			feedFields: [
				'Sempre org.prodid.feed.',
				'1. Um documento com 0 é aceito por rastreamentos que começam antes de 2027-01-26 00:00 UTC e recusado depois, como negativo definitivo.',
				'O nome que uma pessoa deve ver ao lado das suas afirmações.',
				'Um e-mail que alguém realmente lê. É para onde o índice escreve quando sua fonte entra em lapse, e é o único aviso que você recebe.',
				'Identificador SPDX que cobre as informações dos seus feeds, como CC0-1.0.',
				'Até 100 URLs https, todas no mesmo host deste documento.',
				'O domínio pelo qual este documento fala. Obrigatório sempre que se chega ao documento por um registro TXT que nomeia outro host, e então deve ser igual a esse domínio. Opcional quando o próprio domínio serve o documento, e, se presente, ainda precisa bater.',
			],
			serve:
				'Sirva por HTTPS na porta padrão, com certificado válido, como `application/json`, ou qualquer `application/…+json`. Não redirecione para outro host: o único redirecionamento que o rastreador segue é de `acme.example` para `www.acme.example`.',
			step2: 'Passo 2 — Sirva o feed',
			step2Lead:
				'Um feed é NDJSON: um objeto JSON completo por linha, UTF-8, separado por quebra de linha. Sem array em volta, sem vírgulas entre as linhas. Assim um feed de dois milhões de produtos é lido linha a linha, e uma linha ruim custa só essa linha, não o resto.',
			itemsCaption:
				'Três variantes de um produto, de spec/fixtures/v1/examples/items.ndjson. Elas compartilham um group, então o índice monta com elas uma família de três variantes.',
			sameHost:
				'**Feeds ficam no mesmo host do documento que os lista.** Um documento de descoberta que nomeia um feed em outro host é rejeitado inteiro, não em parte: você perde a fonte toda, não um feed, e isso conta como negativo definitivo, então dispara o relógio de lapse descrito abaixo. Servir o JSON do seu site e o NDJSON de outro hostname de CDN é uma vontade normal e não é suportada na v1. Coloque os dois num host só.',
			firstLine: 'A primeira dessas linhas, formatada para leitura:',
			itemLabel: 'um registro org.prodid.item',
			itemTable: 'Campos do registro de item',
			itemFields: [
				'Sempre org.prodid.item.',
				'Seu nome estável para este registro dentro do feed. Publicar a mesma key de novo substitui o anterior.',
				'A marca como aparece no produto. Ela é normalizada antes de delimitar um mpn, então ARÇELİK e Arçelik são uma marca, não duas.',
				'O nome do produto, sem os eixos de variante.',
				'Pelo menos um { scheme, value }, e pelo menos um que o índice consiga guardar. Valores não têm espaços nas pontas e não são vazios. Um gtin deve ter 8, 12, 13 ou 14 dígitos com dígito verificador correto e não ser só zeros; um mpn precisa de uma brand que normalize para algo, porque é nesse escopo que ele é único; um gtin de circulação restrita é mantido, mas só como o seu próprio rcn. Um registro sem nada que possa ser guardado não identifica nada e é ignorado.',
				'Tag BCP 47 do texto legível deste registro.',
				'Sua própria chave de agrupamento. Itens que a compartilham são variantes de uma mesma família.',
				'Os eixos que distinguem este item dentro do grupo: cor, tamanho, capacidade.',
				'Código de brick GS1 GPC, escrito gpc: seguido de oito dígitos.',
				'Códigos ISO 3166-1 alfa-2 dos mercados onde este item é vendido.',
				'Strings, números, booleanos, listas ou { value, unit } para uma medida.',
				'Até 20 URLs https, cada uma com um kind e uma licença SPDX da lista aceita. Ao contrário dos feeds, podem estar em qualquer host.',
			],
			flat: 'Envie itens planos. Você nunca monta famílias ou variantes nem envia um `opid`: o índice deriva o primeiro de `group` e atribui o segundo. Se você já gera um feed do Google Merchant, `group` é o seu `item_group_id`.',
			barcodes:
				'Duas coisas sobre códigos de barras que vale saber antes de exportar. Um `gtin` só de zeros não é código de barras, é um marcador de catálogo, e um registro com ele é rejeitado como se tivesse dígito verificador errado. Um [número de circulação restrita](/spec#which-gtins-are-identifiers), as faixas de uso interno da loja, é guardado e atribuído a você, mas não identifica nada globalmente, então nunca funde seu produto com o de outra pessoa e `/01/` não o resolve.',
			step3: 'Passo 3 — Reivindique a identidade no DNS',
			step3Lead: 'Com os arquivos no ar, publique um registro que nomeie o seu próprio domínio como host.',
			step3Why:
				'Ele aponta exatamente para o que a descoberta teria encontrado de qualquer jeito, então nada muda nos seus dados. O que muda é o que alguém com acesso só de inclusão ao seu DNS consegue fazer. Sem registro, um que essa pessoa adicione toma sua identidade em silêncio, porque o DNS vence o arquivo. Com o seu registro já lá, um segundo faz a descoberta falhar com *mais de um registro*: um lapse visível, notificado e recuperável.',
			neverDelegate:
				'**Nunca delegue `_prodid` a um fornecedor.** Acesso de escrita a `_prodid.<domain>` é controle da sua identidade, exatamente como no DKIM ou num desafio ACME DNS-01. Um domínio com DNS compartilhado é uma identidade compartilhada. Dê o feed a uma agência, não o registro.',
			order:
				'Coloque os arquivos no ar antes do registro, não depois: um registro que aponta para um documento que ainda não existe é uma descoberta que falhou. Os valores são lidos sem diferenciar maiúsculas, e um ponto final não tem problema, então `ACME.Example.` e `acme.example` são o mesmo host.',
			step4: 'Passo 4 — Avise o índice da mudança',
			step4Lead: 'Opcional. Todo domínio conhecido é rastreado de novo numa agenda, e um ping só antecipa o próximo rastreamento.',
			pingLabel: 'pedir ao índice para rodar a descoberta agora',
			ping: '`{"domains": [...]}` aceita até 1000 de uma vez; é assim que uma plataforma apresenta cada loja que hospeda. Não há chave para enviar, porque o ping não dá a quem chama nenhum poder sobre o conteúdo, e `202` é tudo o que ele responde. Não diz se o domínio era conhecido, se algo foi encontrado nem se outra pessoa deu ping nele um minuto antes. Um `429` só quer dizer que *você* passou do seu próprio limite de requisições, e os erros voltam como `application/problem+json`. O que aconteceu com o seu domínio aparece no [status da sua fonte](#after), não no ping.',
		},
		delegated: {
			eyebrow: 'Caminho 2',
			heading: 'Delegue a hospedagem, mantenha a identidade',
			lead: 'Muitos fabricantes têm um domínio e não conseguem colocar um arquivo nele. O feed fica hospedado em outro lugar e o domínio é provado por DNS, então a identidade da fonte continua sendo o domínio e o nível de confiança continua `verified`. Crie um site em [publish.prodid.org](https://publish.prodid.org/), informe seu domínio e ele mostra o registro exato a adicionar e o verifica para você.',
			looks: 'Como fica',
			steps: [
				'**Um catálogo enviado a um slug hospedado**, digamos `acme.prodid.org`, que serve tanto o documento de descoberta quanto o feed.',
				'**Um registro TXT no domínio que é seu**, nomeando esse host. Um host, nunca uma URL, então um registro nunca consegue mandar o rastreador para um endereço qualquer.',
				'**Um documento que nomeia o seu domínio de volta.** O DNS diz *meu documento está lá*; o documento diz *eu falo por esse domínio*. Um documento delegado sem `domain` é rejeitado: ausência nunca é lida como consentimento, e é isso que impede alguém de apontar um registro para o feed de outra pessoa.',
			],
			caption:
				'De spec/fixtures/v1/examples/prodid.delegated.json. A única diferença para o caminho 1 é o campo domain, e aqui ele é obrigatório.',
			window:
				'O publicador hospedado só escreve `domain` no documento depois de ver o seu registro TXT ele mesmo, então não existe um momento em que um documento reivindica um domínio que não pediu isso.',
		},
		hosted: {
			eyebrow: 'Caminho 3',
			heading: 'Publique sem domínio',
			lead: 'Um produtor sem domínio nenhum publica num slug hospedado, `<slug>.prodid.org`, com o próprio nome. Reserve um em [publish.prodid.org](https://publish.prodid.org/). A identidade da fonte é o host do slug e o nível de confiança é `unverified`, porque nada foi provado sobre um domínio. Os registros são registros de verdade: identificadores, resolução, atribuição.',
			merchant:
				'A maioria dos publicadores nessa situação já mantém um arquivo de produtos do [Google Merchant](https://support.google.com/merchants/answer/7052112), então o mapeamento de um desses para registros `org.prodid.item` está escrito na especificação, coluna por coluna, junto com o que ele descarta de propósito: preço, disponibilidade, frete e condição pertencem a um vendedor num dia, não ao produto. Vale ler [Importar um feed do Merchant](/spec#appendix-importing-a-merchant-feed) antes de exportar: o publish.prodid.org converte o CSV ou TSV que você envia exatamente com esse mapeamento. Quatro pontos dele decidem como sua planilha precisa ser:',
			rules: [
				'**Quatro colunas viram eixos de variante**: `color`, `size`, `material` e `pattern`, as que um comprador escolhe dentro de um mesmo `item_group_id`. `gender`, `age_group`, `size_type` e `size_system` continuam propriedades comuns: descrevem o grupo todo, e como eixos dividiriam um produto em vários na primeira vez que alguém escrevesse um deles de dois jeitos.',
				'**Um atributo repetido é separado por vírgula ou tem cabeçalho repetido, por arquivo, não por célula.** Uma célula só é dividida nas vírgulas quando o cabeçalho dela aparece uma vez no arquivo todo; repita o cabeçalho e cada célula abaixo é lida inteira. É a única forma de levar um valor com vírgula, e é uma decisão que você toma uma vez para o arquivo. Vale para `additional_image_link`, `product_type`, `product_highlight`, `product_detail` e `certification`; todo o resto, inclusive uma `description` cheia de vírgulas, é lido inteiro de qualquer jeito.',
				'**Um `product_detail` nunca sobrescreve nada.** O subatributo do meio vira a chave da propriedade, o nome da seção é descartado e o primeiro valor de uma chave vence. Um detail posterior com a mesma chave, ou um que caia numa chave que o mapeamento já gerou, é descartado e relatado com a sua linha, então uma coluna de detail nunca redefine em silêncio o que o resto da linha disse.',
				'**É preciso declarar uma licença de mídia.** O formato Merchant não tem coluna para isso e [nada é ingerido sem licença](/spec#licences-that-can-be-ingested), então uma importação declara um único identificador SPDX aceito cobrindo todas as imagens e documentos do arquivo. Uma coluna `license` sua substitui isso linha a linha, e um arquivo cuja licença declarada não é aceita gera registros sem mídia, e não registros com falha.',
			],
			skipped:
				'Uma linha que não pode virar registro (sem identificador utilizável, com um GTIN cujo dígito verificador falha) é ignorada e relatada pelo número da linha na planilha, contando o cabeçalho como linha 1, então uma linha ruim custa só essa linha e não a importação. Há um arquivo pronto para você se comparar em [`/spec/fixtures/merchant`](/spec/fixtures/merchant): um CSV, os registros que ele deve gerar e a linha que deve ser ignorada.',
			later:
				'O que importa numa decisão de hoje é o que acontece depois. Adicionar um registro TXT num domínio que você adquirir, nomeando esse mesmo host, transforma o slug no domínio no próximo rastreamento: **a mesma fonte, os mesmos registros, todo `opid` mantido**, com a confiança subindo de `unverified` para `verified`. Seus identificadores `sku` são vinculados à própria fonte, não ao nome dela, então sobrevivem à mudança. No publish.prodid.org é o mesmo campo de domínio que o caminho 2 usa.',
		},
		trust: {
			heading: 'O que confiança quer dizer aqui',
			lead: 'Confiança é uma propriedade da fonte, não de uma afirmação. Diz o que foi provado sobre quem está falando, e nada sobre se uma informação específica está correta. Quem usa os dados decide o que fazer com isso.',
			table: 'Níveis de confiança',
			level: 'Nível',
			meaning: 'Significado',
			levels: [
				'Controle do domínio provado e propriedade da marca confirmada.',
				'Controle do domínio provado, pelo registro TXT ou pelo domínio servindo o documento.',
				'Um slug hospedado sem domínio, uma importação de conjunto de dados ou uma contribuição da comunidade.',
			],
			only: 'Só uma fonte cuja identidade é um domínio pode ser mais do que `unverified`. `verified` vem do rastreamento. `authoritative` não, porque nenhum rastreamento prova quem é dono de uma marca: o operador do índice concede, e só com evidência.',
			rules: [
				{
					title: 'A evidência é o seu prefixo de empresa GS1.',
					body: 'O prefixo de empresa GS1 dos GTINs que sua fonte publica sob a marca deve estar licenciado para a organização que controla o seu domínio, como mostra a consulta pública “Verified by GS1”. A URL dessa consulta é guardada com a concessão como evidência.',
				},
				{
					title: 'Uma concessão nomeia uma marca, e cada uma pode ser revogada.',
					body: 'A marca é registrada na forma [normalizada](/spec#brand-normalization). Uma fonte pode ter concessões para várias marcas, e o operador revoga cada uma separadamente.',
				},
				{
					title: 'Uma concessão não sobrevive à prova que a sustenta.',
					body: 'Sua fonte é `authoritative` exatamente enquanto o controle do domínio estiver provado, ela não estiver [lapsed](/spec#lapse) e tiver ao menos uma concessão não revogada. Perca a prova de domínio ou entre em lapse, e ela cai na hora para o que a prova restante sustenta (`verified` enquanto em lapse, menos se a prova de domínio também sumiu) sem ninguém fazer nada. Ela volta a ser `authoritative` assim que as três condições valerem de novo.',
				},
				{
					title: 'Ela cobre a fonte, não a marca.',
					body: 'Confiança continua sendo propriedade da fonte: uma concessão para uma marca torna `authoritative` toda afirmação da sua fonte, inclusive sobre marcas para as quais ela não tem concessão.',
				},
			],
			ask: `Para pedir, publique primeiro no seu próprio domínio e depois [faça o pedido pelo formulário](${CONTACT.authoritative}), informando seu domínio, a marca e uma consulta Verified by GS1 de um dos GTINs dela. O operador confere no Verified by GS1 os GTINs que sua fonte publica sob essa marca. O pedido é público.`,
		},
		after: {
			heading: 'Depois de publicar',
			edit: {
				title: 'Mudar um registro é editar uma linha.',
				body: 'Publicar um registro com uma key que já existe substitui o anterior. Não há endpoint de atualização, porque o feed é o estado.',
			},
			remove: {
				title: 'Remover uma linha retira suas afirmações, não o produto.',
				body: 'Uma key que some de um feed que o rastreador baixou inteiro marca suas afirmações sobre ela como retiradas. A entidade e o identificador ficam: os links de outras pessoas continuam funcionando, assim como as afirmações de outras fontes.',
			},
			retire: {
				title: 'Remover uma URL de feed do documento a desativa na hora.',
				body: 'Quando um rastreamento lê um documento que não nomeia mais uma das suas URLs de feed, todo registro ativo daquele feed é retirado na hora, como se todas as keys tivessem sumido, e a URL não é mais buscada. A tolerância de sete dias descrita abaixo não vale aqui: remover uma URL é você dizendo que o arquivo acabou, e o índice acredita em você. Listá-la de novo depois a traz de volta, lida do zero. Sirva o documento com um `ETag` se puder: um `304` quer dizer que a lista não mudou, então nada é desativado.',
			},
			broken: {
				title: 'Uma linha quebrada adia a retirada em sete dias; não a desliga.',
				body: 'Uma linha com mais de 64 KiB, que não dá para interpretar ou inválida é ignorada e contada. Como a key de uma linha ignorada é desconhecida, um feed com linhas ignoradas não retira nada por sete dias. Depois disso, keys ausentes são retiradas normalmente. A contagem é pública, então um feed perdendo linhas em silêncio não fica em silêncio.',
			},
			unreadable: {
				title: 'Um feed que o rastreador não consegue ler não sai de graça.',
				body: 'Um rastreamento só dá certo quando *tudo o que o documento lista* foi lido: um documento aceitável, e cada feed nele respondendo `200` ou `304`. Um feed com timeout não faz você perder os outros (os que responderam são ingeridos, e nada é retirado num rastreamento que falhou), mas o rastreamento conta como falha de transporte, e `feeds_failed` mostra isso no seu status. Um documento perfeitamente saudável na frente de uma URL de feed morta de vez entra em lapse no mesmo relógio de sete dias de um domínio que parou de responder, e perde o catálogo trinta dias depois. Uma URL de feed que você não serve mais deve sair do documento, não ficar largada.',
			},
			lapse: {
				title: 'Se a descoberta parar de dar certo, sua fonte entra em lapse.',
				body: [
					'Um **negativo definitivo**, ou seja, uma descoberta que termina sem documento aceitável (sem registro e sem documento; um registro malformado, longo demais ou duplicado; ou um documento que não é 200, não é JSON, não é válido, não concorda mais sobre `domain` ou lista um feed fora do seu host), coloca a fonte em lapse na hora. Uma **falha de transporte** (timeout de DNS, 5xx, 429, limite atingido, no documento ou em qualquer feed) não muda nada sozinha, mas sete dias seguidos em que toda tentativa termina assim também colocam você em lapse, então servir erros para sempre não é um jeito de congelar suas afirmações.',
					'**Esse benefício da dúvida pertence a um host, não a você.** Ele só vale num host em que sua fonte já foi verificada. Num host em que ela nunca foi verificada (um slug novo, um host para onde você acabou de apontar `_prodid`, tudo nos caminhos 2 e 3), qualquer falha, timeout e 5xx incluídos, é negativo definitivo e coloca você em lapse na hora. É de propósito: senão uma fonte verificada poderia apontar o registro para um host que não controla e descobrir, pelo lapse começar hoje ou daqui a uma semana, se esse host está no ar. Trocar de host não custa nada por causa disso. O primeiro rastreamento bem-sucedido no host novo limpa tudo, e um lapse continua recuperável durante os 30 dias antes de qualquer retirada.',
					'Uma fonte em lapse não recebe afirmações novas, aparece como lapsed para os leitores, e o seu `publisher.contact` é avisado. Um rastreamento de uma fonte em lapse não grava nada até dar certo por completo; só então o lapse é removido. Depois de 30 dias seguidos de lapse, seus **registros e as afirmações ativas deles são retirados juntos** e ficam como histórico. Esses 30 dias são sua janela de recuperação, e é por isso que o endereço de contato precisa ser lido por alguém.',
					'Voltar não exige mudar nada. Sirva o mesmo documento e o mesmo feed de sempre e tudo o que você publica é afirmado de novo no instante em que a descoberta dá certo, tenha mudado um byte ou não: enquanto não guarda nada ativo seu, o índice abre mão de requisições condicionais, então um arquivo sem mudança nunca é motivo para continuar retirado.',
				],
			},
			seen: {
				title: '`seen_at` é uma afirmação contínua, e um lapse longo o zera.',
				body: 'Toda afirmação que um leitor vê carrega `seen_at`: não quando a informação foi publicada pela primeira vez em algum lugar, mas *desde quando esta fonte afirma este valor sem parar*. Ele sobrevive a todo novo rastreamento que encontra o mesmo valor, e esse é o objetivo. Não sobrevive a uma retirada. Deixe sua fonte em lapse por mais de 30 dias e a data de cada informação que você publica recomeça no dia em que você voltar, porque durante o intervalo ninguém verificável estava por trás delas. As linhas retiradas ficam, então `?history=1` mostra o intervalo em vez de escondê-lo; [o que um leitor vê](/spec#an-entity) está na especificação.',
			},
			status: {
				title: 'Sua fonte tem uma página de status pública.',
				body: '`/source/acme.example` é onde você vê que algo está errado: o resultado do último rastreamento, qual caminho a descoberta seguiu, quantos registros mudaram, quantas linhas foram ignoradas, quantos feeds não puderam ser lidos e se você está em lapse e desde quando. Ela só informa o que o seu domínio publica e quando o índice olhou, nunca quem pediu um rastreamento.',
			},
			media: {
				title: 'Mídia é inspecionada, não aceita na confiança, e uma entrada ruim custa só ela mesma.',
				sniffed:
					'O tipo é decidido lendo os bytes; o seu `Content-Type` é uma dica. Seis tipos são guardados e nada mais: JPEG, PNG, GIF, WebP e AVIF como `image`, PDF como `document`. Sem SVG, sem HTML, sem arquivos compactados, sem arquivos do Office: uma ficha técnica vai em PDF. O tipo detectado e o `kind` da entrada precisam bater, ou a entrada é ignorada.',
				table: 'Limites de mídia',
				what: 'O quê',
				cap: 'Limite',
				caps: ['Uma imagem', 'Um documento', 'Um download de mídia', 'Entradas de mídia num registro'],
				licence:
					'A licença é verificada como texto antes de qualquer download, e precisa ser exatamente um de sete identificadores SPDX: os que deixam qualquer pessoa redistribuir o arquivo como está, que é o que o índice faz com ele:',
				licences: 'licenças de mídia aceitas',
				entry:
					'Tudo aqui é por entrada. Uma entrada recusada, grande demais ou inacessível custa só essa entrada: **seu registro nunca é inválido por causa da mídia**, as outras afirmações valem e nenhuma falha de mídia coloca você em lapse. Ela é contada em `media_failed` e tentada de novo no próximo rastreamento desse registro. Uma coisa funciona ao contrário dos feeds: a regra do mesmo host *não* vale aqui, então suas imagens podem ficar numa CDN. [O que é ingerido](/spec#what-is-ingested) e [a lista de licenças](/spec#licences-that-can-be-ingested) explicam o porquê.',
			},
			others: {
				title: 'Outras fontes vão publicar sobre os seus produtos.',
				body: 'Varejistas, registros, conjuntos de dados abertos e colaboradores são fontes como qualquer outra. As afirmações deles são atribuídas a eles e nunca sobrescrevem as suas; onde vocês discordam, as duas afirmações ficam visíveis lado a lado com suas fontes.',
			},
		},
		toc: 'Nesta página',
		question: 'Como vai publicar?',
		reference: 'Referência',
		details: 'Detalhes e referência de campos',
		go: 'Crie o seu site',
		done: 'Marcar este passo como concluído',
		progress: '{n} de {total} passos concluídos',
		check: {
			heading: 'Verifique o seu domínio',
			lead: 'Terminou de publicar? Introduza o seu domínio. O índice é solicitado a analisá-lo agora e você chega à página de estado em tempo real.',
			label: 'O seu domínio',
			placeholder: 'acme.example',
			button: 'Verificar',
			working: 'A verificar…',
			invalid: 'Introduza apenas um nome de host, como acme.example: sem https://, sem caminho.',
			limited: 'Pedidos a mais a partir da sua rede. Aguarde um pouco e tente de novo.',
			failed: 'O índice não aceitou o pedido. Tente de novo dentro de um minuto.',
			note: 'O próximo rastreamento atualiza o estado em poucos minutos.',
			looks: 'O que a verificação analisa',
			noscript: 'Sem JavaScript, abra diretamente a página de estado:',
		},
		checklist: {
			heading: 'Antes de ir ao ar',
			items: [
				'A descoberta responde com HTTP 200, um content type JSON e um corpo que valida contra o schema do feed, e não com uma página HTML de “não encontrado” servida com 200.',
				'Há exatamente um registro TXT v=prodid0 em _prodid.<seu domínio>. Dois é erro, e um malformado também.',
				'Esse registro é v=prodid0; host=<hostname>. Um host, nunca uma URL: sem esquema, sem porta, sem caminho.',
				'Toda URL em feeds é https e está no mesmo host do documento de descoberta que a lista.',
				'Toda URL em feeds é uma que você ainda serve. Um feed que não pode ser baixado faz o rastreamento inteiro falhar, e sete dias disso colocam a fonte em lapse.',
				'Um documento delegado traz "domain", igual ao domínio pelo qual ele fala.',
				'O documento de descoberta é servido como application/json e não redireciona para outro host.',
				'Feeds e documentos enviam ETag ou Last-Modified, para que um arquivo sem mudança custe só um 304.',
				'Toda linha do feed é um objeto JSON completo com menos de 64 KiB, UTF-8, separado por quebra de linha, sem array em volta e sem vírgulas sobrando.',
				'Toda key é estável e nunca é reutilizada para outro produto.',
				'Todo gtin tem só dígitos, dígito verificador correto e não é só zeros.',
				'Todo valor de identificador está aparado (sem espaços no começo ou no fim), e todo registro mantém ao menos um identificador que o índice consegue guardar, o que quer dizer que um mpn precisa de uma brand.',
				'Toda entrada de mídia tem um kind que bate com os bytes reais e uma das sete licenças SPDX aceitas, ou essa entrada é ignorada.',
				'Nenhum registro contém um opid. Quem atribui é o índice.',
				'publisher.contact é um endereço que alguém lê.',
			],
			check: 'Confira seus arquivos antes do ping',
			checkLead:
				'`prodid-batch check` valida seu documento de descoberta e cada feed exatamente como o índice faria, sem token e sem perguntar nada ao índice. Ele roda a partir de um clone do repositório com [Bun](https://bun.sh) 1.4.4. Passe os próprios arquivos: um caminho terminado em `.json` é lido como um documento, qualquer outro como feed NDJSON.',
			checkLabel: 'valide o que você serve, como o índice fará',
			checkResult:
				'Um arquivo sem problemas imprime `ok` e o número de registros que o índice tiraria dele. Senão, imprime uma linha por problema, como `items.ndjson:12: message` com a linha do feed onde está, e sai com código diferente de zero. Ele lê os arquivos, não o seu DNS nem o seu servidor, então o registro TXT, o content type e os cabeçalhos de cache da lista acima continuam sendo seus para conferir.',
			rules:
				'As regras contra as quais um registro é validado estão na [especificação](/spec), os schemas são servidos em [`/spec/schemas/v1`](/spec/schemas/v1), e [`/spec/fixtures/v1`](/spec/fixtures/v1) tem vetores legíveis por máquina para testar seu exportador antes que alguém o rastreie.',
			status: 'Status:',
			formats: 'Os formatos de arquivo desta página são os que o índice lê quando você dá ping nele.',
		},
	},

	data: {
		title: 'Dados abertos — prodid',
		description:
			'Baixe o índice inteiro do prodid: um dump noturno de cada fonte, entidade, registro, agrupamento e fusão em NDJSON com gzip, sob CC0 para o que o índice cria e sob a licença de cada fonte para as afirmações dela.',
		eyebrow: 'Dados abertos',
		heading: 'Baixe o índice',
		lead: 'O índice é substituível. Tudo o que ele sabe e que um leitor pode saber é publicado como uma exportação completa, um dump, que qualquer pessoa pode baixar e carregar num índice próprio.',
		latest: {
			heading: 'O dump mais recente',
			before: 'Quando esta página foi gerada, o dump mais recente era o snapshot tirado em',
			after: '. Um novo é gravado toda noite às 04:30 UTC, e',
			names: 'sempre nomeia o mais recente.',
			lines: (count: string, one: boolean) => `${count} ${one ? 'linha' : 'linhas'}`,
			per: (what: string) => `Uma linha por ${what}.`,
			directory: (directory: string, manifest: string, created: string, index: string, claims: string) =>
				`O diretório deste dump é \`${directory}\`, e o manifesto é [\`manifest.json\`](${manifest}), gravado em ${created}. As licenças dele dizem \`index: ${index}\` e \`claims: ${claims}\`.`,
		},
		holds: {
			'sources.ndjson.gz': { per: 'fonte', line: 'O status da fonte, exatamente como /source/{name} responde.' },
			'entities.ndjson.gz': {
				per: 'entidade, incluindo as fundidas',
				line: 'O documento da entidade exatamente como /id/{opid}?history=1 responde, incluindo afirmações retiradas.',
			},
			'records.ndjson.gz': {
				per: 'registro, incluindo os retirados',
				line: 'source, key, feed, opid, body, first_seen, last_seen, withdrawn_at.',
			},
			'groupings.ndjson.gz': { per: 'agrupamento', line: 'source, kind, key, opid.' },
			'merges.ndjson.gz': { per: 'fusão, incluindo as revertidas', line: 'from, into, decided_at, reverted_at.' },
		},
		layout: {
			heading: 'Onde os dumps ficam',
			lead: 'Um dump é um diretório com o nome da data UTC do seu snapshot, dentro da versão em que foi gravado. `v1/` guarda dumps v1, cujo manifesto e cujas linhas de fonte e entidade são documentos v1. Ele contém cinco arquivos de dados e um manifesto.',
			last: '**latest.json é gravado por último.** É uma cópia do `manifest.json` do dump mais recente, gravada depois que todos os arquivos desse dump e o manifesto estão no lugar. Quem começa por ele nunca encontra um manifesto nomeando um arquivo que ainda não existe, e acha o diretório pelo próprio `snapshot_at` do manifesto.',
			retention:
				'**Retenção.** Um dump diário é mantido por 7 dias. O primeiro dump de cada mês UTC é mantido para sempre. Um dump mantido nunca é regravado: diretório, arquivos e manifesto ficam byte a byte como estavam.',
			v0: (dumps: string, latest: string) =>
				`**Dumps v0.** Os dumps v0 gravados antes da v1 continuam em \`${dumps}\`, com a mesma retenção, e [\`v0/latest.json\`](${latest}) continua nomeando o último deles. Eles validam contra os schemas v0 para sempre.`,
			manifest: (schema: string) =>
				`**O manifesto.** Nomeia cada um dos cinco arquivos exatamente uma vez, com o SHA-256 e o tamanho do arquivo como servido, compactado, e o número de linhas depois de descompactado. Confira cada arquivo contra o seu digest antes de carregar. O schema é [\`${schema}\`](${schema}), com vetores em [\`/spec/fixtures/v1/dump\`](/spec/fixtures/v1/dump).`,
		},
		files: {
			heading: 'O que cada arquivo contém',
			lead: 'Todo arquivo é NDJSON compactado com gzip, um objeto JSON por linha. Os cinco são lidos de um mesmo snapshot consistente, então batem entre si: toda fonte que uma linha nomeia tem sua linha em `sources.ndjson.gz`, e todo `opid` que uma linha nomeia tem sua linha em `entities.ndjson.gz`.',
			table: 'Arquivos do dump',
			columns: ['Arquivo', 'Uma linha por', 'A linha'],
			merged: 'Entidades fundidas',
			mergedBody:
				'Um `opid` fundido responde `308` no resolvedor, então não tem documento próprio para copiar. A linha dele é o documento que ele responderia se não estivesse fundido (os próprios identificadores e afirmações continuam nele, e é isso que torna uma fusão reversível) com um membro a mais, `merged_into`, o `opid` da entidade que permanece. Fusões não se encadeiam: a entidade que permanece nunca está fundida também.',
			record: 'Uma linha de registro',
			recordLead: 'Um registro como o índice o guarda. Todo horário é UTC, ISO 8601.',
			recordTable: 'Campos da linha de registro',
			recordColumns: ['Campo', 'O que é'],
			recordFields: [
				'O nome da fonte.',
				'A key do registro nessa fonte.',
				'A URL do feed de onde foi lido. Ausente num registro gravado por uma importação de conjunto de dados.',
				'O item para o qual ele resolveu.',
				'O org.prodid.item que o publicador enviou, sem mudanças.',
				'Quando o índice o leu pela primeira vez.',
				'Quando o índice o leu pela última vez.',
				'Presente exatamente quando o registro está retirado.',
			],
			grouping: 'Uma linha de agrupamento',
			groupingLead:
				'Para qual entidade um agrupamento de uma fonte resolveu. `kind` é `family` ou `variant`, e `key` é aquilo pelo que os registros da fonte são agrupados, escrito por extenso em vez de resumido, para que outra implementação consiga casar o próprio agrupamento com ele.',
			groupingNotes: [
				'para um grupo do publicador; { "key": "<key>" } para um registro sem grupo, que é uma família sozinho.',
				'a variante do registro, {} quando não tem.',
			],
			familyKey: '{ "family": <a key da família>, "variant": { <eixo>: <valor>, … } }',
			merge: 'Uma linha de fusão',
			mergeBody:
				'Uma decisão de fusão: `from` o `opid` fundido, `into` a entidade que permanece, `decided_at` quando foi tomada e `reverted_at`, presente exatamente quando foi revertida.',
		},
		never: {
			heading: 'O que um dump nunca contém',
			lead: 'Um dump não diz mais do que o resolvedor já diz, mais os registros, agrupamentos e fusões a partir dos quais as respostas dele são montadas.',
			items: [
				'O endereço de contato de um publicador, que o índice guarda só para mandar o aviso de lapse.',
				'O log de rastreamento, o texto de erro do rastreador ou qualquer outra coisa sobre um rastreamento que o status da fonte não mostre.',
				'Por que uma fusão foi feita ou quem a decidiu.',
				'Por que um hash de mídia foi bloqueado.',
				'Os bytes da mídia. O media_url de uma afirmação de mídia aponta para o arquivo, e um hash bloqueado não é servido.',
				'Os identificadores internos de linha do índice. Toda linha nomeia uma fonte pelo nome e uma entidade pelo opid.',
				'As concessões de autoridade e as evidências delas. A linha de uma fonte diz authoritative se ela era em snapshot_at, mas um índice carregado do dump não tem nenhuma concessão até o próprio operador conceder uma.',
			],
		},
		licences: {
			heading: 'Licenças',
			lead: 'Duas regras, e o `licenses` do manifesto declara as duas.',
			index: 'Tudo o que o índice cria',
			indexBody: 'Os `opid`, os mapeamentos de identificadores, a hierarquia de família e variante, agrupamentos e fusões.',
			claims: 'Toda afirmação e todo registro',
			claimsBody:
				'Sob a licença que a própria fonte declara: a `license` da linha dessa fonte em `sources.ndjson.gz`. Uma fonte que não declara nenhuma não concedeu nada, e o prodid não concede nada em nome dela.',
			datasets:
				'Um conjunto de dados aberto que não publica documento de descoberta próprio entra no índice como uma fonte chamada `dataset:<slug>`, importada pelo operador do índice a partir da exportação pública do conjunto. Essa fonte é sempre `unverified`, e a `license` dela é a do próprio conjunto. As regras estão na [especificação](/spec#dataset-sources).',
		},
		load: {
			heading: 'Carregue no seu próprio índice',
			lead: '`prodid-batch load-dump` carrega um dump v0 ou v1 num banco PostgreSQL 18 vazio migrado para a mesma versão, numa única transação. Ele aceita o diretório datado de um dump, o `manifest.json` dele ou um `latest.json`, local ou por HTTPS.',
			label: 'a partir de um clone do repositório',
			checked:
				'Cada arquivo é conferido contra os `sha256`, `bytes` e `lines` do manifesto antes de qualquer gravação, e um dump remoto é baixado antes para um diretório temporário. Um banco que não está vazio é recusado. `PRODID_OPERATOR` é registrado como quem decidiu as fusões carregadas.',
			peek: 'Para ler um arquivo sem carregá-lo, confira contra o digest e descompacte. O digest abaixo é o do manifesto mais recente quando esta página foi gerada.',
			rules: 'As regras completas estão na especificação, em [Dumps](/spec#dumps).',
		},
	},
}
