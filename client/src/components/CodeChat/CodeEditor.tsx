import { useContext } from 'react';
import * as monaco from 'monaco-editor';
import { ThemeContext } from '@librechat/client';
import Editor, { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
import EditorLoading from './EditorLoading';

// Bundle workers locally: private source never depends on a public editor CDN.
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'json') return new JsonWorker();
    if (['css', 'scss', 'less'].includes(label)) return new CssWorker();
    if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker();
    if (['typescript', 'javascript'].includes(label)) return new TsWorker();
    return new EditorWorker();
  },
};
loader.config({ monaco });

export default function CodeEditor({
  name,
  value,
  readOnly,
  onChange,
  label,
}: {
  name: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  label: string;
}) {
  const { resolvedMode, highContrast } = useContext(ThemeContext);
  let theme = resolvedMode === 'dark' ? 'vs-dark' : 'vs';
  if (highContrast) theme = resolvedMode === 'dark' ? 'hc-black' : 'hc-light';
  return (
    <div className="h-full overflow-hidden" data-testid="personal-code-editor">
      <Editor
        path={name}
        value={value}
        theme={theme}
        loading={<EditorLoading />}
        beforeMount={(editor) => editor.editor.setTheme(theme)}
        onChange={(next) => onChange(next ?? '')}
        keepCurrentModel={false}
        options={{
          readOnly,
          ariaLabel: label,
          lineNumbers: 'on',
          minimap: { enabled: false },
          fontSize: 13,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: 'on',
          stickyScroll: { enabled: false },
          accessibilitySupport: 'auto',
        }}
      />
    </div>
  );
}
