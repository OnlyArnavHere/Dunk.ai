'use client'

import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { EditorView } from '@codemirror/view'
import { useTheme } from 'next-themes'

const languageFor = (language: string) => {
  switch (language) {
    case 'c':
    case 'cpp':
      return [cpp()]
    case 'python':
      return [python()]
    case 'javascript':
      return [javascript()]
    case 'typescript':
      return [javascript({ typescript: true })]
    default:
      return []
  }
}

const baseTheme = EditorView.theme({
  '&': { fontSize: '13px', backgroundColor: 'transparent' },
  '.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid hsl(var(--border) / 0.5)' },
  '.cm-content': { fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)' },
  '&.cm-focused': { outline: 'none' },
})

export default function CodeEditor({
  value,
  language,
  onChange,
  readOnly = false,
}: {
  value: string
  language: string
  onChange: (code: string) => void
  readOnly?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const extensions = useMemo(() => [...languageFor(language), baseTheme, EditorView.lineWrapping], [language])

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      readOnly={readOnly}
      editable={!readOnly}
      maxHeight="560px"
      basicSetup={{ foldGutter: true, highlightActiveLine: !readOnly, autocompletion: true }}
    />
  )
}
