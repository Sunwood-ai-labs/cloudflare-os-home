import { useRef, useEffect, useState } from 'react'
import { Editor } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import { defineGadgetsCodeTheme, getGadgetsCodeTheme, monoFont } from './components/monacoTheme'
import { getLanguage } from './getLanguage'
import { useTheme } from './ThemeContext'

interface CodeEditorProps {
  filename: string | null
  ytext: Y.Text | null
  isReady: boolean
  height?: string | number
}

export default function CodeEditor({ filename, ytext, isReady, height = '100%' }: CodeEditorProps) {
  const { resolvedThemeMode } = useTheme()
  const codeTheme = getGadgetsCodeTheme(resolvedThemeMode)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)
  const [editorReady, setEditorReady] = useState(false)

  // Set up Monaco binding when editor and ytext are available.
  // When ytext is transiently null (e.g., streaming doc rebuild), the binding
  // is detached but the Monaco editor stays mounted — no blank flash.
  useEffect(() => {
    const ed = editorRef.current
    const monaco = monacoRef.current

    if (!ed || !monaco || !ytext || !editorReady) {
      return
    }

    // Get or create a model for this file
    const model = ed.getModel()
    if (!model) {
      return
    }

    // Create the binding between Y.Text and Monaco
    // The binding will sync the Y.Text content to the Monaco model
    const binding = new MonacoBinding(
      ytext,
      model,
      new Set([ed])
    )
    bindingRef.current = binding

    return () => {
      // Clean up binding when component unmounts or ytext changes
      binding.destroy()
      bindingRef.current = null
    }
  }, [ytext, editorReady])

  // Handle editor mount
  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
    editorRef.current = editor
    monacoRef.current = monaco
    setEditorReady(true)
  }

  if (!filename) {
    return (
      <div
        className="flex justify-center items-center bg-kumo-base text-kumo-subtle"
        style={{ height }}
      >
        Select a file to start editing
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height }}>
      <Editor
        height="100%"
        language={getLanguage(filename)}
        defaultValue=""
        beforeMount={defineGadgetsCodeTheme}
        onMount={handleEditorDidMount}
        theme={codeTheme}
        options={{
          automaticLayout: true,
          fontSize: 13,
          lineHeight: 20,
          letterSpacing: 0,
          fontFamily: monoFont,
          fontLigatures: false,
          minimap: { enabled: false },
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          renderLineHighlight: 'none',
          selectOnLineNumbers: true,
          roundedSelection: false,
          readOnly: !isReady,
          cursorStyle: 'line',
          autoIndent: 'full',
          formatOnPaste: true,
          formatOnType: true,
          suggest: {
            snippetsPreventQuickSuggestions: false
          },
          tabSize: 2,
          insertSpaces: true,
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'mouseover',
          unfoldOnClickAfterEndOfLine: false,
          lineDecorationsWidth: 12,
          lineNumbersMinChars: 4,
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          renderWhitespace: 'none',
          guides: {
            indentation: false,
            highlightActiveIndentation: false,
          },
          occurrencesHighlight: 'off',
          selectionHighlight: false,
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
            useShadows: false,
          },
          contextmenu: true,
          mouseWheelZoom: true
        }}
      />
    </div>
  )
}
