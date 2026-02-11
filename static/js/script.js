document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const fileUpload = document.getElementById('fileUpload');
    const uploadBtn = document.getElementById('uploadBtn');
    const manageRulesBtn = document.getElementById('manageRulesBtn');
    const extractBtn = document.getElementById('extractBtn');
    const exportBtn = document.getElementById('exportBtn');
    const templateSelect = document.getElementById('templateSelect');

    const pdfViewer = document.getElementById('pdfViewer');
    const pdfPlaceholder = document.getElementById('pdfPlaceholder');

    const resultsContainer = document.getElementById('resultsContainer');
    const extractedData = document.getElementById('extractedData');
    const rawTextContent = document.getElementById('rawTextContent');

    // Modal Elements
    const rulesModal = document.getElementById('rulesModal');
    const closeModal = document.querySelector('.close-modal');

    // Sidebar Elements
    const templatesList = document.getElementById('templatesList');
    const createTemplateBtn = document.getElementById('createTemplateBtn');

    // Main Rules Area Elements
    const currentTemplateTitle = document.getElementById('currentTemplateTitle');
    const editTemplateBtn = document.getElementById('editTemplateBtn');
    const templateActions = document.getElementById('templateActions');
    const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');
    const rulesArea = document.getElementById('rulesArea');
    const emptySelectionState = document.getElementById('emptySelectionState');
    const rulesTableBody = document.getElementById('rulesTableBody');
    const addRuleBtn = document.getElementById('addRuleBtn');

    // --- State ---
    let currentFilename = null;
    let currentExtractionData = null;
    let activeTemplateId = null; // For Modal
    let selectedExtractionTemplateId = null; // For Main Dropdown

    // --- Initialization ---
    fetchTemplates();

    // --- Event Listeners ---

    // Upload & Extract
    uploadBtn.addEventListener('click', () => fileUpload.click());

    fileUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            uploadBtn.textContent = 'Uploading...';
            uploadBtn.disabled = true;

            const response = await fetch('/upload', { method: 'POST', body: formData });
            const data = await response.json();

            if (response.ok) {
                currentFilename = data.filename;
                loadPdf(data.filename);
                updateExtractButtonState();
            } else {
                alert('Upload failed: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Upload error');
        } finally {
            uploadBtn.textContent = 'Upload PDF';
            uploadBtn.disabled = false;
        }
    });

    templateSelect.addEventListener('change', (e) => {
        selectedExtractionTemplateId = e.target.value;
        updateExtractButtonState();
    });

    extractBtn.addEventListener('click', async () => {
        if (!currentFilename || !selectedExtractionTemplateId) return;

        try {
            extractBtn.textContent = 'Extracting...';
            extractBtn.disabled = true;

            const response = await fetch('/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: currentFilename,
                    template_id: selectedExtractionTemplateId
                })
            });

            const data = await response.json();

            if (response.ok) {
                currentExtractionData = data.data; // Save for export
                displayResults(data);
                exportBtn.disabled = false;
            } else {
                alert('Extraction failed: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Extraction error');
        } finally {
            extractBtn.textContent = 'Extract';
            extractBtn.disabled = false;
        }
    });

    exportBtn.addEventListener('click', async () => {
        if (!currentExtractionData) return;

        try {
            exportBtn.textContent = 'Exporting...';
            const response = await fetch('/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: currentExtractionData,
                    filename: `extraction_${new Date().toISOString().slice(0, 10)}`
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `extraction_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } else {
                alert('Export failed');
            }
        } catch (e) {
            alert('Export error');
        } finally {
            exportBtn.textContent = 'Export JSON';
        }
    });

    // Modal Opening/Closing
    manageRulesBtn.addEventListener('click', () => {
        rulesModal.style.display = 'block';
        fetchTemplates(); // Refresh lists
        resetModalState();
    });

    closeModal.addEventListener('click', () => {
        rulesModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target == rulesModal) {
            rulesModal.style.display = 'none';
        }
    });

    // Template Operations
    createTemplateBtn.addEventListener('click', async () => {
        const name = prompt('Enter Template Name:');
        if (!name) return;

        try {
            const resp = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, description: '' })
            });
            if (resp.ok) {
                const newTemplate = await resp.json();
                await fetchTemplates(); // Refresh list
                selectTemplateInModal(newTemplate.id);
            } else {
                alert('Error creating template');
            }
        } catch (e) {
            alert('Error creating template');
        }
    });

    deleteTemplateBtn.addEventListener('click', async () => {
        if (!activeTemplateId) return;
        if (!confirm('Are you sure? This will delete all rules in this template.')) return;

        try {
            const resp = await fetch(`/api/templates/${activeTemplateId}`, { method: 'DELETE' });
            if (resp.ok) {
                resetModalState();
                fetchTemplates();
            } else {
                alert('Error deleting template');
            }
        } catch (e) {
            alert('Error deleting template');
        }
    });

    editTemplateBtn.addEventListener('click', async () => {
        if (!activeTemplateId) return;
        const newName = prompt('Enter new name:', currentTemplateTitle.textContent);
        if (newName && newName !== currentTemplateTitle.textContent) {
            try {
                const resp = await fetch(`/api/templates/${activeTemplateId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName })
                });
                if (resp.ok) {
                    const updated = await resp.json();
                    currentTemplateTitle.textContent = updated.name;
                    fetchTemplates(); // Refresh sidebar
                }
            } catch (e) {
                alert('Error updating template');
            }
        }
    });

    // Rule Operations
    addRuleBtn.addEventListener('click', () => {
        if (!activeTemplateId) return;
        addRuleRow(); // Adds empty row
    });

    // --- Core Functions ---

    function updateExtractButtonState() {
        extractBtn.disabled = !(currentFilename && selectedExtractionTemplateId);
    }

    function loadPdf(filename) {
        pdfViewer.src = `/uploads/${filename}`;
        pdfViewer.style.display = 'block';
        pdfPlaceholder.style.display = 'none';
    }

    function displayResults(data) {
        // Clear previous
        extractedData.innerHTML = '';
        const emptyState = resultsContainer.querySelector('.empty-state');
        if (emptyState) emptyState.style.display = 'none';
        extractedData.style.display = 'grid';

        // Raw Text
        rawTextContent.textContent = data.text || 'No text extracted.';

        // Extracted Data
        const items = data.data;
        if (Object.keys(items).length === 0) {
            extractedData.innerHTML = '<div class="data-item-label">No Match</div><div class="data-item-value">No rules matched</div>';
            return;
        }

        for (const [key, value] of Object.entries(items)) {
            const label = document.createElement('div');
            label.className = 'data-item-label';
            label.textContent = key;

            const val = document.createElement('div');
            val.className = 'data-item-value';

            if (Array.isArray(value)) {
                val.textContent = value.join(', ');
            } else {
                val.textContent = value || 'Not found';
            }

            extractedData.appendChild(label);
            extractedData.appendChild(val);
        }
    }

    async function fetchTemplates() {
        try {
            const resp = await fetch('/api/templates');
            const templates = await resp.json();

            // Populate Dropdown
            const currentSelection = templateSelect.value;
            templateSelect.innerHTML = '<option value="">Select Template...</option>';
            templates.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name;
                templateSelect.appendChild(opt);
            });
            if (currentSelection) templateSelect.value = currentSelection; // Restore selection if valid

            // Populate Modal Sidebar
            templatesList.innerHTML = '';
            templates.forEach(t => {
                const div = document.createElement('div');
                div.style.padding = '10px 1rem';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid #f1f5f9';
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.className = 'template-item';
                if (t.id === activeTemplateId) {
                    div.style.backgroundColor = '#f1f5f9';
                    div.style.fontWeight = '500';
                    div.style.borderLeft = '3px solid var(--primary-color)';
                } else {
                    div.style.borderLeft = '3px solid transparent';
                }

                div.textContent = t.name;
                div.onclick = () => selectTemplateInModal(t.id, t.name);

                templatesList.appendChild(div);
            });

        } catch (e) {
            console.error('Error fetching templates', e);
        }
    }

    async function selectTemplateInModal(id, name) {
        activeTemplateId = id;

        // Update Sidebar UI
        Array.from(templatesList.children).forEach(child => {
            // simplified checks for visual update, better to re-render but this is fine
            child.style.backgroundColor = child.textContent === name ? '#f1f5f9' : 'transparent';
            child.style.borderLeft = child.textContent === name ? '3px solid var(--primary-color)' : '3px solid transparent';
        });

        // Update Main Area
        if (!name) {
            // If name not provided, find it (e.g. after create)
            const found = Array.from(templateSelect.options).find(o => o.value === id);
            if (found) name = found.textContent;
        }

        currentTemplateTitle.textContent = name;
        editTemplateBtn.style.display = 'inline-block';
        templateActions.style.display = 'flex';
        rulesArea.style.display = 'block';
        emptySelectionState.style.display = 'none';

        loadRules(id);
    }

    function resetModalState() {
        activeTemplateId = null;
        currentTemplateTitle.textContent = 'Select a Template';
        editTemplateBtn.style.display = 'none';
        templateActions.style.display = 'none';
        rulesArea.style.display = 'none';
        emptySelectionState.style.display = 'flex';
        // Reload templates to clear selection visual
        fetchTemplates();
    }

    async function loadRules(templateId) {
        rulesTableBody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
        try {
            const resp = await fetch(`/api/templates/${templateId}/rules`);
            const rules = await resp.json();

            rulesTableBody.innerHTML = '';
            rules.forEach(r => addRuleRow(r));
        } catch (e) {
            rulesTableBody.innerHTML = '<tr><td colspan="3">Error loading rules</td></tr>';
        }
    }

    function addRuleRow(rule = {}) {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #e2e8f0';

        tr.innerHTML = `
            <td style="padding: 8px;"><input type="text" class="field-name" placeholder="e.g. Invoice Number" style="width: 100%; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px;"></td>
            <td style="padding: 8px;"><input type="text" class="regex-pattern" placeholder="e.g. Inv-\\d+" style="width: 100%; padding: 4px; border: 1px solid #cbd5e1; border-radius: 4px;"></td>
            <td style="padding: 8px;">
                <button class="btn small save-rule" style="margin-right: 5px;">Save</button>
                <button class="btn small danger delete-rule" ${!rule.id ? 'disabled' : ''} data-id="${rule.id || ''}">Delete</button>
            </td>
        `;

        const saveBtn = tr.querySelector('.save-rule');
        const deleteBtn = tr.querySelector('.delete-rule');
        const fieldInput = tr.querySelector('.field-name');
        const regexInput = tr.querySelector('.regex-pattern');

        // Set values safely
        fieldInput.value = rule.field_name || '';
        regexInput.value = rule.regex || '';

        saveBtn.addEventListener('click', async () => {
            const fieldName = fieldInput.value;
            const regex = regexInput.value;

            if (!fieldName || !regex) { alert('Fill both fields'); return; }

            // Determine endpoint and method
            // If we have an ID, we update the rule (using the general /rules endpoint or careful logic)
            // But wait, our API update:
            // POST /api/templates/<id>/rules -> Creates new
            // POST /rules (with ID) -> Updates existing

            let url, method, body;

            if (rule.id) {
                // Update
                url = '/rules';
                method = 'POST';
                body = { id: rule.id, field_name: fieldName, regex: regex };
            } else {
                // Create
                url = `/api/templates/${activeTemplateId}/rules`;
                method = 'POST';
                body = { field_name: fieldName, regex: regex };
            }

            try {
                saveBtn.textContent = 'Saving...';
                const resp = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                const res = await resp.json();
                if (resp.ok) {
                    saveBtn.textContent = 'Saved';
                    setTimeout(() => saveBtn.textContent = 'Save', 1000);

                    // If newly created, update our local rule object so next save is an update
                    if (!rule.id && (res.id || res.rule?.id)) {
                        rule.id = res.id || res.rule?.id;
                        deleteBtn.dataset.id = rule.id;
                        deleteBtn.disabled = false;
                    }
                } else {
                    alert('Error saving');
                }
            } catch (e) {
                console.error(e);
                alert('Error saving');
            }
        });

        deleteBtn.addEventListener('click', async () => {
            const id = deleteBtn.dataset.id;
            if (!id) { tr.remove(); return; }
            if (!confirm('Delete this rule?')) return;

            try {
                const resp = await fetch(`/rules?id=${id}`, { method: 'DELETE' });
                if (resp.ok) tr.remove();
                else alert('Error deleting');
            } catch (e) { alert('Error deleting'); }
        });

        rulesTableBody.appendChild(tr);
    }
});
