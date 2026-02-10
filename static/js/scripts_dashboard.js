document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const scriptList = document.getElementById('scriptList');
    const newScriptBtn = document.getElementById('newScriptBtn');
    const codeEditor = document.getElementById('codeEditor');
    const currentScriptName = document.getElementById('currentScriptName');
    const saveScriptBtn = document.getElementById('saveScriptBtn');
    const runScriptBtn = document.getElementById('runScriptBtn');
    const buildList = document.getElementById('buildList');
    const consoleOutput = document.getElementById('consoleOutput');

    let activeScriptId = null;

    // Initialization
    loadScriptList();

    // Event Listeners
    newScriptBtn.addEventListener('click', () => {
        const name = prompt('Enter script name (e.g., my_script.py):');
        if (name) {
            createNewScript(name);
        }
    });

    scriptList.addEventListener('click', (e) => {
        const item = e.target.closest('.script-item');
        if (item) {
            selectScript(item.dataset.id);
        }
    });

    saveScriptBtn.addEventListener('click', () => {
        if (activeScriptId) {
            saveScript(activeScriptId, codeEditor.value);
        }
    });

    runScriptBtn.addEventListener('click', () => {
        if (activeScriptId) {
            runScript(activeScriptId);
        }
    });

    buildList.addEventListener('click', (e) => {
        const item = e.target.closest('.build-item');
        if (item) {
            document.querySelectorAll('.build-item').forEach(b => b.classList.remove('selected'));
            item.classList.add('selected');
            loadBuildOutput(activeScriptId, item.dataset.id);
        }
    });

    // Functions
    async function loadScriptList() {
        try {
            const response = await fetch('/api/scripts');
            const scripts = await response.json();

            scriptList.innerHTML = '';
            scripts.forEach(script => {
                const li = document.createElement('li');
                li.className = `script-item ${script.id === activeScriptId ? 'active' : ''}`;
                li.dataset.id = script.id;
                li.textContent = script.name;
                scriptList.appendChild(li);
            });
        } catch (error) {
            console.error('Error loading scripts:', error);
        }
    }

    async function createNewScript(name) {
        try {
            const response = await fetch('/api/scripts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, content: '# New script\nprint("Hello World")' })
            });

            if (response.ok) {
                const data = await response.json();
                loadScriptList();
                selectScript(data.id);
            }
        } catch (error) {
            alert('Error creating script');
        }
    }

    async function selectScript(id) {
        activeScriptId = id;

        // Update UI
        document.querySelectorAll('.script-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === id);
        });

        saveScriptBtn.disabled = false;
        runScriptBtn.disabled = false;

        // Load Content
        try {
            const response = await fetch(`/api/scripts/${id}`);
            const data = await response.json();

            if (response.ok) {
                codeEditor.value = data.content;
                currentScriptName.textContent = data.name;
                loadBuildHistory(id);
            }
        } catch (error) {
            codeEditor.value = 'Error loading content';
        }
    }

    async function saveScript(id, content) {
        try {
            saveScriptBtn.textContent = 'Saving...';
            await fetch('/api/scripts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: id, content: content })
            });
            setTimeout(() => saveScriptBtn.textContent = 'Save', 500);
        } catch (error) {
            alert('Error saving');
            saveScriptBtn.textContent = 'Save';
        }
    }

    async function runScript(id) {
        try {
            runScriptBtn.textContent = 'Running...';
            runScriptBtn.disabled = true;
            consoleOutput.textContent = 'Running...';

            const response = await fetch(`/api/scripts/${id}/run`, { method: 'POST' });
            const data = await response.json();

            if (response.ok) {
                consoleOutput.textContent += '\nDone. Loading output...';
                loadBuildHistory(id); // Reload list
                loadBuildOutput(id, data.build_id); // Show output immediately
            } else {
                consoleOutput.textContent = 'Error starting run: ' + data.error;
            }
        } catch (error) {
            consoleOutput.textContent = 'Network Error';
        } finally {
            runScriptBtn.textContent = 'Run';
            runScriptBtn.disabled = false;
        }
    }

    async function loadBuildHistory(id) {
        try {
            const response = await fetch(`/api/builds/${id}`);
            const builds = await response.json();

            buildList.innerHTML = '';
            if (builds.length === 0) {
                buildList.innerHTML = '<div class="empty-state" style="padding: 1rem; font-size: 0.8rem;">No builds yet</div>';
                return;
            }

            builds.forEach(build => {
                const div = document.createElement('div');
                div.className = 'build-item';
                div.dataset.id = build.id;
                // format timestamp
                const date = new Date(build.timestamp * 1000);
                div.innerHTML = `
                <span>#${build.id.split('_').pop()}</span>
                <span style="color: #64748b">${date.toLocaleTimeString()}</span>
               `;
                buildList.appendChild(div);
            });
        } catch (e) {
            console.error(e);
        }
    }

    async function loadBuildOutput(scriptId, buildId) {
        try {
            const response = await fetch(`/api/builds/output/${scriptId}/${buildId}`);
            const data = await response.json();
            if (response.ok) {
                consoleOutput.textContent = data.output;
            }
        } catch (e) {
            consoleOutput.textContent = 'Error loading output';
        }
    }
});
