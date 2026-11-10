declare module 'virtual:ai-cache' {
  import type { AIRun } from '@/domain/model'

  const runs: readonly AIRun[]
  export default runs
}
