document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const scriptList = document.getElementById('scriptList');
    const newScriptBtn = document.getElementById('newScriptBtn');
    const currentScriptName = document.getElementById('currentScriptName');
    const saveScriptBtn = document.getElementById('saveScriptBtn');
    const runScriptBtn = document.getElementById('runScriptBtn');
    const buildList = document.getElementById('buildList');
    const consoleOutput = document.getElementById('consoleOutput');

    // Webhook panel elements
    const webhookPanel = document.getElementById('webhookPanel');
    const webhookUrlBox = document.getElementById('webhookUrlBox');
    const copyWebhookBtn = document.getElementById('copyWebhookBtn');
    const regenWebhookBtn = document.getElementById('regenWebhookBtn');

    // Schedule panel elements
    const schedulePanel = document.getElementById('schedulePanel');
    const scheduleEnabled = document.getElementById('scheduleEnabled');
    const cronInput = document.getElementById('cronInput');
    const saveScheduleBtn = document.getElementById('saveScheduleBtn');
    const clearScheduleBtn = document.getElementById('clearScheduleBtn');
    const nextRunLabel = document.getElementById('nextRunLabel');

    let activeScriptId = null;

    // Script name lookup: UUID -> display name (filename)
    let scriptNames = {};

    // Initialization
    initMonaco('monacoContainer', '# Select or create a script to start coding...');
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
            saveScript(activeScriptId, getEditorContent());
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

    copyWebhookBtn.addEventListener('click', () => {
        const url = webhookUrlBox.textContent;
        if (!url || url === '—') return;
        navigator.clipboard.writeText(url).then(() => {
            copyWebhookBtn.textContent = 'Copied!';
            setTimeout(() => copyWebhookBtn.textContent = 'Copy', 1500);
        });
    });

    regenWebhookBtn.addEventListener('click', async () => {
        if (!activeScriptId) return;
        if (!confirm('Regenerate webhook token? The old URL will stop working immediately.')) return;
        try {
            const resp = await fetch(`/api/scripts/${activeScriptId}/webhook/regenerate`, { method: 'POST' });
            const data = await resp.json();
            if (resp.ok) {
                setWebhookUrl(data.webhook_token);
            }
        } catch (e) {
            alert('Error regenerating token');
        }
    });

    saveScheduleBtn.addEventListener('click', async () => {
        if (!activeScriptId) return;
        const cron = cronInput.value.trim();
        const enabled = scheduleEnabled.checked;
        if (enabled && !cron) {
            alert('Enter a cron expression before enabling the schedule.');
            return;
        }
        try {
            saveScheduleBtn.textContent = 'Saving...';
            const resp = await fetch(`/api/scripts/${activeScriptId}/schedule`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cron, enabled }),
            });
            const data = await resp.json();
            if (resp.ok) {
                setNextRunLabel(data.next_run_time);
                saveScheduleBtn.textContent = 'Saved';
                setTimeout(() => saveScheduleBtn.textContent = 'Save', 1500);
            } else {
                alert(data.error || 'Error saving schedule');
                saveScheduleBtn.textContent = 'Save';
            }
        } catch (e) {
            alert('Error saving schedule');
            saveScheduleBtn.textContent = 'Save';
        }
    });

    clearScheduleBtn.addEventListener('click', async () => {
        if (!activeScriptId) return;
        if (!confirm('Remove the schedule for this script?')) return;
        try {
            await fetch(`/api/scripts/${activeScriptId}/schedule`, { method: 'DELETE' });
            cronInput.value = '';
            scheduleEnabled.checked = false;
            setNextRunLabel(null);
        } catch (e) {
            alert('Error clearing schedule');
        }
    });

    // Functions

    function buildWebhookUrl(token) {
        return `${window.location.origin}/webhooks/${token}`;
    }

    function setWebhookUrl(token) {
        if (!token) {
            webhookUrlBox.textContent = '—';
            return;
        }
        webhookUrlBox.textContent = buildWebhookUrl(token);
        webhookUrlBox.title = buildWebhookUrl(token);
    }

    function setNextRunLabel(nextRunTime) {
        if (!nextRunTime) {
            nextRunLabel.textContent = '';
            return;
        }
        const d = new Date(nextRunTime);
        nextRunLabel.textContent = `Next run: ${d.toLocaleString()}`;
    }

    async function loadSchedule(id) {
        try {
            const resp = await fetch(`/api/scripts/${id}/schedule`);
            if (!resp.ok) return;
            const data = await resp.json();
            cronInput.value = data.schedule_cron || '';
            scheduleEnabled.checked = data.schedule_enabled || false;
            setNextRunLabel(data.next_run_time);
            schedulePanel.classList.add('visible');
        } catch (e) {
            console.error('Error loading schedule:', e);
        }
    }

    async function loadScriptList() {
        try {
            const response = await fetch('/api/scripts');
            const scripts = await response.json();

            scriptNames = {};
            scriptList.innerHTML = '';
            scripts.forEach(script => {
                scriptNames[script.id] = script.name;
                const li = document.createElement('li');
                li.className = `script-item ${script.id === activeScriptId ? 'active' : ''}`;
                li.dataset.id = script.id;  // UUID
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
                await loadScriptList();
                selectScript(data.id);  // data.id is now a UUID
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

        // Load Content (id is UUID)
        try {
            const response = await fetch(`/api/scripts/${id}`);
            const data = await response.json();

            if (response.ok) {
                setEditorContent(data.content);
                currentScriptName.textContent = data.name;
                loadBuildHistory(id);

                // Show webhook panel with this script's token
                setWebhookUrl(data.webhook_token);
                webhookPanel.classList.add('visible');

                // Load schedule settings
                loadSchedule(id);
            }
        } catch (error) {
            setEditorContent('# Error loading content');
        }
    }

    async function saveScript(id, content) {
        // id is UUID; look up the script filename to send as the name field
        const scriptName = scriptNames[id] || id;
        try {
            saveScriptBtn.textContent = 'Saving...';
            await fetch('/api/scripts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: scriptName, content: content })
            });
            setTimeout(() => saveScriptBtn.textContent = 'Save', 500);
        } catch (error) {
            alert('Error saving');
            saveScriptBtn.textContent = 'Save';
        }
    }

    // Track active EventSource so we can close it if user runs again
    let activeEventSource = null;

    async function runScript(id) {
        // Close any existing stream
        if (activeEventSource) {
            activeEventSource.close();
            activeEventSource = null;
        }

        runScriptBtn.textContent = 'Running...';
        runScriptBtn.disabled = true;
        consoleOutput.textContent = '';

        let response, data;
        try {
            response = await fetch(`/api/scripts/${id}/run`, { method: 'POST' });
            data = await response.json();
        } catch (error) {
            consoleOutput.textContent = 'Network Error: could not start run';
            runScriptBtn.textContent = 'Run';
            runScriptBtn.disabled = false;
            return;
        }

        if (!response.ok) {
            consoleOutput.textContent = 'Error: ' + (data.error || 'Unknown error');
            runScriptBtn.textContent = 'Run';
            runScriptBtn.disabled = false;
            return;
        }

        const buildId = data.build_id;

        // Open SSE stream for real-time output
        const es = new EventSource(`/api/builds/${buildId}/stream`);
        activeEventSource = es;

        es.onmessage = (event) => {
            if (event.data === '[DONE]') {
                es.close();
                activeEventSource = null;
                runScriptBtn.textContent = 'Run';
                runScriptBtn.disabled = false;
                loadBuildHistory(id);
                return;
            }
            consoleOutput.textContent += event.data;
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        };

        es.onerror = () => {
            es.close();
            activeEventSource = null;
            runScriptBtn.textContent = 'Run';
            runScriptBtn.disabled = false;
            loadBuildHistory(id);
        };
    }

    async function loadBuildHistory(id) {
        // id is UUID
        try {
            const response = await fetch(`/api/builds/${id}`);
            const builds = await response.json();

            buildList.innerHTML = '';
            if (builds.length === 0) {
                buildList.innerHTML = '<div class="empty-state" style="padding: 1rem; font-size: 0.8rem;">No builds yet</div>';
                return;
            }

            builds.forEach((build, index) => {
                const div = document.createElement('div');
                div.className = 'build-item';
                div.dataset.id = build.id;
                const date = build.started_at ? new Date(build.started_at) : new Date();
                const statusColor = build.status === 'success' ? '#22c55e'
                    : build.status === 'failure' ? '#ef4444'
                    : '#64748b';
                const triggeredBadge = build.triggered_by !== 'manual'
                    ? `<span style="font-size:0.65rem;background:#e0f2fe;color:#0369a1;border-radius:3px;padding:1px 4px;">${build.triggered_by}</span>`
                    : '';
                div.innerHTML = `
                <span style="display:flex;align-items:center;gap:6px;">
                  <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};flex-shrink:0;display:inline-block;"></span>
                  #${index + 1} ${triggeredBadge}
                </span>
                <span style="color: #64748b">${date.toLocaleTimeString()}</span>
               `;
                buildList.appendChild(div);
            });
        } catch (e) {
            console.error(e);
        }
    }

    async function loadBuildOutput(scriptId, buildId) {
        // both are UUIDs
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
