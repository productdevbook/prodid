import type { Copy } from '@/i18n/copy'
import { CONTACT } from '@/lib/spec'

export const zh: Copy = {
	common: {
		skip: '跳到正文',
		home: 'prodid 首页',
		primary: '主导航',
		nav: {
			spec: '规范',
			specShort: '规范',
			publish: '发布',
			publishShort: '发布',
			data: '数据',
			dataShort: '数据',
			menu: '菜单',
		},
		toDark: '切换到深色主题',
		toLight: '切换到浅色主题',
		language: '语言',
		status: 'Spec v1。索引和托管发布服务运行在 prodid.org 上。任何人都可以发布，可以用自己的域名，也可以使用托管。',
		normative: '规范只以英文发布，以英文文本为准。',
		imageAlt: 'prodid：发布者在自己的域名上声明产品信息，一个开放索引把每个代码关联到一个永久标识符，任何人都可以下载整个索引。',
		support: {
			label: '支持 prodid',
			heading: 'prodid 是开源项目。帮助它成长。',
			body: '给仓库加星，让更多人发现它；告诉我们哪里有问题；提交修复；或者无需 GitHub 账号，直接在这里给我们留言。',
			star: '在 GitHub 上加星',
			stars: (count: string) => `${count} 颗星`,
			contribute: '参与贡献',
			chat: '给我们留言',
		},
		footer: {
			tagline: '面向每一件实体产品的开放身份与数据层。',
			label: '页脚',
			site: '网站',
			specification: '规范',
			publish: '发布你的产品',
			github: 'GitHub 上的源代码',
			contact: '联系',
			report: '报告问题',
			security: '安全',
			licence:
				'规范和 schema 采用 CC0，prodid.org 发布的 `opid` 和标识符映射也是如此。其他所有声明都沿用作出它的来源的许可。参考实现采用 Apache-2.0。',
		},
	},

	home: {
		title: 'prodid — 每一件实体产品的开放身份',
		description: 'prodid 为每一件实体产品提供一个永久的开放标识符。GTIN、MPN 以及其他任何代码都解析到它，每条信息都是注明来源的声明。',
		badge: 'Spec v1 · 运行中',
		headline: '条形码不是产品。',
		headlineAccent: 'prodid 才是。',
		lead: '为每一件实体产品提供永久、开放的标识符。每个条形码和零件号都解析到它，关于它的每条信息都注明说出这条信息的来源。',
		ctaPublish: '发布你的产品',
		ctaSpec: '阅读规范',
		resolve: {
			label: '试一试：解析标签上的代码',
			button: '解析',
			hint: '请输入 8 到 14 位数字。',
		},
		close: {
			heading: '给你的产品一个比条形码更长久的身份。',
			body: '在你自己的域名上放两个文件和一条 DNS 记录，或者在没有域名的情况下使用托管站点。',
		},
		heroKind: (brand: string) => `Item · ${brand}`,
		heroVariant: (markets: string) => `海军蓝 · M · 在 ${markets} 销售`,
		heroLapsed: (source: string) => `lapsed · ${source}`,
		heroCaption: '扫描标签上的代码得到的结果。这条记录就是规范自带的示例。',
		sceneLabel: '使用自有域名的发布者、托管发布者和开放数据集把声明发送到一个开放索引；索引解析产品上的代码，并以转储的形式公开整个索引。',
		sceneCaption: '发布者在自己的域名上、通过托管或从开放数据集发布信息。索引把标签上的每个代码关联到一个永久的 opid，整个索引都可以下载。',
		problem: {
			eyebrow: '问题',
			heading: '四个代码，一件夹克，彼此之间毫无关联。',
			body: '一件产品每进入一个市场、换一种包装规格、改一次包装，就会得到一个新条形码，而它的数据分散在各自不同的系统里。两个系统一旦不一致，其中一个就会被悄悄覆盖。',
			answer: 'prodid 为产品本身提供一个标识符，条形码变了，它也不变。',
			figure: '多个代码解析到同一个变体',
			anotherGtin: '另一个 GTIN',
			codes: ['DE 和 TR 的零售单元', '同一件夹克的两件装', '明年的包装', '制造商零件号'],
			variant: '一个变体',
			variantNote: '永不复用，永不删除。曾经指向这里的每个代码都会继续有效。',
		},
		model: {
			eyebrow: '模型',
			heading: '系列、变体、单品。代码指向它们，但不是它们。',
			lead: '每一层都有自己的 `opid`：16 个不编码任何信息的字符，所以产品的任何变化都不会让它出错。',
			levels: [
				{ title: 'Acme Trail Jacket', note: '人们日常所说的那件产品。' },
				{ title: '海军蓝 · M 码', note: '颜色、尺码等属性的一种组合。' },
				{ title: 'DE 和 TR 的零售单元', note: '印着条形码的那个东西。' },
			],
			after: '新包装会在同一个变体、同一个系列下增加一个带新条形码的新单品。原来指向旧单品的一切都不会失效。',
		},
		how: {
			start: '开始发布',
			eyebrow: '工作方式',
			heading: '在你的域名上发布，prodid 建立索引，任何人都能解析。',
			publish: {
				step: '01 · 发布',
				title: '域名上的三样东西',
				body: '一个发现文档、一个每行一件产品的 feed，以及一条证明域名归你所有的 DNS 记录。',
				link: '如何发布 →',
			},
			index: {
				step: '02 · 索引',
				title: '校验、匹配、归属',
				checks: ['每一行都按 schema 校验', '匹配到已有的 opid，或分配一个新的', '每个字段都作为你的域名的声明保存'],
				body: '零售商、注册机构和开放数据集也以同样的方式作为来源：与制造商并列，而不是凌驾于它之上。',
				link: '声明如何运作 →',
			},
			resolve: {
				step: '03 · 解析',
				title: '印在产品上的一个 URL',
				browser: '浏览器 → 一个网页',
				api: 'API → JSON 记录',
				body: '路径采用 GS1 Digital Link 语法，因此它本身就可以是标签上的二维码。',
				link: '解析如何运作 →',
			},
		},
		claims: {
			eyebrow: '声明',
			heading: '每条信息都注明来源，分歧始终可见。',
			lead: '没有任何内容会被合并成唯一的“真相”。当一个来源停止发布时，它的声明会被保留并标记为 lapsed，而不是删除。',
			caption: '规范示例单品中的声明',
			columns: ['属性', '值', '来源', '可信度', '可见自'],
			lapsed: ' · lapsed',
			trust: [
				'控制该域名，并已确认为品牌所有者。',
				'已通过 DNS 或自己的网站证明对某个域名的控制。',
				'没有域名的托管名称、数据集或社区贡献。',
			],
			details: '查看请求和完整的 JSON 记录',
			request: '请求头和响应头',
		},
		who: {
			links: ['在你的域名上发布', '选择发布方式', '获取数据'],
			eyebrow: '适用对象',
			heading: '产生数据的人，和需要数据的人。',
			audiences: [
				{
					title: '制造商',
					body: '在自己的域名上声明一次产品数据。你所制造产品的描述，不归任何经销商页面或电商平台所有。',
				},
				{
					title: '电商、ERP 和 PIM 厂商',
					body: '每个商户域名一个发现文档和一个 feed，用你已经掌握的数据生成。',
				},
				{
					title: '开发者',
					body: '把任何代码解析为一个经得起重新包装的标识符。每条信息都说明是谁说的、何时说的，以及该来源是否仍然为它负责。',
				},
			],
			passport:
				'**关于欧盟数字产品护照。** ESPR 要求可以通过产品上的数据载体访问护照，而 GS1 Digital Link 是为此正在标准化的载体语法之一。prodid 不是护照服务，在这里发布也不代表符合任何法规；它做的是同样的基础工作：每件产品一条机器可读的记录，放在一个由你控制的稳定地址上。',
		},
		status: {
			eyebrow: '现状',
			heading: '项目的真实进展。',
			stable: {
				label: '稳定',
				title: '规范 v1。',
				body: `它只会以新增的方式变化；其他任何改动都会是 v2。v0 发现文档在 2027-01-26 00:00 UTC 之前仍被接受。[阅读规范](/spec)，并[指出哪里有错](${CONTACT.issues})。`,
			},
			sources: {
				label: 'Canary 和一个数据集',
				title: '目前还没有任何发布者的目录被索引。',
				body: '索引中有两个来源：项目自己的 canary [canary.prodid.org](https://prodid.org/source/canary.prodid.org)，用于端到端验证发布、抓取和解析；以及 [dataset:wikidata](https://prodid.org/source/dataset:wikidata)，一次限定为 5 个 Wikidata 条目的测试导入，unverified，采用 CC0-1.0。',
			},
			design: {
				label: '有意为之',
				title: '索引是可替换的。',
				body: '规范、schema、opid 和代码映射都采用 [CC0](/spec#licensing)。每条声明都保留其来源的许可。信息存放在发布它们的域名上，所以任何人都可以重新抓取，印好的代码也会保持其含义。',
			},
		},
	},

	publish: {
		title: '发布你的产品 — prodid',
		description: '制造商或软件厂商如何向 prodid 发布产品数据：发现文档、NDJSON feed、承载身份的那一条 DNS TXT 记录，以及 ping。',
		eyebrow: '发布者指南',
		heading: '发布你的产品',
		lead: '向 prodid 发布，就是在网上放两个文件，在 DNS 里加一条记录。在你自己的域名上，无需注册，也无需保管任何密钥：域名本身就是凭证，修改文件就能修改或撤回你发布的内容。',
		discovery: {
			heading: '索引如何找到你',
			lead: '这一点要先了解，因为它决定了下面三种方式中哪一种适合你。每次抓取时，发现过程都会从头开始，先查 DNS，抓取之间不会记住任何通往你数据的路径。',
			first: '首先',
			firstTitle: '`_prodid.acme.example` 上的 DNS TXT 记录',
			firstBody:
				'如果那里有 `v=prodid0` 记录，就只按它走，即使它指向你自己的域名。记录指定的是一个 *host*；文档始终位于 `https://<host>/.well-known/prodid.json`。',
			second: '仅当没有这样的记录时',
			secondBody: '域名本身上的文档。谁通过 HTTPS 提供这个域名，谁就代表它发言。',
			why: 'DNS 优先，是因为它是更强的证明：能在某台主机上放文件的人，不一定是域名的所有者，而所有者必须能推翻这一点。这也是为什么即使文件由你自己提供，也应该写这条记录；[方式 1 第 3 步](#own-domain)解释了它能为你带来什么。',
			one: '**只能有一条记录，背后没有退路。** 同一名称下有多条 `v=prodid0` 记录就是错误，而不是从中挑一条；单独一条格式错误或过长的记录也是错误。没有回退：一旦存在记录，失效的记录会直接终止发现，而不是让抓取程序转去查看你的域名。如果要更换主机，请替换记录，绝不要再加第二条。语法和测试向量见[规范](/spec#the-_prodid-txt-record)。',
			answer:
				'**什么才算有效响应。** 最多一次重定向后返回 HTTP 200、JSON 内容类型、能通过 feed schema 校验的正文，以及指明被发现域名的 `domain`。对未知路径返回 HTML 网页和 200 的网站不算响应，以 `text/html` 提供的文档也不算。',
		},
		routes: {
			heading: '选择发布方式',
			lead: '身份与托管是分开的。你的身份是一个你控制的域名；文档实际放在哪里，只是一个以后可以更改的细节，不会改变你的身份，也不会改变 prodid 分配给你产品的任何标识符。三种方式，产生的记录完全相同。',
			route: (n: string) => `方式 ${n}`,
			detail: (n: string) => `方式 ${n} 详解 →`,
			start: '从 publish.prodid.org 开始 →',
			identity: '身份',
			trust: '可信度',
			items: [
				{
					when: '你可以在自己的域名上提供文件。',
					who: '有 IT 团队的品牌，或为其托管的每个商户发布的平台：电商、ERP、PIM。',
					how: '在域名上提供发现文档，并发布一条指向域名本身的 TXT 记录。',
					identity: '域名',
				},
				{
					when: '你有域名，但无法在上面提供文件。',
					who: '网站搭建在自己无法控制的平台上的制造商。',
					how: '在托管的 slug 上发布，并让你域名上的一条 TXT 记录指向那台主机。',
					identity: '经 DNS 证明的域名',
				},
				{
					when: '你完全没有域名。',
					who: '小型生产者或合作社。',
					how: '在托管的 slug 上发布。以后再添加域名，不会丢失任何东西。',
					identity: 'slug 主机',
				},
			],
			hosted:
				'方式 2 和 3 使用位于 `<slug>.prodid.org` 的托管发布服务。用发送到你邮箱的链接登录 [publish.prodid.org](https://publish.prodid.org/)，创建站点、上传文件，有域名的话再连接域名。你可以随时在那里导出全部内容或删除站点。',
		},
		table: {
			field: '字段',
			required: '必填',
			what: '含义',
			yes: '是',
			no: '否',
			delegating: '委托时',
		},
		own: {
			copy: '复制',
			copied: '已复制',
			eyebrow: '方式 1',
			heading: '在自己的域名上发布',
			lead: '两个文件加一条 DNS 记录。代表商户发布的平台在每个商户域名上做同样的事，因此每个商户都保有自己的身份和可信度等级。',
			step1: '第 1 步 — 提供发现文档',
			step1Lead: (url: string) => `一个位于固定路径的文件，列出你的产品 feed 在哪里：\`${url}\``,
			feedCaption: 'spec/fixtures/v1/examples/prodid.json 中的示例，直接由该文件渲染。',
			feedTable: '发现文档字段',
			feedFields: [
				'固定为 org.prodid.feed。',
				'1。值为 0 的文档在 2027-01-26 00:00 UTC 之前开始的抓取中被接受，之后被拒绝，视为明确否定。',
				'人们在你的声明旁边应当看到的名称。',
				'一个真正有人看的邮箱。当你的来源进入 lapse 时，索引会写信到这里，这是你唯一会收到的提醒。',
				'涵盖你 feed 中信息的 SPDX 标识符，例如 CC0-1.0。',
				'最多 100 个 https URL，全部与本文档位于同一主机。',
				'本文档代表的域名。只要是通过指向其他主机的 TXT 记录找到本文档，就必须填写，并且必须等于该域名。由域名自己提供文档时可选，但如果填写，仍须一致。',
			],
			serve:
				'通过 HTTPS 在默认端口、使用有效证书，以 `application/json` 或任何 `application/…+json` 提供。不要重定向到其他主机：抓取程序只跟随一种重定向，即从 `acme.example` 到 `www.acme.example`。',
			step2: '第 2 步 — 提供 feed',
			step2Lead:
				'feed 是 NDJSON：每行一个完整的 JSON 对象，UTF-8，以换行分隔。外面不包数组，行与行之间没有逗号。这样，两百万件产品的 feed 也能逐行流式读取，一行出错只损失那一行，不影响其余部分。',
			itemsCaption:
				'来自 spec/fixtures/v1/examples/items.ndjson 的同一产品的三个变体。它们共享一个 group，因此索引据此构建一个包含三个变体的系列。',
			sameHost:
				'**feed 必须与列出它们的文档位于同一主机。** 发现文档若列出其他主机上的 feed，会被整体拒绝而非部分拒绝：你失去的是整个来源，而不只是一个 feed，并且这算作明确否定，会启动下文所述的 lapse 计时。从你的网站提供 JSON、从单独的 CDN 主机名提供 NDJSON 是很常见的需求，但 v1 不支持。请把两者放在同一主机上。',
			firstLine: '其中第一行，排版后便于阅读：',
			itemLabel: '一条 org.prodid.item 记录',
			itemTable: '单品记录字段',
			itemFields: [
				'固定为 org.prodid.item。',
				'这条记录在 feed 中的稳定名称。再次发布相同的 key 会替换它。',
				'产品上显示的品牌。它在限定 mpn 的范围之前会先被规范化，所以 ARÇELİK 和 Arçelik 是同一个品牌，而不是两个。',
				'产品名称，不含变体维度。',
				'至少一个 { scheme, value }，并且至少有一个是索引能保存的。值两端不能有空白，也不能为空。gtin 必须是 8、12、13 或 14 位数字，校验位正确，且不能全为零；mpn 需要一个能规范化出内容的 brand，因为它只在该范围内唯一；限定流通的 gtin 会被保留，但只作为你自己的 rcn。一条没有任何可保存内容的记录不标识任何东西，会被跳过。',
				'本记录中供人阅读的文本所用的 BCP 47 标签。',
				'你自己的分组键。共享同一个值的单品是同一系列的变体。',
				'在组内区分这个单品的维度：颜色、尺码、容量。',
				'GS1 GPC 细分代码，写作 gpc: 加八位数字。',
				'该单品销售市场的 ISO 3166-1 alpha-2 代码。',
				'字符串、数字、布尔值、列表，或表示测量值的 { value, unit }。',
				'最多 20 个 https URL，每个都带一个 kind 和一个来自可接收列表的 SPDX 许可。与 feed 不同，它们可以位于任何主机。',
			],
			flat: '发送扁平的单品。你从不需要自己构建系列或变体，也从不发送 `opid`：前者由索引从 `group` 推导，后者由索引分配。如果你已经在生成 Google Merchant feed，`group` 就是你的 `item_group_id`。',
			barcodes:
				'导出之前，关于条形码有两点值得了解。全为零的 `gtin` 不是条形码，而是目录占位符，带有它的记录会像校验位错误一样被拒绝。[限定流通编码](/spec#which-gtins-are-identifiers)，即店内使用的号段，会被保存并归属于你，但它在全球范围内不标识任何东西，因此永远不会把你的产品与别人的合并，`/01/` 也不会解析它。',
			step3: '第 3 步 — 在 DNS 中认领身份',
			step3Lead: '文件上线后，发布一条把你自己的域名作为主机的记录。',
			step3Why:
				'它指向的正是发现过程本来就会找到的地方，所以你的数据不会有任何变化。变化的是：只拥有 DNS 添加权限的人能做什么。没有记录时，他们添加的一条记录会悄无声息地夺走你的身份，因为 DNS 优先于文件。而你的记录已经存在时，第二条记录会让发现以“*多于一条记录*”失败：这是一次 lapse，可见、会通知、可恢复。',
			neverDelegate:
				'**绝不要把 `_prodid` 委托给供应商。** 对 `_prodid.<domain>` 的写权限就是对你身份的控制，和 DKIM 或 ACME DNS-01 验证完全一样。DNS 共享的域名，身份也是共享的。给代理商 feed，不要给记录。',
			order:
				'先上线文件，再添加记录，不要反过来：指向尚不存在的文档的记录就是一次失败的发现。值的读取不区分大小写，末尾多一个点也没关系，所以 `ACME.Example.` 和 `acme.example` 是同一个主机。',
			step4: '第 4 步 — 通知索引已有变更',
			step4Lead: '可选。每个已知域名都会按计划重新抓取，ping 只是让下一次抓取提前。',
			pingLabel: '请索引立即运行发现',
			ping: '`{"domains": [...]}` 一次最多接受 1000 个，平台就是这样介绍它托管的每个商户的。不需要发送任何密钥，因为 ping 不赋予调用者任何左右内容的能力，而且它只会回答 `202`。它不会告诉你该域名是否已知、是否找到了内容，也不会告诉你一分钟前是否有别人 ping 过它。`429` 只表示*你*超出了自己的请求配额，错误以 `application/problem+json` 返回。你的域名发生了什么，会显示在你的[来源状态](#after)里，而不是在 ping 的响应中。',
		},
		delegated: {
			eyebrow: '方式 2',
			heading: '委托托管，保留身份',
			lead: '很多制造商拥有域名，却无法在上面放文件。feed 托管在别处，域名用 DNS 证明，所以来源身份仍然是域名，可信度仍然是 `verified`。在 [publish.prodid.org](https://publish.prodid.org/) 创建站点并输入你的域名，它会显示需要添加的确切记录，并替你检查。',
			looks: '具体是什么样',
			steps: [
				'**上传到托管 slug 的目录**，例如 `acme.prodid.org`，它同时提供发现文档和 feed。',
				'**你所拥有域名上的一条 TXT 记录**，指向那台主机。是主机而不是 URL，因此记录永远无法把抓取程序引向任意地址。',
				'**一份回指你域名的文档。** DNS 说“*我的文档在那边*”；文档说“*我代表那个域名*”。没有 `domain` 的委托文档会被拒绝：缺失永远不会被当作同意，正是这一点阻止了任何人把记录指向别人的 feed。',
			],
			caption: '来自 spec/fixtures/v1/examples/prodid.delegated.json。与方式 1 唯一的区别是 domain 字段，而且在这里它是必填的。',
			window:
				'托管发布服务只有在亲自看到你的 TXT 记录之后，才会把 `domain` 写进文档，因此不存在某个文档认领了一个并未提出请求的域名的时间窗口。',
		},
		hosted: {
			eyebrow: '方式 3',
			heading: '没有域名也能发布',
			lead: '完全没有域名的生产者，以自己的名义在托管 slug `<slug>.prodid.org` 上发布。在 [publish.prodid.org](https://publish.prodid.org/) 申请一个。来源身份是 slug 主机，可信度是 `unverified`，因为没有证明任何关于域名的事情。这些记录是真正的记录：标识符、解析、来源归属一应俱全。',
			merchant:
				'处于这种情况的发布者大多已经有一份 [Google Merchant](https://support.google.com/merchants/answer/7052112) 产品文件，所以规范中逐列写明了从这种文件到 `org.prodid.item` 记录的映射，也写明了它有意舍弃的内容：价格、库存、配送和成色属于某一天的某个卖家，而不属于产品。导出之前值得先读一读[导入 Merchant feed](/spec#appendix-importing-a-merchant-feed)：publish.prodid.org 正是按照这个映射转换你上传的 CSV 或 TSV。其中有四点决定了你的表格应该是什么样子：',
			rules: [
				'**四列会成为变体维度**：`color`、`size`、`material` 和 `pattern`，也就是买家在同一个 `item_group_id` 内挑选的那些。`gender`、`age_group`、`size_type` 和 `size_system` 仍是普通属性：它们描述的是整个组，如果作为维度，只要有人把其中一个写成两种写法，一件产品就会被拆成好几件。',
				'**重复属性用逗号分隔还是用重复表头，按文件决定，而不是按单元格。** 只有当某列的表头在整个文件中只出现一次时，单元格才会按逗号拆分；重复表头，则其下每个单元格都整体读取。这是携带含逗号值的唯一方式，而且这个决定对整个文件只做一次。它适用于 `additional_image_link`、`product_type`、`product_highlight`、`product_detail` 和 `certification`；其余一切，包括满是逗号的 `description`，无论哪种情况都整体读取。',
				'**`product_detail` 从不覆盖任何内容。** 它中间的子属性成为属性键，节名被丢弃，同一个键以第一个值为准。之后出现的同键 detail，或落在映射已生成的键上的 detail，会被丢弃并连同所在行一起报告，所以 detail 列永远无法悄悄改写这一行其余部分说过的内容。',
				'**必须声明媒体许可。** Merchant 格式没有对应的列，而且[没有许可就不会接收任何内容](/spec#licences-that-can-be-ingested)，因此一次导入要声明一个可接收的 SPDX 标识符，涵盖文件中的所有图片和文档。你自己的 `license` 列会逐行覆盖它；声明的许可不可接收的文件，会生成不带媒体的记录，而不是失败的记录。',
			],
			skipped:
				'无法成为记录的行（没有可用标识符、GTIN 校验位错误）会被跳过，并按表格行号报告，表头算第 1 行，所以一行出错只损失那一行，不影响整个导入。[`/spec/fixtures/merchant`](/spec/fixtures/merchant) 中有一份可供对照的完整示例：一个 CSV、它必须生成的记录，以及必须被跳过的那一行。',
			later:
				'对今天的决定而言，重要的是以后会发生什么。在你日后取得的域名上添加一条指向同一主机的 TXT 记录，下一次抓取时 slug 就会变成该域名：**同一个来源，同一批记录，每个 `opid` 都保留**，可信度从 `unverified` 升到 `verified`。你的 `sku` 标识符绑定的是来源本身而不是它的名称，所以迁移后依然有效。在 publish.prodid.org 上，用的就是方式 2 的那个域名字段。',
		},
		trust: {
			heading: '这里的可信度是什么意思',
			lead: '可信度是来源的属性，而不是某条声明的属性。它说明关于“谁在说话”已经证明了什么，却不说明某条信息是否正确。如何对待它，由数据的使用者决定。',
			table: '可信度等级',
			level: '等级',
			meaning: '含义',
			levels: [
				'已证明域名控制权，并已确认品牌所有权。',
				'已通过 TXT 记录或由域名提供文档证明域名控制权。',
				'没有域名的托管 slug、数据集导入或社区贡献。',
			],
			only: '只有身份是域名的来源，才可能高于 `unverified`。`verified` 来自抓取。`authoritative` 则不是，因为任何抓取都无法证明品牌归谁：它由索引的运营者授予，而且只凭证据授予。',
			rules: [
				{
					title: '证据是你的 GS1 厂商识别代码前缀。',
					body: '你的来源以该品牌发布的 GTIN，其 GS1 厂商识别代码前缀必须授权给控制你域名的组织，以 GS1 公开的“Verified by GS1”查询结果为准。该查询的 URL 会作为证据与授权一起保存。',
				},
				{
					title: '一项授权只对应一个品牌，每项都可以撤销。',
					body: '品牌以其[规范化](/spec#brand-normalization)后的形式记录。一个来源可以持有多个品牌的授权，运营者会分别撤销。',
				},
				{
					title: '授权不会比它所依据的证明活得更久。',
					body: '只要同时满足以下三点，你的来源就是 `authoritative`：其域名控制权已证明、它没有 [lapsed](/spec#lapse)、并且至少持有一项未被撤销的授权。失去域名证明或进入 lapse，它会立刻降到剩余证明所支持的等级：lapse 期间为 `verified`，若域名证明也没了则更低，无需任何人操作。三点再次满足时，它立即恢复为 `authoritative`。',
				},
				{
					title: '它覆盖的是来源，而不是品牌。',
					body: '可信度始终是来源的属性：一个品牌的授权会让你的来源的每条声明都成为 `authoritative`，包括关于它没有授权的品牌的声明。',
				},
			],
			ask: `如需申请，请先在自己的域名上发布，然后[通过申请表提出](${CONTACT.authoritative})，写明你的域名、品牌，以及该品牌某个 GTIN 的 Verified by GS1 查询结果。运营者会在 Verified by GS1 中核对你的来源以该品牌发布的 GTIN。申请是公开的。`,
		},
		after: {
			heading: '发布之后',
			edit: {
				title: '修改记录就是编辑一行。',
				body: '用已存在的 key 发布记录会替换之前的那条。没有更新接口，因为 feed 本身就是状态。',
			},
			remove: {
				title: '删除一行撤回的是你的声明，而不是产品。',
				body: '如果一个 key 从抓取程序完整获取的 feed 中消失，你关于它的声明会被标记为已撤回。实体及其标识符依然保留：别人指向它的链接继续有效，其他来源的声明也一样。',
			},
			retire: {
				title: '从文档中移除一个 feed URL，会立即将其停用。',
				body: '当抓取读到的文档不再列出你的某个 feed URL 时，该 feed 承载的每条有效记录都会立即撤回，就像它所有的 key 都消失了一样，而且该 URL 不会再被获取。下文的七天宽限期在这里不适用：移除 URL 就等于你说文件已经没了，索引会照你说的办。以后再列出它，它就会回来，并从头读取。如果可以，请为文档提供 `ETag`：`304` 表示列表没有变化，因此不会停用任何东西。',
			},
			broken: {
				title: '一行损坏会把撤回推迟七天，但不会让它失效。',
				body: '超过 64 KiB、无法解析或无效的行会被跳过并计数。由于被跳过行的 key 未知，含有跳过行的 feed 在七天内不会撤回任何内容。之后，缺失的 key 照常撤回。计数是公开的，所以一个悄悄丢行的 feed 并不会悄无声息。',
			},
			unreadable: {
				title: '抓取程序读不了的 feed 并非没有代价。',
				body: '只有当*文档列出的一切*都被读取时，抓取才算成功：一份可接受的文档，并且其中每个 feed 都返回 `200` 或 `304`。一个 feed 超时不会让你失去其他 feed（已响应的 feed 会被接收，失败的抓取不会撤回任何内容），但这次抓取会被算作传输失败，你的状态中的 `feeds_failed` 会如实显示。因此，一份完全健康的文档只要挂着一个永久失效的 feed URL，就会和一个彻底不再响应的域名一样，按同样的七天计时进入 lapse，并在此后三十天失去整个目录。不再提供的 feed URL 应当从文档中删除，而不是任其荒废。',
			},
			lapse: {
				title: '如果发现不再成功，你的来源就会进入 lapse。',
				body: [
					'**明确否定**，即发现过程结束时没有可接受的文档（既无记录也无文档；记录格式错误、过长或重复；或者文档不是 200、不是 JSON、无效、在 `domain` 上不再一致，或列出了其主机之外的 feed），会让来源立即进入 lapse。**传输失败**（DNS 超时、5xx、429、达到上限，无论发生在文档还是任何 feed 上）本身不会改变任何事，但如果连续七天每次尝试都以此告终，你也会进入 lapse，所以一直返回错误并不能把你的声明冻结在原处。',
					'**这种“疑罪从无”属于主机，而不属于你。** 它只适用于你的来源已经在其上验证过的主机。在从未验证过的主机上（新的 slug、你刚把 `_prodid` 指过去的主机、方式 2 和 3 下的一切），任何失败，包括超时和 5xx，都是明确否定，会让你立即进入 lapse。这是有意的：否则，一个已验证的来源可以把记录指向一台它不控制的主机，再根据 lapse 是今天开始还是一周后开始，判断出那台主机是否在线。更换主机并不会因此让你付出任何代价。在新主机上的第一次成功抓取会清除一切，而在任何内容被撤回之前的 30 天里，lapse 始终可以恢复。',
					'进入 lapse 的来源不再接受新的声明，会向读者显示为 lapsed，其 `publisher.contact` 会收到通知。对 lapse 来源的抓取在完全成功之前不会写入任何内容；只有那时 lapse 才会解除。连续 lapse 30 天后，你的**记录及其有效声明会一并撤回**，作为历史保留。这 30 天是你的恢复窗口，所以联系地址必须是有人会看的。',
					'回来不需要做任何改动。像往常一样提供同样的文档和同样的 feed，在发现成功的那一刻，你发布的一切都会被重新确认，不管有没有改动一个字节：在没有保存你任何有效内容期间，索引会放弃条件请求，所以一个没变的文件永远不会成为继续处于撤回状态的理由。',
				],
			},
			seen: {
				title: '`seen_at` 是持续的断言，长时间 lapse 会将其重置。',
				body: '读者看到的每条声明都带有 `seen_at`：不是这条信息最早在何处发布，而是*这个来源从何时起不间断地断言这个值*。每次重新抓取找到相同的值时，它都会保留下来，这正是它的意义。它不会在撤回后保留。如果你的来源 lapse 超过 30 天，你发布的每条信息的日期都会从你回来的那天重新开始，因为在空档期内没有任何可验证的人为它们负责。被撤回的行会保留，所以 `?history=1` 会显示这段空档而不是掩盖它；[读者会看到什么](/spec#an-entity)写在规范里。',
			},
			status: {
				title: '你的来源有一个公开的状态页。',
				body: '`/source/acme.example` 是你发现问题的地方：上一次抓取的结果、发现走了哪条路径、多少条记录发生了变化、跳过了多少行、多少个 feed 无法读取，以及你是否处于 lapse、从何时开始。它只报告你的域名发布了什么、索引何时查看过，从不报告是谁请求了抓取。',
			},
			media: {
				title: '媒体会被检测而不是被信任，一个坏条目只影响它自己。',
				sniffed:
					'类型通过读取字节来判定；你的 `Content-Type` 只是提示。只保存六种类型，别无其他：JPEG、PNG、GIF、WebP 和 AVIF 作为 `image`，PDF 作为 `document`。不接受 SVG、HTML、压缩包和 Office 文件：规格书请以 PDF 发布。检测到的类型必须与条目的 `kind` 一致，否则该条目会被跳过。',
				table: '媒体上限',
				what: '项目',
				cap: '上限',
				caps: ['单张图片', '单个文档', '单次媒体获取', '一条记录中的媒体条目'],
				licence:
					'在获取任何内容之前，许可会作为字符串进行检查，并且必须恰好是七个 SPDX 标识符之一：也就是允许任何人原样再分发该文件的那些，而索引对它做的正是这件事：',
				licences: '可接收的媒体许可',
				entry:
					'这里的一切都按条目计算。被拒绝、过大或无法访问的条目只损失它自己：**你的记录绝不会因为媒体而无效**，其他声明照常成立，任何媒体失败都不会让你进入 lapse。它会计入 `media_failed`，并在下次抓取该记录时重试。有一点与 feed 正好相反：同主机规则在这里*不*适用，所以你的图片可以放在 CDN 上。[接收哪些内容](/spec#what-is-ingested)和[许可列表](/spec#licences-that-can-be-ingested)给出了理由。',
			},
			others: {
				title: '其他来源也会发布关于你产品的信息。',
				body: '零售商、注册机构、开放数据集和贡献者都是和其他人一样的来源。他们的声明归属于他们自己，绝不会覆盖你的；你们意见不一时，两条声明都会连同各自来源并列显示。',
			},
		},
		toc: '本页内容',
		question: '你打算如何发布？',
		reference: '参考',
		details: '详情与字段参考',
		go: '创建你的站点',
		done: '将此步骤标为已完成',
		progress: '已完成 {n} / {total} 步',
		check: {
			heading: '检查你的域名',
			lead: '发布完成了吗？输入你的域名。索引会立即去查看它，然后你会进入它的实时状态页。',
			label: '你的域名',
			placeholder: 'acme.example',
			button: '检查',
			working: '检查中…',
			invalid: '只输入主机名，例如 acme.example：不要 https://，不要路径。',
			limited: '你的网络请求过多。请稍等片刻再试。',
			failed: '索引没有接受这个请求。请一分钟后重试。',
			note: '下一次抓取会在几分钟内更新状态。',
			looks: '检查会看什么',
			noscript: '没有 JavaScript 时，请直接打开状态页：',
		},
		checklist: {
			heading: '上线之前',
			items: [
				'发现返回 HTTP 200、JSON 内容类型，以及能通过 feed schema 校验的正文，而不是以 200 返回的 HTML“未找到”网页。',
				'_prodid.<你的域名> 上恰好有一条 v=prodid0 TXT 记录。两条是错误，格式错误的一条也是错误。',
				'这条记录是 v=prodid0; host=<hostname>。是主机，绝不是 URL：没有协议、没有端口、没有路径。',
				'feeds 中的每个 URL 都是 https，并且与列出它的发现文档位于同一主机。',
				'feeds 中的每个 URL 都仍在提供。无法获取的 feed 会让整次抓取失败，持续七天就会让来源进入 lapse。',
				'委托文档带有 "domain"，等于它所代表的域名。',
				'发现文档以 application/json 提供，并且不会重定向到其他主机。',
				'feed 和文档都发送 ETag 或 Last-Modified，这样未变化的文件只需一个 304。',
				'feed 的每一行都是小于 64 KiB 的完整 JSON 对象，UTF-8，以换行分隔，没有外层数组，也没有结尾逗号。',
				'每个 key 都是稳定的，绝不会复用于其他产品。',
				'每个 gtin 只含数字，校验位正确，且不全为零。',
				'每个标识符的值都去掉了首尾空白，每条记录都至少保留一个索引能保存的标识符，这意味着 mpn 需要 brand。',
				'每个媒体条目的 kind 都与其实际字节相符，并带有七个可接收 SPDX 许可之一，否则该条目会被跳过。',
				'任何记录都不包含 opid。opid 由索引分配。',
				'publisher.contact 是有人会看的地址。',
			],
			check: 'ping 之前先检查文件',
			checkLead:
				'`prodid-batch check` 完全按照索引的方式校验你的发现文档和每个 feed，不需要 token，也不向索引询问任何东西。它在仓库的克隆中用 [Bun](https://bun.sh) 1.4.4 运行。把文件本身交给它：以 `.json` 结尾的路径按单个文档读取，其他路径按 NDJSON feed 读取。',
			checkLabel: '像索引一样校验你提供的内容',
			checkResult:
				'没有问题的文件会输出 `ok`，以及索引会从中获取的记录数。否则，每个问题输出一行，格式为 `items.ndjson:12: message`，带上所在的 feed 行号，并以非零状态退出。它读的是文件，而不是你的 DNS 或服务器，所以上面清单中的 TXT 记录、内容类型和缓存头仍需你自己检查。',
			rules:
				'记录校验所依据的规则在[规范](/spec)中，schema 位于 [`/spec/schemas/v1`](/spec/schemas/v1)，[`/spec/fixtures/v1`](/spec/fixtures/v1) 中有机器可读的测试向量，可以在任何人抓取之前用来测试你的导出程序。',
			status: '现状：',
			formats: '本页的文件格式，就是你 ping 索引时它读取的格式。',
		},
	},

	data: {
		title: '开放数据 — prodid',
		description:
			'下载整个 prodid 索引：每晚一次的转储，以 gzip NDJSON 包含每个来源、实体、记录、分组和合并；索引生成的内容采用 CC0，声明采用各来源自己的许可。',
		eyebrow: '开放数据',
		heading: '下载索引',
		lead: '索引是可替换的。凡是它知道、而读者可以知道的一切，都以完整导出即转储的形式发布，任何人都可以下载并加载到自己的索引中。',
		latest: {
			heading: '最新转储',
			before: '构建本页时，最新的转储是拍摄于',
			after: ' 的快照。每晚 04:30 UTC 会写入一个新的转储，',
			names: '始终指向最新的那一个。',
			lines: (count: string) => `${count} 行`,
			per: (what: string) => `每个${what}一行。`,
			directory: (directory: string, manifest: string, created: string, index: string, claims: string) =>
				`这个转储的目录是 \`${directory}\`，其清单是 [\`manifest.json\`](${manifest})，写入于 ${created}。其许可为 \`index: ${index}\` 和 \`claims: ${claims}\`。`,
		},
		holds: {
			'sources.ndjson.gz': { per: '来源', line: '来源的状态，与 /source/{name} 的返回完全相同。' },
			'entities.ndjson.gz': {
				per: '实体（含已合并的）',
				line: '实体文档，与 /id/{opid}?history=1 的返回完全相同，包含已撤回的声明。',
			},
			'records.ndjson.gz': {
				per: '记录（含已撤回的）',
				line: 'source, key, feed, opid, body, first_seen, last_seen, withdrawn_at.',
			},
			'groupings.ndjson.gz': { per: '分组', line: 'source, kind, key, opid.' },
			'merges.ndjson.gz': { per: '合并（含已撤销的）', line: 'from, into, decided_at, reverted_at.' },
		},
		layout: {
			heading: '转储存放在哪里',
			lead: '一个转储是一个以其快照的 UTC 日期命名的目录，放在它所用版本的目录下。`v1/` 存放 v1 转储，其清单以及来源行和实体行都是 v1 文档。其中包含五个数据文件和一个清单。',
			last: '**latest.json 最后写入。** 它是最新转储的 `manifest.json` 的副本，在该转储的每个文件和清单都就位之后才写入。从它开始读取的人，永远不会遇到清单列出了一个尚不存在的文件，并且能根据清单自身的 `snapshot_at` 找到目录。',
			retention:
				'**保留。** 每日转储保留 7 天。每个 UTC 月份的第一个转储永久保留。被保留的转储永不改写：它的目录、文件和清单逐字节保持原样。',
			v0: (dumps: string, latest: string) =>
				`**v0 转储。** v1 之前写入的 v0 转储仍保存在 \`${dumps}\` 下，保留规则相同，[\`v0/latest.json\`](${latest}) 继续指向其中最后一个。它们会一直符合 v0 schema。`,
			manifest: (schema: string) =>
				`**清单。** 它对五个文件各列一次，给出文件以压缩形式提供时的 SHA-256 和大小，以及解压后的行数。加载前请用摘要校验每个文件。schema 是 [\`${schema}\`](${schema})，测试向量在 [\`/spec/fixtures/v1/dump\`](/spec/fixtures/v1/dump)。`,
		},
		files: {
			heading: '每个文件包含什么',
			lead: '每个文件都是用 gzip 压缩的 NDJSON，每行一个 JSON 对象。五个文件都读取自同一个一致的快照，因此彼此吻合：任何一行提到的每个来源都在 `sources.ndjson.gz` 中有自己的行，任何一行提到的每个 `opid` 都在 `entities.ndjson.gz` 中有自己的行。',
			table: '转储文件',
			columns: ['文件', '每行对应', '行内容'],
			merged: '已合并的实体',
			mergedBody:
				'已合并的 `opid` 在解析器上返回 `308`，所以它没有可复制的自身文档。它的那一行，是假如没被合并时它会返回的文档（它自己的标识符和声明仍留在它身上，这正是合并可以撤销的原因），外加一个成员 `merged_into`，即保留实体的 `opid`。合并不会形成链条：保留的实体本身从不会被合并。',
			record: '记录行',
			recordLead: '索引所保存的一条记录。所有时间均为 UTC，ISO 8601。',
			recordTable: '记录行字段',
			recordColumns: ['字段', '含义'],
			recordFields: [
				'来源的名称。',
				'记录在该来源中的 key。',
				'读取它的 feed 的 URL。由数据集导入写入的记录没有此字段。',
				'它解析到的单品。',
				'发布者发送的 org.prodid.item，原样保存。',
				'索引首次读取它的时间。',
				'索引最后一次读取它的时间。',
				'仅在记录被撤回时出现。',
			],
			grouping: '分组行',
			groupingLead:
				'某个来源的分组解析到了哪个实体。`kind` 是 `family` 或 `variant`，`key` 是该来源的记录据以分组的内容，以明文写出而不是摘要，以便其他实现能把自己的分组与之对应。',
			groupingNotes: ['用于发布者分组；没有分组的记录本身构成一个系列，写作 { "key": "<key>" }。', '记录的变体，没有时为 {}。'],
			familyKey: '{ "family": <系列的 key>, "variant": { <维度>: <值>, … } }',
			merge: '合并行',
			mergeBody:
				'一次合并决定：`from` 是被合并的 `opid`，`into` 是保留的实体，`decided_at` 是作出决定的时间，`reverted_at` 仅在合并被撤销时出现。',
		},
		never: {
			heading: '转储中永远不会包含的内容',
			lead: '转储所说的不会多于解析器已经说出的内容，外加构建这些回答所依据的记录、分组和合并。',
			items: [
				'发布者的联系地址，索引保存它只是为了发送 lapse 通知。',
				'抓取日志、抓取程序的错误文本，或来源状态中没有显示的任何其他抓取信息。',
				'为什么进行某次合并，或由谁决定。',
				'为什么某个媒体哈希被屏蔽。',
				'媒体的字节。媒体声明的 media_url 指向文件，被屏蔽的哈希不会被提供。',
				'索引内部的行标识符。每一行都用名称指代来源，用 opid 指代实体。',
				'权威授权及其证据。如果某来源在 snapshot_at 时是 authoritative，它的那一行会这样写，但从转储加载的索引在其运营者作出授权之前不持有任何授权。',
			],
		},
		licences: {
			heading: '许可',
			lead: '两条规则，清单中的 `licenses` 两者都写明了。',
			index: '索引生成的一切',
			indexBody: '`opid`、标识符映射、系列与变体层级、分组和合并。',
			claims: '每条声明和每条记录',
			claimsBody:
				'采用其来源自己声明的许可：即该来源在 `sources.ndjson.gz` 中那一行的 `license`。没有声明许可的来源什么也没有授予，prodid 也不会代表它授予任何东西。',
			datasets:
				'没有发布自己发现文档的开放数据集，会以名为 `dataset:<slug>` 的来源进入索引，由索引的运营者从该数据集的公开导出中导入。这样的来源始终是 `unverified`，其 `license` 就是数据集自己的许可。规则见[规范](/spec#dataset-sources)。',
		},
		load: {
			heading: '加载到你自己的索引',
			lead: '`prodid-batch load-dump` 会在一个事务中，把 v0 或 v1 转储加载到一个已迁移到相同版本的空 PostgreSQL 18 数据库。它接受转储的日期目录、`manifest.json` 或 `latest.json`，可以是本地的，也可以通过 HTTPS。',
			label: '在仓库的克隆中',
			checked:
				'在写入任何内容之前，每个文件都会按清单中的 `sha256`、`bytes` 和 `lines` 进行校验，远程转储会先下载到临时目录。非空数据库会被拒绝。`PRODID_OPERATOR` 会被记录为所加载合并的决定者。',
			peek: '若只想读取文件而不加载，先按摘要校验，再解压。下面的摘要，是构建本页时最新清单中的摘要。',
			rules: '完整规则见规范中的 [Dumps](/spec#dumps) 一节。',
		},
	},
}
