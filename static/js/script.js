document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const fileUpload = document.getElementById('fileUpload');
    const uploadBtn = document.getElementById('uploadBtn');
    const manageRulesBtn = document.getElementById('manageRulesBtn');
    const extractBtn = document.getElementById('extractBtn');

    const pdfViewer = document.getElementById('pdfViewer');
    const pdfPlaceholder = document.getElementById('pdfPlaceholder');

    const resultsContainer = document.getElementById('resultsContainer');
    const extractedData = document.getElementById('extractedData');
    const rawTextContent = document.getElementById('rawTextContent');

    const rulesModal = document.getElementById('rulesModal');
    const closeModal = document.querySelector('.close-modal');
    const addRuleBtn = document.getElementById('addRuleBtn');
    const rulesTableBody = document.querySelector('#rulesTable tbody');

    let currentFilename = null;

    // Event Listeners
    uploadBtn.addEventListener('click', () => fileUpload.click());

    fileUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            uploadBtn.textContent = 'Uploading...';
            uploadBtn.disabled = true;

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                currentFilename = data.filename;
                loadPdf(data.filename);
                extractBtn.disabled = false;
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

    extractBtn.addEventListener('click', async () => {
        if (!currentFilename) return;

        try {
            extractBtn.textContent = 'Extracting...';
            extractBtn.disabled = true;

            const response = await fetch('/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: currentFilename })
            });

            const data = await response.json();

            if (response.ok) {
                displayResults(data);
            } else {
                alert('Extraction failed: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Extraction error');
        } finally {
            extractBtn.textContent = 'Extract Data';
            extractBtn.disabled = false;
        }
    });

    // Rules Management
    manageRulesBtn.addEventListener('click', () => {
        loadRules();
        rulesModal.style.display = 'block';
    });

    closeModal.addEventListener('click', () => {
        rulesModal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target == rulesModal) {
            rulesModal.style.display = 'none';
        }
    });

    addRuleBtn.addEventListener('click', () => {
        addRuleRow();
    });

    // Functions
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

    async function loadRules() {
        rulesTableBody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';

        try {
            const response = await fetch('/rules');
            const rules = await response.json();

            rulesTableBody.innerHTML = '';
            rules.forEach(rule => addRuleRow(rule));
        } catch (error) {
            rulesTableBody.innerHTML = '<tr><td colspan="3">Error loading rules</td></tr>';
        }
    }

    function addRuleRow(rule = {}) {
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td class="editable-cell"><input type="text" class="field-name" placeholder="e.g. Invoice Number"></td>
            <td class="editable-cell"><input type="text" class="regex-pattern" placeholder="e.g. Inv-\\d+"></td>
            <td>
                <button class="btn small save-rule">Save</button>
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

            if (!fieldName || !regex) {
                alert('Fill both fields');
                return;
            }

            const ruleData = {
                id: rule.id, // Might be undefined for new rules
                field_name: fieldName,
                regex: regex
            };

            try {
                saveBtn.textContent = 'Saving...';
                const response = await fetch('/rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(ruleData)
                });

                const res = await response.json();
                if (response.ok) {
                    saveBtn.textContent = 'Saved';
                    setTimeout(() => saveBtn.textContent = 'Save', 1000);
                    // Update the delete button with the new ID if it was a new rule
                    if (!rule.id && res.rule.id) {
                        rule.id = res.rule.id;
                        deleteBtn.dataset.id = res.rule.id;
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
            if (!id) {
                tr.remove();
                return;
            }

            if (!confirm('Delete this rule?')) return;

            try {
                const response = await fetch(`/rules?id=${id}`, { method: 'DELETE' });
                if (response.ok) {
                    tr.remove();
                } else {
                    alert('Error deleting');
                }
            } catch (e) {
                alert('Error deleting');
            }
        });

        rulesTableBody.appendChild(tr);
    }
});
