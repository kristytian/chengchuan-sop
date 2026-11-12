// AI pre-run: computes inputs from the library model, calls Claude for the
// entries that are missing or stale, checks each answer, and writes one
// record per entry to ai-cache/<task>/. An answer that fails the checks is
// sent back once with the errors; the record keeps them (AIRun.correction). Reads only samples/ and
// scenario-inputs/ through the library loader.
//
//   npm run ai:prerun -- <impact|references|extract|all> [--dry-run] [--force] [--only <text>]
//
// The npm script loads ANTHROPIC_API_KEY from .env when the file exists.
//
// impact = 影响分析 per impact item; references = one implicit reference against
// candidates; extract = every reference of one library file (整篇抽引用).
//
// --dry-run prints the first pending prompt of each task and the input size,
// without credentials and without calling the API.
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractionSubject,
  impactAnalysisInput,
  impactChangeForAI,
  impactSubject,
  inputHash,
  PROMPT_VERSIONS,
  referenceDirectory,
  referenceExtractionInput,
  referenceSuggestionInput,
} from '../../src/domain/ai-inputs.ts'
import { analyzeChange, deriveLibraryModel } from '../../src/domain/library-model.ts'
import type { AIRun, AITask } from '../../src/domain/model.ts'
import { loadSampleLibrary } from '../../vite-plugins/import/library.ts'
import { asUserData, correctionRequest, EXTRACTION_SCHEMA, EXTRACTION_SYSTEM, IMPACT_SCHEMA, IMPACT_SYSTEM, REFERENCE_SCHEMA, REFERENCE_SYSTEM } from './prompts.ts'
import { type Checked, checkExtraction, checkImpact, checkReference } from './validate.ts'

const MODEL = 'claude-opus-5-5'
const EFFORT = 'high'
const CONCURRENCY = 4
// Claude Opus 5.5 list prices per million tokens (cache write = 1.25 × input), for the run summary only.
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }

const root = join(import.meta.dirname, '..', '..')
const cacheDir = join(root, 'ai-cache')

interface Job {
  task: AITask
  subject: string
  file: string
  inputVersions: string[]
  hash: string
  /** Shared, cacheable context first; the per-entry data last. */
  system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
  user: string
  /** With `retry`, the model sees its own first answer and the check errors, and answers again. */
  call: (client: Anthropic, job: Job, retry?: Retry) => Promise<{ checked: Checked<unknown>; response: ParsedResponse }>
}

type ParsedResponse = Awaited<ReturnType<Anthropic['beta']['messages']['parse']>>

interface Retry {
  previous: ParsedResponse
  errors: string[]
}

const args = process.argv.slice(2)
const task = args.find((a) => !a.startsWith('--')) ?? 'all'
const flag = (name: string) => args.includes(`--${name}`)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined
const TASKS: Record<string, () => Job[]> = { impact: impactJobs, references: referenceJobs, extract: extractionJobs }
if (task !== 'all' && !(task in TASKS)) {
  console.error('usage: npm run ai:prerun -- <impact|references|extract|all> [--dry-run] [--force] [--only <text>]')
  process.exit(1)
}

const model = deriveLibraryModel(loadSampleLibrary(root).library)
const jobs = Object.entries(TASKS)
  .filter(([name]) => task === 'all' || task === name)
  .flatMap(([, build]) => build())
  .filter((j) => !only || j.subject.includes(only))
const pending = jobs.filter((j) => flag('force') || !isCurrent(j))
console.log(`[ai-prerun] ${jobs.length} entries, ${pending.length} to run (${jobs.length - pending.length} current in ai-cache/)`)

if (flag('dry-run')) {
  for (const t of new Set(pending.map((j) => j.task))) {
    const sample = pending.find((j) => j.task === t)!
    const chars = pending.filter((j) => j.task === t).reduce((n, j) => n + j.system.reduce((m, s) => m + s.text.length, 0) + j.user.length, 0)
    console.log(`\n===== ${t}: ${pending.filter((j) => j.task === t).length} pending, ~${chars} input characters in total`)
    console.log(`----- first: ${sample.subject}\n----- system:\n${sample.system.map((s) => s.text).join('\n\n')}\n----- user:\n${sample.user}`)
  }
  process.exit(0)
}

