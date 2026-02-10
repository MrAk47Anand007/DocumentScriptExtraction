/**
 * monaco-loader.js
 *
 * Thin wrapper around Monaco Editor loaded from unpkg CDN.
 * Exposes three globals used by scripts_dashboard.js:
 *   initMonaco(containerId, initialContent)
 *   getEditorContent()  -> string
 *   setEditorContent(content)
 *
 * Monaco is initialised lazily on the first initMonaco() call.
 */

/* global require */

require.config({
    paths: { vs: 'https://unpkg.com/monaco-editor@0.45.0/min/vs' }
});

let _editor = null;
let _pendingContent = null;   // content set before editor was ready

window.initMonaco = function (containerId, initialContent) {
    require(['vs/editor/editor.main'], function () {
        const container = document.getElementById(containerId);
        if (!container) return;

        _editor = monaco.editor.create(container, {
            value: initialContent || '',
            language: 'python',
            theme: 'vs-dark',
            fontSize: 14,
            minimap: { enabled: false },
            automaticLayout: true,   // handles window/panel resize
            wordWrap: 'off',
            scrollBeyondLastLine: false,
            renderLineHighlight: 'line',
            tabSize: 4,
            insertSpaces: true,
        });

        // Apply any content that was set before the editor loaded
        if (_pendingContent !== null) {
            _editor.setValue(_pendingContent);
            _pendingContent = null;
        }
    });
};

window.getEditorContent = function () {
    return _editor ? _editor.getValue() : '';
};

window.setEditorContent = function (content) {
    if (_editor) {
        _editor.setValue(content);
    } else {
        // Editor not ready yet — store for when it initialises
        _pendingContent = content;
    }
};
