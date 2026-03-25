export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  lineNumber: number
}

export interface DiffResult {
  lines: DiffLine[]
  addedCount: number
  removedCount: number
  unchangedCount: number
}

export function diffXml(xmlA: string, xmlB: string): DiffResult {
  const linesA = xmlA === '' ? [] : xmlA.split('\n')
  const linesB = xmlB === '' ? [] : xmlB.split('\n')
  const m = linesA.length
  const n = linesB.length

  // LCS dynamic programming table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack
  const ops: Array<{ type: 'added' | 'removed' | 'unchanged'; content: string }> = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      ops.unshift({ type: 'unchanged', content: linesA[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'added', content: linesB[j - 1] })
      j--
    } else {
      ops.unshift({ type: 'removed', content: linesA[i - 1] })
      i--
    }
  }

  let addedCount = 0
  let removedCount = 0
  let unchangedCount = 0
  const lines: DiffLine[] = ops.map((op, idx) => {
    if (op.type === 'added') addedCount++
    else if (op.type === 'removed') removedCount++
    else unchangedCount++
    return { ...op, lineNumber: idx + 1 }
  })

  return { lines, addedCount, removedCount, unchangedCount }
}

export function summarizeDiff(diff: DiffResult): string {
  if (diff.addedCount === 0 && diff.removedCount === 0) return 'No changes'
  const parts: string[] = []
  if (diff.addedCount > 0) parts.push(`${diff.addedCount} line${diff.addedCount !== 1 ? 's' : ''} added`)
  if (diff.removedCount > 0) parts.push(`${diff.removedCount} line${diff.removedCount !== 1 ? 's' : ''} removed`)
  return parts.join(', ')
}
