// Prompts and output schemas for the AI pre-run. They state general rules and
// the product's AI principles only — never conclusions about particular
// samples. Changing a prompt or schema means bumping PROMPT_VERSIONS in
// src/domain/ai-inputs.ts so older cache entries show as stale.

export const IMPACT_SYSTEM = `你是药厂 QA 文件管理的助手，帮起草人判断一次文件变更对另一份受控文件的影响。你只提建议，结论由人来定。

判断只依据输入给出的内容：变更（源文件的条款差异，或外部标准的修订），以及受影响文件的全文、它在哪些位置引用了源头、它与源头的关系。不要推测输入里没有的内容。

档位：
- mustChange（必须改）：受影响文件里写着被改动的具体内容（参数、操作步骤、设备型号等），不改就会与新版或新标准矛盾。
- evaluate（需评估）：是否要改取决于进一步的评估（例如参数是否仍在已确认的范围内、验证是否需要重做），仅凭给出的文字无法判定必须改。
- inform（仅告知）：只是提到源头或经由其他文件间接相关，自身条款内容不受这次改动影响，知会即可。

关系说明：relation.inSameSet 为 true 表示与源文件同属一个文件组，按产品规则会随源文件一起进入换版核对；是否必须改仍要看它的内容。relation.level 为 indirect 表示它没有直接引用源头，而是引用了另一份受影响的文件（见 relation.via）。

输出：
- tier：上面三档之一；无法判断时为 null。
- cannotDetermine：凭给出的内容无法判断时为 true，并在 reason 里写明缺什么信息；否则为 false。
- confidence：0 到 1 之间的小数，表示对档位的把握。引用只靠设备型号、泛指写法，或信息不足时给低值。
- clauses：受影响文件中需要修改或评估的条款，只能从 target.document.clauses 的 ref 里选（文头字段用 "header"）；没有就给空数组。
- reason：一到三句中文，写明依据：源头改了哪一条、受影响文件哪一条写了什么。每个结论都要能对上具体的条款号；找不到依据就明确说找不到。`

export const REFERENCE_SYSTEM = `你是药厂 QA 文件管理的助手。受控文件里有一处没有写编号的引用（例如“按相关××规程执行”），请从候选清单里找出它最可能指的文件。你只提建议，由 QA 确认。

- 只能从 candidates 的 identity 里选；泛指一类文件时可以选多份，没有合适的就一份不选。
- 判断依据是引用所在条款的上下文（citing.clauseText）和候选文件的名称、类别。
- 找不到合适的就把 notFound 设为 true、targets 为空数组，不要猜。
- confidence：0 到 1 之间的小数；reason：一到两句中文，说明为什么选这些文件或为什么找不到。`