if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error('[ai-prerun] ANTHROPIC_API_KEY is missing or empty (npm run ai:prerun reads it from .env); nothing was called.')
  process.exit(1)
}
const client = new Anthropic()
const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const failures: string[] = []
await pool(pending, CONCURRENCY, async (job) => {
  try {
    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    // Counted before the checks: a rejected answer was still paid for.
    const count = (u: ParsedResponse['usage']) => {
      usage.inputTokens += u.input_tokens
      usage.outputTokens += u.output_tokens
      usage.cacheReadTokens += u.cache_read_input_tokens ?? 0
      usage.cacheWriteTokens += u.cache_creation_input_tokens ?? 0
      totals.input += u.input_tokens
      totals.output += u.output_tokens
      totals.cacheRead += u.cache_read_input_tokens ?? 0
      totals.cacheWrite += u.cache_creation_input_tokens ?? 0
    }
    let { checked, response } = await job.call(client, job)
    count(response.usage)
    let correction: AIRun['correction']
    if (!checked.ok) {
      correction = { errors: checked.errors }
      console.log(`[ai-prerun] retry ${job.subject}: sending ${checked.errors.length} check error(s) back once`)
      ;({ checked, response } = await job.call(client, job, { previous: response, errors: checked.errors }))
      count(response.usage)
    }
    if (!checked.ok) throw new Error(`answer failed checks${correction ? ' after one correction' : ''}: ${checked.errors.join('; ')}`)
    const record: AIRun = {
      task: job.task,
      subject: job.subject,
      inputVersions: job.inputVersions,
      inputHash: job.hash,
      promptVersion: PROMPT_VERSIONS[job.task],
      model: MODEL,
      servedBy: response.model,
      mode: 'cache',
      runAt: new Date().toISOString(),
      output: checked.value,
      usage,
      stopReason: response.stop_reason,
      ...(correction ? { correction } : {}),
    }
    mkdirSync(join(cacheDir, job.task), { recursive: true })
    writeFileSync(job.file, `${JSON.stringify(record, null, 2)}\n`)
    console.log(`[ai-prerun] ok    ${job.subject}${correction ? '  (corrected once)' : ''}${response.model !== MODEL ? `  (served by ${response.model})` : ''}`)
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('[ai-prerun] authentication failed — set ANTHROPIC_API_KEY or run `ant auth login`, then retry')
      process.exit(1)
    }
    const kind = error instanceof Anthropic.APIError ? `${error.constructor.name} ${error.status ?? ''}`.trim() : 'Error'
    failures.push(`${job.subject}: ${kind}: ${(error as Error).message}`)
    console.error(`[ai-prerun] FAIL  ${job.subject}: ${kind}: ${(error as Error).message}`)
  }
})

const cost = (totals.input * PRICE.input + totals.output * PRICE.output + totals.cacheRead * PRICE.cacheRead + totals.cacheWrite * PRICE.cacheWrite) / 1e6
console.log(
  `[ai-prerun] done: ${pending.length - failures.length} written, ${failures.length} failed; tokens in ${totals.input} / out ${totals.output} / cache read ${totals.cacheRead} / cache write ${totals.cacheWrite}; ≈ $${cost.toFixed(2)} at ${MODEL} list price`,
)
if (failures.length > 0) process.exit(1)

