const API_BASE = 'http://localhost:8001';


document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-btn');
    const newAnalysisBtn = document.getElementById('new-analysis-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    const docList = document.getElementById('doc-list');

    const viewInput = document.getElementById('view-input');
    const viewOutput = document.getElementById('view-output');

    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');

    // Track uploaded document IDs
    let uploadedDocs = [];
    let currentInsightId = null;

    // --- Clear hardcoded doc items on load and fetch from backend ---
    async function loadDocuments() {
        docList.innerHTML = '<div class="doc-item" style="color:#999;">Loading documents...</div>';
        try {
            const res = await fetch(`${API_BASE}/documents`);
            const data = await res.json();
            docList.innerHTML = '';
            if (data.documents.length === 0) {
                docList.innerHTML = '<div class="doc-item" style="color:#999;">No documents uploaded yet. Click "Upload New" to add files.</div>';
            }
            data.documents.forEach(doc => {
                uploadedDocs.push({ id: doc.id, filename: doc.filename, status: doc.status });
                const item = createDocItem(doc);
                docList.appendChild(item);
            });
        } catch (e) {
            docList.innerHTML = '<div class="doc-item" style="color:#c33;">⚠ Backend not reachable. Start it with: python backend.py</div>';
        }
    }

    function createDocItem(doc) {
        const item = document.createElement('div');
        item.className = 'doc-item';
        item.dataset.docId = doc.id;

        const statusIcon = doc.status === 'completed' ? '✅' : doc.status === 'processing' ? '⏳' : doc.status === 'failed' ? '❌' : '⏳';
        item.innerHTML = `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;width:100%;">
                <input type="checkbox" class="doc-checkbox" value="${doc.id}" ${doc.status === 'completed' ? 'checked' : ''} ${doc.status !== 'completed' ? 'disabled' : ''}>
                <span>📄 ${doc.filename}</span>
                <span style="margin-left:auto;font-size:12px;color:#888;">${statusIcon} ${doc.status}</span>
            </label>
        `;
        return item;
    }

    // --- Upload Button ---
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                // Show uploading state immediately
                const tempItem = document.createElement('div');
                tempItem.className = 'doc-item';
                tempItem.style.backgroundColor = '#fff8e1';
                tempItem.innerHTML = `📄 ${file.name} <span style="margin-left:auto;font-size:12px;color:#888;">⏳ uploading...</span>`;
                docList.prepend(tempItem);

                // Upload to backend
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const res = await fetch(`${API_BASE}/upload`, {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();

                    // Replace temp item with real one
                    uploadedDocs.push({ id: data.id, filename: data.filename, status: data.status });
                    const realItem = createDocItem({ id: data.id, filename: data.filename, status: 'processing' });
                    docList.replaceChild(realItem, tempItem);

                    // Poll for processing completion
                    pollDocStatus(data.id, realItem);
                } catch (err) {
                    tempItem.style.backgroundColor = '#ffe0e0';
                    tempItem.innerHTML = `📄 ${file.name} <span style="margin-left:auto;font-size:12px;color:#c33;">❌ upload failed</span>`;
                }
            }
            fileInput.value = '';
        });
    }

    // --- Poll document processing status ---
    function pollDocStatus(docId, itemEl) {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/documents`);
                const data = await res.json();
                const doc = data.documents.find(d => d.id === docId);
                if (doc && doc.status === 'completed') {
                    clearInterval(interval);
                    const newItem = createDocItem(doc);
                    itemEl.replaceWith(newItem);
                    // Update local tracking
                    const idx = uploadedDocs.findIndex(d => d.id === docId);
                    if (idx >= 0) uploadedDocs[idx].status = 'completed';
                } else if (doc && doc.status === 'failed') {
                    clearInterval(interval);
                    const newItem = createDocItem(doc);
                    itemEl.replaceWith(newItem);
                }
            } catch (e) { /* keep polling */ }
        }, 2000);
    }

    // --- Generate Insights ---
    generateBtn.addEventListener('click', async () => {
        // Get selected document IDs
        const checkboxes = document.querySelectorAll('.doc-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.value);

        const questionEl = document.getElementById('research-question');
        const formatEl = document.getElementById('response-format');
        const contextEl = document.getElementById('additional-context');

        const question = questionEl ? questionEl.value.trim() : '';
        const format = formatEl ? formatEl.value : 'Detailed';
        const context = contextEl ? contextEl.value.trim() : '';

        // Validation
        if (selectedIds.length === 0) {
            alert('Please select at least one processed document.');
            return;
        }
        if (!question) {
            alert('Please enter a research question.');
            return;
        }

        // Show processing state
        generateBtn.innerText = '⏳ Processing...';
        generateBtn.disabled = true;

        // Switch to Processing step
        step1.classList.remove('active');
        step1.style.background = '#e0e0e0';
        step1.style.color = '#666';
        step2.classList.add('active');
        step2.style.background = '#e35252';
        step2.style.color = 'white';

        try {
            const res = await fetch(`${API_BASE}/generate_insights`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_ids: selectedIds,
                    research_question: question,
                    response_format: format,
                    additional_context: context || null
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Request failed');
            }

            const result = await res.json();

            // Store insight ID for export
            currentInsightId = result.insight_id;

            // Render the output 
            renderInsights(result, question, selectedIds.length, format);

            // Switch to Output view
            viewInput.classList.remove('active-view');
            viewOutput.classList.add('active-view');

            step2.classList.remove('active');
            step2.style.background = '#e0e0e0';
            step2.style.color = '#666';
            step3.classList.add('active');
            step3.style.background = '#cc3333';
            step3.style.color = 'white';

        } catch (err) {
            alert('Error generating insights: ' + err.message);
            // Reset step styling
            step2.classList.remove('active');
            step2.style.background = '#f0f0f0';
            step2.style.color = '#666';
            step1.classList.add('active');
            step1.style.background = '#e35252';
            step1.style.color = 'white';
        }

        generateBtn.innerText = '✨ Generate Insights';
        generateBtn.disabled = false;
    });

    // --- Render AI Insights into the Output View ---
    function renderInsights(result, question, docCount, format) {
        const data = result.data;
        const outputDiv = document.getElementById('view-output');

        // Build the question box
        const questionBox = outputDiv.querySelector('.question-box');
        if (questionBox) {
            questionBox.innerHTML = `<strong>Research Question:</strong><p>${escapeHtml(question)}</p>`;
        }

        // Update header
        const headerTitle = outputDiv.querySelector('.output-title');
        if (headerTitle) {
            headerTitle.innerHTML = `
                <h3 class="success-text">✔ Research Insights - ${escapeHtml(format)} Format</h3>
                <p>AI-generated insights from ${docCount} selected document(s)</p>
            `;
        }

        // Build sections dynamically
        const sectionsContainer = document.getElementById('insight-sections');
        if (sectionsContainer) {
            sectionsContainer.innerHTML = '';

            // Key Findings
            if (data.key_findings && data.key_findings.length > 0) {
                sectionsContainer.appendChild(buildSection('💡', 'Key Findings', data.key_findings, 'border-red', 'red'));
            }

            // What Users Want
            if (data.what_users_want && data.what_users_want.length > 0) {
                sectionsContainer.appendChild(buildSection('👤', 'What Users Want', data.what_users_want, 'border-pink', 'pink'));
            }

            // Strategic Quick Wins
            if (data.strategic_quick_wins && data.strategic_quick_wins.length > 0) {
                sectionsContainer.appendChild(buildSection('⚡', 'Strategic Quick Wins', data.strategic_quick_wins, 'border-green', 'green'));
            }

            // Common Problems
            if (data.common_problems && data.common_problems.length > 0) {
                sectionsContainer.appendChild(buildSection('⚠', 'Common Problems', data.common_problems, 'border-yellow', 'yellow'));
            }

            // Recommended Next Steps
            if (data.recommended_next_steps && data.recommended_next_steps.length > 0) {
                sectionsContainer.appendChild(buildSection('🚀', 'Recommended Next Steps', data.recommended_next_steps, 'border-blue', 'blue'));
            }

            // Executive Summary
            if (data.executive_summary) {
                const summaryDiv = document.createElement('div');
                summaryDiv.className = 'insight-section';
                summaryDiv.innerHTML = `
                    <div class="section-header"><div class="icon-title"><span class="icon">📋</span><div><h4>Executive Summary</h4></div></div></div>
                    <div class="list-items"><div class="list-item">${escapeHtml(data.executive_summary)}</div></div>
                `;
                sectionsContainer.appendChild(summaryDiv);
            }

            // Simplified format (bullet points)
            if (data.bullet_points && data.bullet_points.length > 0) {
                sectionsContainer.appendChild(buildSection('📌', 'Key Points', data.bullet_points.map(t => ({ text: t, priority: 'medium' })), 'border-red', 'red'));
            }

            // Sources & Citations
            if (data.sources_and_citations && data.sources_and_citations.length > 0) {
                const citDiv = document.createElement('div');
                citDiv.className = 'sources-box';
                citDiv.innerHTML = '<h5>🔗 Sources & Citations</h5>' +
                    data.sources_and_citations.map(c => `<div class="source-item">📄 [${c.id}] ${escapeHtml(c.source)}</div>`).join('');
                sectionsContainer.appendChild(citDiv);
            }
        }
    }

    function buildSection(icon, title, items, borderClass, colorName) {
        const section = document.createElement('div');
        section.className = `insight-section ${borderClass}`;
        const priorityBadge = items[0] && items[0].priority ? `<span class="badge">${items[0].priority} priority</span>` : '';
        section.innerHTML = `
            <div class="section-header">
                <div class="icon-title">
                    <span class="icon">${icon}</span>
                    <div>
                        <h4>${title}</h4>
                        ${priorityBadge}
                    </div>
                </div>
            </div>
            <div class="list-items">
                ${items.map(item => `<div class="list-item">✔ ${escapeHtml(typeof item === 'string' ? item : item.text)}</div>`).join('')}
            </div>
        `;
        return section;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    // --- New Analysis Button ---
    newAnalysisBtn.addEventListener('click', () => {
        viewOutput.classList.remove('active-view');
        viewInput.classList.add('active-view');

        step3.classList.remove('active');
        step3.style.background = '#f0f0f0';
        step3.style.color = '#666';

        step2.classList.remove('active');
        step2.style.background = '#f0f0f0';
        step2.style.color = '#666';

        step1.classList.add('active');
        step1.style.background = '#e35252';
        step1.style.color = 'white';
    });

    // --- Download DOCX Button ---
    const downloadDocxBtn = document.getElementById('download-docx-btn');
    if (downloadDocxBtn) {
        downloadDocxBtn.addEventListener('click', () => {
            if (!currentInsightId) {
                alert('No insight to download. Generate insights first.');
                return;
            }
            // Trigger file download via the export endpoint
            window.open(`${API_BASE}/export/${currentInsightId}?format_type=docx`, '_blank');
        });
    }

    // --- Load documents on page load ---
    loadDocuments();
});
