import { diffXml, summarizeDiff } from '@/lib/xml-diff'

describe('diffXml', () => {
  it('shows no changes for identical XML', () => {
    const xml = '<root><element>value</element></root>'
    const diff = diffXml(xml, xml)
    expect(diff.addedCount).toBe(0)
    expect(diff.removedCount).toBe(0)
    expect(diff.unchangedCount).toBeGreaterThan(0)
  })

  it('detects added lines', () => {
    const diff = diffXml('line1\nline2', 'line1\nnew line\nline2')
    expect(diff.addedCount).toBe(1)
    expect(diff.removedCount).toBe(0)
  })

  it('detects removed lines', () => {
    const diff = diffXml('line1\nremoved\nline2', 'line1\nline2')
    expect(diff.addedCount).toBe(0)
    expect(diff.removedCount).toBe(1)
  })

  it('detects changed lines as remove+add', () => {
    const diff = diffXml('line1\nold value\nline3', 'line1\nnew value\nline3')
    expect(diff.addedCount).toBe(1)
    expect(diff.removedCount).toBe(1)
  })

  it('handles empty strings', () => {
    const diff = diffXml('', '')
    expect(diff.addedCount).toBe(0)
    expect(diff.removedCount).toBe(0)
  })

  it('handles A empty B non-empty', () => {
    const diff = diffXml('', 'new content')
    expect(diff.addedCount).toBe(1)
    expect(diff.removedCount).toBe(0)
  })

  it('handles A non-empty B empty', () => {
    const diff = diffXml('old content', '')
    expect(diff.addedCount).toBe(0)
    expect(diff.removedCount).toBe(1)
  })

  it('returns correct line numbers', () => {
    const diff = diffXml('a\nb\nc', 'a\nb\nc')
    expect(diff.lines[0].lineNumber).toBe(1)
    expect(diff.lines[2].lineNumber).toBe(3)
  })
})

describe('summarizeDiff', () => {
  it('returns No changes for identical content', () => {
    const diff = diffXml('same', 'same')
    expect(summarizeDiff(diff)).toBe('No changes')
  })

  it('describes additions', () => {
    const diff = diffXml('', 'new')
    expect(summarizeDiff(diff)).toContain('added')
  })

  it('describes removals', () => {
    const diff = diffXml('old', '')
    expect(summarizeDiff(diff)).toContain('removed')
  })

  it('describes both additions and removals', () => {
    const diff = diffXml('old', 'new')
    const summary = summarizeDiff(diff)
    expect(summary).toContain('added')
    expect(summary).toContain('removed')
  })
})