function impactJobs(): Job[] {
  return model.changes.flatMap((change) => {
    const { diff, impact } = analyzeChange(model, change)
    const changeInput = impactChangeForAI(change, diff, model.catalog)
    const sharedText = asUserData('变更', changeInput)
    return impact.map((item): Job => {
      const version = model.catalog.versions.find((v) => v.key === item.version)!
      const input = impactAnalysisInput(changeInput, item, model.catalog, model.references)
      const subject = impactSubject(change, version)
      return {
        task: 'impactAnalysis',
        subject,
        file: join(cacheDir, 'impactAnalysis', `${safeName(subject)}.json`),
        inputVersions: [
          ...(change.source.kind === 'revision' ? [change.source.oldVersion, change.source.newVersion] : []),
          item.version,
        ],
        hash: inputHash(input),
        system: [{ type: 'text', text: IMPACT_SYSTEM }, { type: 'text', text: sharedText, cache_control: { type: 'ephemeral' } }],
        user: asUserData('受影响文件', input.target),
        call: async (c, job, retry) => {
          const response = await parse(c, job, IMPACT_SCHEMA, retry)
          return { response, checked: checkImpact(response.parsed_output, input) }
        },
      }
    })
  })
}

function referenceJobs(): Job[] {
  return model.references
    .filter((r) => r.kind === 'implicit')
    .map((ref): Job => {
      const input = referenceSuggestionInput(ref, model.catalog)
      return {
        task: 'referenceSuggestion',
        subject: ref.id,
        file: join(cacheDir, 'referenceSuggestion', `${safeName(`${input.citing.code}_${input.citing.clause}`)}_${inputHash(ref.id).slice(0, 8)}.json`),
        inputVersions: [ref.from.version],
        hash: inputHash(input),
        system: [{ type: 'text', text: REFERENCE_SYSTEM }],
        user: asUserData('引用', input),
        call: async (c, job, retry) => {
          const response = await parse(c, job, REFERENCE_SCHEMA, retry)
          return { response, checked: checkReference(response.parsed_output, input) }
        },
      }
    })
}

function extractionJobs(): Job[] {
  const directory = referenceDirectory(model.catalog)
  const sharedText = asUserData('文件目录', directory)
  return model.catalog.versions
    .filter((v) => v.origin === 'library' && v.document)
    .map((v): Job => {
      const input = referenceExtractionInput(v, directory)
      const subject = extractionSubject(v)
      return {
        task: 'referenceExtraction',
        subject,
        file: join(cacheDir, 'referenceExtraction', `${safeName(subject)}.json`),
        inputVersions: [v.key],
        hash: inputHash(input),
        system: [{ type: 'text', text: EXTRACTION_SYSTEM }, { type: 'text', text: sharedText, cache_control: { type: 'ephemeral' } }],
        user: asUserData('待分析文件', input.document),
        call: async (c, job, retry) => {
          const response = await parse(c, job, EXTRACTION_SCHEMA, retry)
          return { response, checked: checkExtraction(response.parsed_output, input) }
        },
      }
    })
}

async function parse(
  c: Anthropic,
  job: Job,
  schema: typeof IMPACT_SCHEMA | typeof REFERENCE_SCHEMA | typeof EXTRACTION_SCHEMA,
  retry?: Retry,
): Promise<ParsedResponse> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: job.user }]
  if (retry) {
    // The first answer goes back as it came (thinking blocks unchanged), minus the SDK's own parsed copy.
    const blocks: Anthropic.Beta.BetaContentBlock[] = retry.previous.content
    const previous = blocks.map((b) => (b.type === 'text' ? { type: 'text' as const, text: b.text } : b))
    messages.push({ role: 'assistant', content: previous }, { role: 'user', content: correctionRequest(retry.errors) })
  }
  const response = await c.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: EFFORT, format: jsonSchemaOutputFormat(schema) },
    system: job.system,
    messages,
  })
  if (response.stop_reason === 'refusal') throw new Error(`refused (${response.stop_details?.category ?? 'no category'})`)
  if (response.stop_reason === 'max_tokens') throw new Error('hit max_tokens before finishing')
  return response
}

function isCurrent(job: Job): boolean {
  if (!existsSync(job.file)) return false
  const run = JSON.parse(readFileSync(job.file, 'utf8')) as AIRun
  return run.inputHash === job.hash && run.promptVersion === PROMPT_VERSIONS[job.task]
}

function safeName(text: string): string {
  return text.replace(/[^A-Za-z0-9._@-]+/g, '_')
}

async function pool<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await work(items[next++])
    }),
  )
}
