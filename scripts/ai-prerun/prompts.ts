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

/** The input as JSON, after a one-line label, so the model reads it as data. */
export const asUserData = (label: string, data: unknown) => `${label}（JSON）：\n${JSON.stringify(data, null, 2)}`