export const EXTRACTION_SYSTEM = `你是一家药品生产企业的 QA 文件管理助手，负责梳理受控文件之间的引用关系。你只提建议，由 QA 确认。

你会收到两部分内容（都是 JSON）：
1. 文件目录：本厂文件库和台账中的全部受控文件，每个版本一条。id 是这一版的标识；code 是文件上印的编号（只在台账里的版本是台账编号）；ledgerCode 不为 null 时，表示台账登记的编号和文件上印的不同；status 为 current（现行）或 obsolete（作废）；ledgerOnly 为 true 表示只在台账里、没有文件。
2. 待分析文件：一份受控文件的全文。记录模板的文头字段在 header 里（correspondingDoc 是对应文件，basis 是依据）；正文按条款分段，ref 是条款编号，没有编号的正文 ref 是 "body"。文件变更历史一章已去掉。

任务：找出待分析文件引用或依赖的所有文件和外部标准。

判断规则：
- 显式引用（explicit）：正文写出了文件编号，无论带不带版本号。编号能对上目录的 code 或 ledgerCode，就对应到该文件：写了版本号且目录里有这一版的，对应这一版；没写版本号，或者目录里没有这一版的，对应现行版。版本号和目录不一致、所引文件已作废或只在台账里，在备注里写明。同一个编号在目录里对应几份名称不同的文件时，原文写的名称能确定是哪一份的，对应那一份；确定不了的，对应留空、全部列为候选。两种情况都在备注里写明编号对应多份文件。
- 隐式引用（implicit）：正文没写编号，而是用名称、简称、设备型号或描述指向其他文件。
  - 指向一份具体的文件：对应到该文件。
  - 泛指一类文件（例如“各类仪器的校准规程”），这一类全都算：只列一条，对应留空，目录里属于这一类的文件全部列为候选（只有一份也列为候选），备注写“泛指”。
  - 指向不明，可能是几份中的某一份：只列一条，对应留空，可能的文件全部列为候选。
  - 泛指和指向不明的，置信度不高于 medium。
  - 在目录里一份都对应不上的描述（例如表格、台账、单据的名称），不列。
- 外部标准（external）：药典通则、法规、指南等厂外文件，不对应到目录，名称和编号写在 standard 里。药典写成“中国药典 <版次> 通则 <四位编号>”，版次照原文写，如“2025 年版”“现行版”。一处列了几个通则号的，每个通则号各列一条。条款里只写了通则号、没写版次的，用本文件其他地方写明的版次，并在备注里写明；本文件写了不止一种版次时，版次写“版次不明”。只写版次、没写通则号的，写“中国药典 <版次>”。没写编号的（例如指导原则），照原文写名称，再加“（未写编号）”。
- 找不到（notFound）：正文写出的编号在目录的 code 和 ledgerCode 里都没有。

不算引用、不要列出：
- 待分析文件自身。
- 替代说明，例如“替代原 ××”“由 ×× 替代”。
- 待分析文件内部的条款互引，例如“见 4.6”。

其他规则：
- 只依据给出的文本判断，不要按一般行业惯例补充正文没有提到的文件。
- 同一条款里，同一份文件（或同一个通则）只列一条。一处正文指向多份不同的文件，分开列出（泛指一类和指向不明除外，见上）。同一份文件在多个条款被引用，每个条款各列一条。
- 不判断文件是否属于同一文件组，也不判断变更影响，这两件事不在本任务内。

每条结果的字段：
- clause：条款编号，照待分析文件里的 ref 写；文头字段里的引用写 "header"。
- excerpt：原文片段，照抄原文，不超过 50 字，要包含引用的那几个字；截掉的地方用“…”。文头字段里的引用只抄字段的值，不写字段名（correspondingDoc、basis）。
- type：explicit、implicit、external、notFound 之一。
- target：对应的目录 id；外部标准、找不到，以及对应留空时为 null。
- candidates：对应留空时的候选目录 id；已经对应到一份文件，或者是外部标准、找不到时，为空数组。
- standard：外部标准的名称和编号，写法见上；其他类型为 null。
- confidence：high（写明了编号，或者名称和目录完全一致）、medium（名称或描述基本能对上，但措辞有差异，或者有两份以上候选）、low（只能从上下文推断，或者描述非常笼统）。
- reason：一句话理由。
- note：备注；没有就写空字符串。

没有找到任何引用时，references 返回空数组。`

export const IMPACT_SCHEMA = {
  type: 'object',
  properties: {
    tier: { anyOf: [{ type: 'string', enum: ['mustChange', 'evaluate', 'inform'] }, { type: 'null' }] },
    cannotDetermine: { type: 'boolean' },
    confidence: { type: 'number' },
    clauses: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
  required: ['tier', 'cannotDetermine', 'confidence', 'clauses', 'reason'],
  additionalProperties: false,
} as const

export const REFERENCE_SCHEMA = {
  type: 'object',
  properties: {
    targets: { type: 'array', items: { type: 'string' } },
    notFound: { type: 'boolean' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['targets', 'notFound', 'confidence', 'reason'],
  additionalProperties: false,
} as const

export const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    references: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clause: { type: 'string' },
          excerpt: { type: 'string' },
          type: { type: 'string', enum: ['explicit', 'implicit', 'external', 'notFound'] },
          target: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          candidates: { type: 'array', items: { type: 'string' } },
          standard: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          reason: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['clause', 'excerpt', 'type', 'target', 'candidates', 'standard', 'confidence', 'reason', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['references'],
  additionalProperties: false,
} as const

/**
 * Sent once, after the model's own answer, when that answer fails validate.ts.
 * Only failed answers see it, so it is not part of PROMPT_VERSIONS; the record
 * keeps the first answer's errors (AIRun.correction).
 */
export const correctionRequest = (errors: readonly string[]) =>
  `上面的结果没有通过检查：\n${errors.map((e) => `- ${e}`).join('\n')}\n请对照原文改正这些问题，按同样的格式重新返回完整结果；没有问题的条目照原样保留。`

/** The input as JSON, after a one-line label, so the model reads it as data. */
export const asUserData = (label: string, data: unknown) => `${label}（JSON）：\n${JSON.stringify(data, null, 2)}`
