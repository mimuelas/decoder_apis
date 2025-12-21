document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('upload-form');
    const harFileInput = document.getElementById('har-file');
    const dropZone = document.getElementById('drop-zone');
    const fileInfo = document.getElementById('file-info');
    const fileNameSpan = document.getElementById('file-name');
    const resultsSection = document.getElementById('results-section');
    const resultsContainer = document.getElementById('results-container');
    const downloadHarBtn = document.getElementById('download-har-btn');
    const spinner = document.getElementById('spinner');
    const domainFilterFieldset = document.getElementById('domain-filter-fieldset');
    const domainSelectBox = document.getElementById('domain-select-box');
    const domainCheckboxes = document.getElementById('domain-checkboxes');
    const domainSelectText = document.querySelector('.select-text');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');

    // New Download Options Modal elements
    const downloadOptionsModal = document.getElementById('download-options-modal');
    const downloadOptionsCloseBtn = document.getElementById('download-options-close-btn');
    const downloadConfirmBtn = document.getElementById('download-confirm-btn');
    const downloadOptionsList = document.getElementById('download-options-list');
    const downloadOptionsModalOverlay = downloadOptionsModal.querySelector('.glass-overlay');
    const globalActionsContainer = document.querySelector('.download-global-actions');

    let currentData = null;
    let fullDataMap = null;
    let sortCriteria = []; // Array of {key: string, direction: 'asc' | 'desc'}
    let allDomains = [];

    // --- Drag and Drop ---
    dropZone.addEventListener('click', () => harFileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            harFileInput.files = files;
            updateFileInfo(files[0].name);
        }
    });

    harFileInput.addEventListener('change', () => {
        if (harFileInput.files.length > 0) {
            updateFileInfo(harFileInput.files[0].name);
        }
    });

    function updateFileInfo(fileName) {
        fileNameSpan.textContent = fileName;
        fileInfo.classList.remove('file-info-hidden');
    }

    let rawDataset = []; // Stores ALL entries received from server
    let hasLoadedData = false;

    // --- Form Submission ---
    // --- Form Submission ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // If we already have data, just run local analysis!
        if (hasLoadedData) {
            runLocalAnalysis();
            return;
        }

        // --- First Time Upload Logic ---
        if (!harFileInput.files[0]) {
            alert('Please select a HAR file.');
            return;
        }

        const file = harFileInput.files[0];

        // UI Loading State
        resultsSection.classList.remove('results-hidden');
        spinner.classList.remove('spinner-hidden');
        resultsContainer.innerHTML = '';

        // Use FileReader to read the file locally
        const reader = new FileReader();

        reader.onload = async (event) => {
            try {
                const fileContent = event.target.result;
                const harData = JSON.parse(fileContent);

                const entries = harData.log?.entries || [];

                // Normalize and enrich entries (Logic ported from app.py)
                fullDataMap = {};
                rawDataset = [];

                entries.forEach((entry, index) => {
                    // Normalize structure similar to backend logic
                    const request = entry.request || {};
                    const response = entry.response || {};
                    const content = response.content || {};

                    const mimeType = content.mimeType || 'N/A';
                    const simpleMime = mimeType.split(';')[0];

                    // Helper to guess extension (simplified)
                    let ext = 'bin';
                    if (simpleMime.includes('json')) ext = 'json';
                    else if (simpleMime.includes('javascript')) ext = 'js';
                    else if (simpleMime.includes('html')) ext = 'html';
                    else if (simpleMime.includes('xml')) ext = 'xml';
                    else if (simpleMime.includes('image')) ext = simpleMime.split('/')[1];
                    else if (simpleMime.includes('text')) ext = 'txt';

                    // Generate cURL (Simplified)
                    let curl = `curl "${request.url}" -X ${request.method}`;
                    (request.headers || []).forEach(h => {
                        curl += ` -H "${h.name}: ${h.value}"`;
                    });
                    if (request.postData?.text) {
                        curl += ` --data-binary '${request.postData.text.replace(/'/g, "'\\''")}'`;
                    }

                    // Enrich entry
                    entry._id = index;
                    entry.curl = curl;
                    entry.fileExtension = ext;
                    entry.mimeType = mimeType;

                    // Ensure standard fields exist for easy access
                    entry.method = request.method || 'N/A';
                    entry.url = request.url || 'N/A';
                    entry.status = response.status || 0;
                    entry.time = entry.time || 0;
                    entry.size = content.size || -1;

                    fullDataMap[index] = entry;
                    rawDataset.push(entry);
                });

                hasLoadedData = true;

                // Populate domains once
                populateDomainFilter(fullDataMap);

                // Run initial analysis
                runLocalAnalysis();

            } catch (error) {
                console.error("Error parsing HAR:", error);
                resultsContainer.innerHTML = `<p class="error">Error parsing HAR file: ${error.message}. Please ensure it is a valid JSON file.</p>`;
                hasLoadedData = false;
            } finally {
                spinner.classList.add('spinner-hidden');
            }
        };

        reader.onerror = (error) => {
            console.error("Error reading file:", error);
            resultsContainer.innerHTML = `<p class="error">Error reading file.</p>`;
            spinner.classList.add('spinner-hidden');
        };

        reader.readAsText(file);
    });

    // --- Client-Side Analysis Engine ---
    function runLocalAnalysis() {
        spinner.classList.remove('spinner-hidden');
        resultsContainer.innerHTML = '';

        // 1. Filter
        const filtered = applyFilters(rawDataset);

        // 2. Group/Aggregate
        const groupBy = document.getElementById('group-by').value;
        let displayData;

        if (!groupBy) {
            displayData = performRowLevelAggregation(filtered);
        } else {
            displayData = performTopLevelGrouping(filtered, groupBy);
        }

        currentData = displayData; // For sort/download

        // 3. Render
        // Set default sorting if not set (optional, or persist user sort)
        if (sortCriteria.length === 0) {
            sortCriteria = [
                { key: 'method', direction: 'asc' },
                { key: 'url', direction: 'asc' }
            ];
        }

        // Is it a grouped view (object) or flat list (array)?
        // renderResults handles both.
        renderResults(displayData);

        // 4. Download Button Visibility
        const totalEntries = Object.keys(fullDataMap).length;
        if (totalEntries > 0) {
            downloadHarBtn.classList.remove('hidden');
        } else {
            downloadHarBtn.classList.add('hidden');
        }

        spinner.classList.add('spinner-hidden');
    }

    function applyFilters(entries) {
        // Collect Filter Values
        const errorFilter = document.getElementById('error-filter').value;
        const urlContains = document.getElementById('url-contains').value.toLowerCase();
        const maxUrlLen = parseInt(document.getElementById('max-url-len').value) || null;
        const contentContains = document.getElementById('content-contains').value; // Case sensitivity handled depending on regex
        const contentRegex = document.getElementById('content-regex').checked;

        const selectedMethods = Array.from(document.querySelectorAll('input[name="method"]:checked')).map(cb => cb.value.toUpperCase());
        const selectedContentTypes = Array.from(document.querySelectorAll('input[name="content-type"]:checked')).map(cb => cb.value.toLowerCase());
        const selectedDomains = getSelectedDomains(); // Assuming this function exists and works

        return entries.filter(entry => {
            // 1. Domain
            if (selectedDomains.length > 0) {
                try {
                    const domain = new URL(entry.request.url).hostname;
                    if (!selectedDomains.includes(domain)) return false;
                } catch (e) { return false; }
            }

            // 2. Status / Errors
            if (errorFilter === 'has-errors' && entry.response.status < 400) return false;
            if (errorFilter === 'no-errors' && entry.response.status >= 400) return false;

            // 3. Method
            if (selectedMethods.length > 0 && !selectedMethods.includes(entry.request.method.toUpperCase())) return false;

            // 4. Content Type
            if (selectedContentTypes.length > 0) {
                const mime = (entry.response.content.mimeType || '').toLowerCase();
                // Check if any selected type matches part of the mime
                const match = selectedContentTypes.some(t => mime.includes(t));
                if (!match) return false;
            }

            // 5. URL Contains
            if (urlContains && !entry.request.url.toLowerCase().includes(urlContains)) return false;

            // 6. Max Length
            if (maxUrlLen !== null && entry.request.url.length > maxUrlLen) return false;

            // 7. Content Body Search (Expensive, do last)
            if (contentContains) {
                const text = entry.response.content.text || '';
                // Handle Base64 if needed? Python logic did.
                // For simplicity in JS, assume text is text. 
                // If encoding is base64, we might need window.atob, but let's trust 'text' field for now from HAR.

                if (contentRegex) {
                    try {
                        const regex = new RegExp(contentContains, 'i');
                        if (!regex.test(text)) return false;
                    } catch (e) { return false; } // Invalid regex
                } else {
                    if (!text.toLowerCase().includes(contentContains.toLowerCase())) return false;
                }
            }

            return true;
        });
    }

    function performRowLevelAggregation(entries) {
        // Input: Array of raw entries
        // Output: Array of "Display Objects" (Standardized for Table) where duplicates are grouped

        const groups = {};

        entries.forEach(entry => {
            const key = `${entry.method}::${entry.url}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(entry);
        });

        const displayData = [];

        for (const key in groups) {
            const groupEntries = groups[key];

            if (groupEntries.length > 1) {
                // Aggregate
                const first = groupEntries[0];
                const totalTime = groupEntries.reduce((sum, e) => sum + (e.time || 0), 0);
                const totalSize = groupEntries.reduce((sum, e) => sum + (e.response.content.size !== -1 ? e.response.content.size : 0), 0);

                const statuses = [...new Set(groupEntries.map(e => e.response.status))].sort().join(', ');

                // Mime
                const mimeTypes = [...new Set(groupEntries.map(e => e.mimeType))].filter(m => m !== 'N/A' && m !== 'unknown');
                let mimeDisplay = "N/A";
                if (mimeTypes.length === 1) mimeDisplay = mimeTypes[0];
                else if (mimeTypes.length > 1) mimeDisplay = "Multiple";
                else if (groupEntries[0].mimeType) mimeDisplay = groupEntries[0].mimeType;

                displayData.push({
                    isGroup: true,
                    groupKey: key,
                    count: groupEntries.length,
                    method: first.method,
                    url: first.url,
                    status: statuses,
                    time: totalTime / groupEntries.length,
                    size: totalSize,
                    mimeType: mimeDisplay,
                    subRows: groupEntries.map(formatEntryForDisplay)
                });
            } else {
                const single = formatEntryForDisplay(groupEntries[0]);
                single.isGroup = false;
                displayData.push(single);
            }
        }
        return displayData;
    }

    // Helper to format flat entry for table
    function formatEntryForDisplay(entry) {
        // Ensure simple mime for display
        const simpleMime = (entry.mimeType || 'N/A').split(';')[0].split('/').pop();

        return {
            _id: entry._id,
            method: entry.method,
            status: entry.status,
            url: entry.url,
            time: entry.time,
            size: entry.size,
            mimeType: simpleMime || "unknown",
            isGroup: false
        };
    }

    // Fix push vs append typo in performRowLevelAggregation above
    // I will fix it in the replacement string below directly.

    function performTopLevelGrouping(entries, criteria) {
        // Output: Object { "Group Name": [DisplayObjects] }
        const topGroups = {};

        entries.forEach(entry => {
            let key = "N/A";
            if (criteria === 'method') key = entry.method;
            else if (criteria === 'content-type') key = (entry.mimeType || 'unknown').split(';')[0].split('/').pop() || 'unknown';
            else if (criteria === 'status') key = entry.status > 0 ? Math.floor(entry.status / 100) + 'xx' : 'Status N/A';
            else if (criteria === 'domain') {
                try { key = new URL(entry.url).hostname; } catch (e) { key = "Invalid URL"; }
            }

            if (!topGroups[key]) topGroups[key] = [];
            topGroups[key].push(entry);
        });

        const result = {};
        for (const key in topGroups) {
            result[key] = performRowLevelAggregation(topGroups[key]);
        }
        return result;
    }

    // --- Clear Filters ---
    clearFiltersBtn.addEventListener('click', () => {
        // Easiest way to reset standard form elements
        form.reset();

        // Special handling for the custom domain filter
        domainCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        updateSelectedDomainText();

        // You might want to optionally re-submit the form to show unfiltered results
        // form.dispatchEvent(new Event('submit', { cancelable: true }));
    });

    // --- Download HAR Logic ---
    downloadHarBtn.addEventListener('click', async () => {
        if (!currentData || !fullDataMap) {
            alert('No data available to download.');
            return;
        }

        const groupedEntries = currentData.filter(e => e.isGroup);

        if (groupedEntries.length > 0) {
            // Groups exist, so we must open the options modal
            populateDownloadOptionsModal(groupedEntries);
            downloadOptionsModal.classList.remove('modal-hidden');
        } else {
            // No groups, download all visible entries directly
            downloadWithSelections({});
        }
    });

    function populateDownloadOptionsModal(groupedEntries) {
        downloadOptionsList.innerHTML = ''; // Clear previous options
        groupedEntries.forEach(group => {
            const item = document.createElement('div');
            item.className = 'download-option-item';
            item.dataset.groupKey = group.groupKey;

            const info = document.createElement('div');
            info.className = 'endpoint-info';
            info.textContent = `${group.method} ${group.url}`;
            info.title = `${group.method} ${group.url}`;

            const select = document.createElement('select');
            select.innerHTML = `
                <option value="all" selected>Include all ${group.count} requests</option>
                <option value="first">Include only the first request</option>
                <option value="manual">Select manually...</option>
            `;

            // Event listener to show/hide manual selection
            select.addEventListener('change', () => {
                toggleManualSelection(item, select.value, group);
            });

            item.appendChild(info);
            item.appendChild(select);
            downloadOptionsList.appendChild(item);
        });
    }

    function toggleManualSelection(itemElement, selectedValue, groupData) {
        // Remove existing manual selection list if it exists
        const existingList = itemElement.querySelector('.manual-selection-list');
        if (existingList) {
            existingList.remove();
        }

        if (selectedValue === 'manual') {
            const list = document.createElement('div');
            list.className = 'manual-selection-list';

            groupData.subRows.forEach((sub, index) => {
                const label = document.createElement('label');
                label.className = 'manual-selection-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.dataset.entryId = sub._id;
                checkbox.checked = (index === 0); // Check the first one by default

                const statusClass = sub.status >= 400 ? 'status-error' : 'status-success';
                label.innerHTML = `
                    <span class="${statusClass}">${sub.status}</span>
                    <span>${Math.round(sub.time)}ms</span>
                    <span>${sub.size === -1 ? 'N/A' : sub.size + 'B'}</span>
                `;

                label.prepend(checkbox);
                list.appendChild(label);
            });

            itemElement.appendChild(list);
        }
    }

    async function downloadWithSelections(selections) {
        let entriesToDownloadIds = [];

        currentData.forEach(entry => {
            if (entry.isGroup) {
                const selectionInfo = selections[entry.groupKey];
                if (selectionInfo.choice === 'first') {
                    entriesToDownloadIds.push(entry.subRows[0]._id);
                } else if (selectionInfo.choice === 'manual') {
                    entriesToDownloadIds.push(...selectionInfo.selectedIds);
                } else { // Default to 'all'
                    entry.subRows.forEach(sub => entriesToDownloadIds.push(sub._id));
                }
            } else {
                // It's a single entry, always include it
                entriesToDownloadIds.push(entry._id);
            }
        });

        if (entriesToDownloadIds.length === 0) {
            alert('No entries selected for download.');
            return;
        }

        const uniqueIds = [...new Set(entriesToDownloadIds)];
        const entriesToDownload = uniqueIds.map(id => fullDataMap[id]);

        // Clean entries for export (remove internal fields)
        const cleanedEntries = entriesToDownload.map(entry => {
            const newEntry = { ...entry };
            delete newEntry._id;
            delete newEntry.curl;
            delete newEntry.fileExtension;
            delete newEntry.mimeType; // Optional: keep or remove, HAR spec doesn't forbidden extra fields but cleaner to remove
            delete newEntry.method;
            delete newEntry.url;
            delete newEntry.status; // These were added for convenience, original is in request/response objects
            delete newEntry.size;
            delete newEntry.time; // HAR has time field, but check if we overwrote it. unique id logic preserved original time.
            return newEntry;
        });

        // Reconstruct HAR structure
        const harData = {
            log: {
                version: '1.2',
                creator: {
                    name: 'HAR Analyzer',
                    version: '1.0'
                },
                entries: cleanedEntries
            }
        };

        try {
            const blob = new Blob([JSON.stringify(harData, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            triggerDownload(url, 'filtered.har');
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download error:', error);
            alert(`Could not download file: ${error.message}`);
        }
    }

    // --- Download Options Modal Logic ---
    downloadConfirmBtn.addEventListener('click', () => {
        const selections = {};
        downloadOptionsList.querySelectorAll('.download-option-item').forEach(item => {
            const key = item.dataset.groupKey;
            const choice = item.querySelector('select').value;

            let selectedIds = [];
            if (choice === 'manual') {
                item.querySelectorAll('.manual-selection-list input[type="checkbox"]:checked').forEach(cb => {
                    selectedIds.push(parseInt(cb.dataset.entryId, 10));
                });
            }

            selections[key] = { choice, selectedIds };
        });
        downloadWithSelections(selections);
        downloadOptionsModal.classList.add('modal-hidden');
    });

    function closeDownloadOptionsModal() {
        downloadOptionsModal.classList.add('modal-hidden');
    }

    downloadOptionsCloseBtn.addEventListener('click', closeDownloadOptionsModal);
    downloadOptionsModalOverlay.addEventListener('click', closeDownloadOptionsModal);

    globalActionsContainer.addEventListener('click', (e) => {
        if (e.target.matches('button[data-action]')) {
            const action = e.target.dataset.action;
            downloadOptionsList.querySelectorAll('.download-option-item').forEach(item => {
                const select = item.querySelector('select');
                if (select.value !== action) {
                    select.value = action;
                    // Manually dispatch a 'change' event to trigger the manual selection logic
                    select.dispatchEvent(new Event('change'));
                }
            });
        }
    });

    // --- Domain Filter Logic ---
    function populateDomainFilter(dataMap) {
        const domains = new Set();
        try {
            for (const key in dataMap) {
                const url = dataMap[key]?.request?.url;
                if (url) {
                    const domain = new URL(url).hostname;
                    domains.add(domain);
                }
            }
        } catch (e) {
            console.error("Error parsing URLs for domain filter:", e);
        }

        allDomains = Array.from(domains).sort();
        domainCheckboxes.innerHTML = '';

        // Add "Select All" option
        const selectAllLabel = document.createElement('label');
        selectAllLabel.className = 'select-all-label';
        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.id = 'select-all-domains';
        selectAllLabel.appendChild(selectAllCheckbox);
        selectAllLabel.appendChild(document.createTextNode(' Select/Deselect All'));
        domainCheckboxes.appendChild(selectAllLabel);

        allDomains.forEach(domain => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = domain;
            checkbox.name = 'domains';

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${domain}`));
            domainCheckboxes.appendChild(label);
        });

        if (allDomains.length > 0) {
            domainFilterFieldset.classList.remove('hidden');
        } else {
            domainFilterFieldset.classList.add('hidden');
        }

        // Ensure the actual dropdown list (checkboxes) is HIDDEN initially
        domainCheckboxes.classList.add('hidden');
        domainSelectBox.parentElement.classList.remove('expanded');

        // Reset selections and text
        updateSelectedDomainText();
    }

    function getSelectedDomains() {
        const selected = [];
        domainCheckboxes.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            selected.push(cb.value);
        });
        return selected;
    }

    domainSelectBox.addEventListener('click', (e) => {
        e.stopPropagation();
        domainCheckboxes.classList.toggle('hidden');
        domainSelectBox.parentElement.classList.toggle('expanded');
    });

    document.addEventListener('click', () => {
        domainCheckboxes.classList.add('hidden');
        domainSelectBox.parentElement.classList.remove('expanded');
    });

    domainCheckboxes.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent closing when clicking inside
    });

    domainCheckboxes.addEventListener('change', (e) => {
        if (e.target.id === 'select-all-domains') {
            const isChecked = e.target.checked;
            domainCheckboxes.querySelectorAll('input[name="domains"]').forEach(cb => {
                cb.checked = isChecked;
            });
        } else {
            const allDomainCheckboxes = domainCheckboxes.querySelectorAll('input[name="domains"]');
            const selectAll = document.getElementById('select-all-domains');
            selectAll.checked = Array.from(allDomainCheckboxes).every(cb => cb.checked);
        }
        updateSelectedDomainText();
        // Trigger form submission to re-filter
        // form.dispatchEvent(new Event('submit', { cancelable: true }));
    });

    function updateSelectedDomainText() {
        const selectedCount = getSelectedDomains().length;
        if (selectedCount === 0) {
            domainSelectText.textContent = 'Select domains';
        } else if (selectedCount === allDomains.length) {
            domainSelectText.textContent = 'All domains';
        } else {
            domainSelectText.textContent = `${selectedCount} domain(s) selected`;
        }
    }


    // --- Sorting Logic ---
    function sortEntries(entries) {
        if (sortCriteria.length === 0) {
            return entries;
        }

        const sortedEntries = [...entries]; // Avoid mutating the original data

        sortedEntries.sort((a, b) => {
            for (const criterion of sortCriteria) {
                const { key, direction } = criterion;
                const valA = a[key];
                const valB = b[key];

                let comparison = 0;
                if (key === 'size') {
                    if (valA === -1 && valB !== -1) comparison = 1;
                    else if (valA !== -1 && valB === -1) comparison = -1;
                    else comparison = valA - valB;
                } else if (typeof valA === 'number' && typeof valB === 'number') {
                    comparison = valA - valB;
                } else {
                    comparison = String(valA).localeCompare(String(valB));
                }

                if (comparison !== 0) {
                    return direction === 'asc' ? comparison : -comparison;
                }
            }
            return 0;
        });

        return sortedEntries;
    }

    // --- Render Results ---
    function renderResults(data) {
        resultsContainer.innerHTML = ''; // Clear for re-rendering

        function showNoResults() {
            resultsContainer.innerHTML = '<p>No matching requests found.</p>';
        }

        if (Array.isArray(data)) {
            // Flat view (no top-level groups)
            if (data.length === 0) {
                showNoResults();
                return;
            }
            resultsContainer.appendChild(createTable(sortEntries(data)));
        } else {
            // Grouped view
            const groups = Object.keys(data).sort();
            if (groups.length === 0) {
                showNoResults();
                return;
            }
            for (const groupName of groups) {
                const entries = data[groupName];
                if (entries.length === 0) continue;

                // Calculate total requests in this group
                const totalRequestsInGroup = entries.reduce((acc, entry) => acc + (entry.isGroup ? entry.count : 1), 0);

                const groupDiv = document.createElement('div');
                groupDiv.className = 'result-group collapsed';

                const title = document.createElement('h3');
                title.className = 'group-title';
                title.textContent = `${groupName} (${totalRequestsInGroup} requests)`;

                title.addEventListener('click', () => {
                    groupDiv.classList.toggle('collapsed');
                });

                groupDiv.appendChild(title);

                const tableContainer = document.createElement('div');
                tableContainer.appendChild(createTable(sortEntries(entries)));
                groupDiv.appendChild(tableContainer);
                resultsContainer.appendChild(groupDiv);
            }
        }
    }

    function renderEndpointResults(data) {
        const endpoints = Object.keys(data).sort();
        if (endpoints.length === 0) {
            resultsContainer.innerHTML = '<p>No matching requests found.</p>';
            return;
        }

        const header = document.createElement('div');
        header.className = 'endpoint-group-header';
        header.innerHTML = `
            <div class="endpoint-path">Endpoint Pattern</div>
            <div class="endpoint-methods">Methods</div>
            <div class="endpoint-status">Status Summary</div>
            <div class="endpoint-count">Count</div>
        `;
        resultsContainer.appendChild(header);

        endpoints.forEach(endpointPath => {
            const endpointData = data[endpointPath];

            const groupDiv = document.createElement('div');
            groupDiv.className = 'result-group collapsed';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'group-title endpoint-title';
            titleDiv.innerHTML = `
                <div class="endpoint-path" title="${escapeHtml(endpointPath)}">${escapeHtml(endpointPath)}</div>
                <div class="endpoint-methods">${escapeHtml(endpointData.methods.join(', '))}</div>
                <div class="endpoint-status" title="${escapeHtml(endpointData.statusSummary)}">${escapeHtml(endpointData.statusSummary)}</div>
                <div class="endpoint-count">${endpointData.count}</div>
            `;

            titleDiv.addEventListener('click', () => {
                groupDiv.classList.toggle('collapsed');
            });

            groupDiv.appendChild(titleDiv);

            const tableContainer = document.createElement('div');
            tableContainer.className = 'endpoint-table-container';
            tableContainer.appendChild(createTable(sortEntries(endpointData.entries)));
            groupDiv.appendChild(tableContainer);

            resultsContainer.appendChild(groupDiv);
        });
    }

    function createTable(entries) {
        const table = document.createElement('table');
        table.className = 'result-table';

        // Header
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        const headers = [
            { text: 'Method', key: 'method' },
            { text: 'Status', key: 'status' },
            { text: 'Time (ms)', key: 'time' },
            { text: 'Size (B)', key: 'size' },
            { text: 'MIME Type', key: 'mimeType' },
            { text: 'URL', key: 'url' }
        ];

        headers.forEach(({ text, key }) => {
            const th = document.createElement('th');
            th.textContent = text;
            th.dataset.key = key;
            th.title = 'Click to sort.';

            th.addEventListener('click', () => {
                const existingCriterionIndex = sortCriteria.findIndex(c => c.key === key);

                // Default to Multi-sort behavior always (as if Shift was held)
                if (existingCriterionIndex > -1) {
                    const existing = sortCriteria[existingCriterionIndex];
                    if (existing.direction === 'asc') {
                        existing.direction = 'desc';
                    } else {
                        sortCriteria.splice(existingCriterionIndex, 1);
                    }
                } else {
                    sortCriteria.push({ key, direction: 'asc' });
                }

                renderResults(currentData);
            });
            headerRow.appendChild(th);
        });

        headerRow.querySelectorAll('th[data-key]').forEach(th => {
            const key = th.dataset.key;
            const criterion = sortCriteria.find(c => c.key === key);
            if (criterion) {
                th.classList.add('sorted');
                const indicator = document.createElement('span');
                indicator.className = 'sort-indicator';
                indicator.textContent = criterion.direction === 'asc' ? '▲' : '▼';
                th.appendChild(indicator);
            }
        });


        // Body
        const tbody = table.createTBody();

        const createCellWithDiv = (parentRow, text, className = '') => {
            const cell = parentRow.insertCell();
            const contentDiv = document.createElement('div');
            contentDiv.textContent = text;
            contentDiv.title = String(text); // Ensure title is always a string
            cell.appendChild(contentDiv);
            if (className) cell.className = className;
            return cell;
        };

        entries.forEach(entry => {
            if (entry.isGroup) {
                const groupRow = tbody.insertRow();
                groupRow.className = 'group-row';
                groupRow.dataset.groupKey = entry.groupKey;

                const methodCell = groupRow.insertCell();
                methodCell.innerHTML = `<div title="${entry.method}">${entry.method} (${entry.count})</div>`;

                createCellWithDiv(groupRow, entry.status);
                createCellWithDiv(groupRow, Math.round(entry.time));
                createCellWithDiv(groupRow, entry.size === -1 ? 'N/A' : entry.size);
                createCellWithDiv(groupRow, entry.mimeType);
                createCellWithDiv(groupRow, entry.url, 'url');

                // Render sub-rows but keep them hidden
                entry.subRows.forEach(subEntry => {
                    const subRow = tbody.insertRow();
                    subRow.className = 'sub-row hidden';
                    subRow.dataset.groupKey = entry.groupKey;
                    subRow.dataset.entryId = subEntry._id;

                    createCellWithDiv(subRow, subEntry.method);
                    const statusCell = createCellWithDiv(subRow, subEntry.status);
                    statusCell.className = subEntry.status >= 400 ? 'status-error' : 'status-success';
                    createCellWithDiv(subRow, Math.round(subEntry.time));
                    createCellWithDiv(subRow, subEntry.size === -1 ? 'N/A' : subEntry.size);
                    createCellWithDiv(subRow, subEntry.mimeType || 'N/A');
                    createCellWithDiv(subRow, subEntry.url, 'url');
                });

            } else { // Single, non-grouped entry
                const row = tbody.insertRow();
                row.dataset.entryId = entry._id;

                createCellWithDiv(row, entry.method);
                const statusCell = createCellWithDiv(row, entry.status);
                statusCell.className = entry.status >= 400 ? 'status-error' : 'status-success';
                createCellWithDiv(row, Math.round(entry.time));
                createCellWithDiv(row, entry.size === -1 ? 'N/A' : entry.size);
                createCellWithDiv(row, entry.mimeType || 'N/A');
                createCellWithDiv(row, entry.url, 'url');
            }
        });

        tbody.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (!row) return;

            if (row.classList.contains('group-row')) {
                row.classList.toggle('expanded');
                const groupKey = row.dataset.groupKey;
                const subRows = tbody.querySelectorAll(`tr.sub-row[data-group-key="${groupKey}"]`);
                subRows.forEach(subRow => subRow.classList.toggle('hidden'));
                return;
            }

            if (row.dataset.entryId) {
                const entryId = row.dataset.entryId;
                const fullEntry = fullDataMap[entryId];
                if (fullEntry) {
                    openModal(fullEntry);
                }
            }
        });

        return table;
    }

    // --- Modal Logic ---
    const modal = document.getElementById('modal');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const copyCurlBtn = document.getElementById('copy-curl-btn');
    const downloadResponseBtn = document.getElementById('download-response-btn');
    const modalTabs = document.querySelector('.modal-nav');
    const modalTabPanes = document.querySelectorAll('.modal-tab-pane');
    let currentModalEntry = null;

    function openModal(entry) {
        currentModalEntry = entry;
        renderModalContent(entry);
        modal.classList.remove('modal-hidden');
    }

    function closeModal() {
        modal.classList.add('modal-hidden');
        currentModalEntry = null;
    }

    modalOverlay.addEventListener('click', closeModal);
    modalCloseBtn.addEventListener('click', closeModal);

    copyCurlBtn.addEventListener('click', () => {
        if (currentModalEntry && currentModalEntry.curl) {
            navigator.clipboard.writeText(currentModalEntry.curl).then(() => {
                copyCurlBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyCurlBtn.textContent = 'Copy as cURL';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy cURL command: ', err);
                alert('Failed to copy cURL command.');
            });
        }
    });

    modalTabs.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-tab-btn')) {
            const tabName = e.target.dataset.tab;

            modalTabs.querySelector('.active').classList.remove('active');
            e.target.classList.add('active');

            modalTabPanes.forEach(pane => {
                if (pane.dataset.tabContent === tabName) {
                    pane.classList.add('active');
                } else {
                    pane.classList.remove('active');
                }
            });
        }
    });

    downloadResponseBtn.addEventListener('click', () => {
        if (!currentModalEntry) return;

        const content = currentModalEntry.response.content;
        let data = content.text || '';
        const mimeType = content.mimeType || 'text/plain';
        const extension = currentModalEntry.fileExtension || 'bin';

        if (content.encoding === 'base64') {
            try {
                // Create a Blob from the base64 string
                const byteCharacters = atob(data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: mimeType });
                const url = URL.createObjectURL(blob);
                triggerDownload(url, `response.${extension}`);
                URL.revokeObjectURL(url);
                return;
            } catch (e) {
                console.error("Failed to decode base64 for download:", e);
                alert("Failed to process base64 content for download.");
                return;
            }
        }

        // For plain text
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        triggerDownload(url, `response.${extension}`);
        URL.revokeObjectURL(url);
    });

    function triggerDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function renderModalContent(entry) {
        // Reset to the first tab
        modalTabs.querySelector('.active').classList.remove('active');
        modalTabs.querySelector('[data-tab="general"]').classList.add('active');
        modalTabPanes.forEach(p => p.classList.remove('active'));
        document.querySelector('.modal-tab-pane[data-tab-content="general"]').classList.add('active');


        // General Tab
        const generalPane = document.querySelector('[data-tab-content="general"]');
        generalPane.innerHTML = `
            <dl class="detail-grid">
                <dt>URL</dt><dd>${escapeHtml(entry.request.url)}</dd>
                <dt>Method</dt><dd>${escapeHtml(entry.request.method)}</dd>
                <dt>Status</dt><dd>${escapeHtml(String(entry.response.status))} ${escapeHtml(entry.response.statusText)}</dd>
                <dt>Time</dt><dd>${Math.round(entry.time)} ms</dd>
                <dt>Size</dt><dd>${entry.response.content.size === -1 ? 'N/A' : `${entry.response.content.size} B`}</dd>
                <dt>MIME Type</dt><dd>${escapeHtml(entry.response.content.mimeType)}</dd>
                ${entry.response.redirectURL ? `<dt>Redirect URL</dt><dd>${escapeHtml(entry.response.redirectURL)}</dd>` : ''}
            </dl>
        `;

        // Headers Tab
        const headersPane = document.querySelector('[data-tab-content="headers"]');
        const reqHeaders = entry.request.headers.map(h => `<tr><td>${escapeHtml(h.name)}</td><td>${escapeHtml(h.value)}</td></tr>`).join('');
        const resHeaders = entry.response.headers.map(h => `<tr><td>${escapeHtml(h.name)}</td><td>${escapeHtml(h.value)}</td></tr>`).join('');
        headersPane.innerHTML = `
            <div class="headers-grid">
                <h3>Request Headers</h3>
                <table><tbody>${reqHeaders}</tbody></table>
            </div>
            <div class="headers-grid">
                <h3>Response Headers</h3>
                <table><tbody>${resHeaders}</tbody></table>
            </div>
        `;

        // Response Tab
        const responsePane = document.querySelector('[data-tab-content="response"]');
        const responseContentPre = document.getElementById('response-content-pre');
        const content = entry.response.content;
        const mimeType = content.mimeType || '';

        const downloadBtn = document.getElementById('download-response-btn');
        if (content.text) {
            downloadBtn.style.display = 'block';
            let responseText = content.text;
            if (content.encoding === 'base64') {
                try {
                    responseText = atob(responseText);
                } catch (e) {
                    responseText = '[Error: Could not decode base64 content]';
                }
            }

            if (mimeType.includes('json')) {
                try {
                    responseText = JSON.stringify(JSON.parse(responseText), null, 2);
                } catch (e) { /* Not a valid JSON, show as is */ }
            }
            responseContentPre.textContent = responseText;
        } else {
            downloadBtn.style.display = 'none';
            responseContentPre.textContent = 'Response content not available or empty.';
        }

        // Preview Tab
        const previewPane = document.querySelector('[data-tab-content="preview"]');
        const previewTabBtn = document.querySelector('[data-tab="preview"]');
        previewPane.innerHTML = '';

        if (mimeType.startsWith('image/') && content.text) {
            previewTabBtn.disabled = false;
            const img = document.createElement('img');
            img.src = `data:${mimeType};base64,${content.text}`;
            img.className = 'response-preview-image';
            previewPane.appendChild(img);
        } else if (mimeType.includes('html') && content.text) {
            previewTabBtn.disabled = false;
            const iframe = document.createElement('iframe');
            let htmlContent = content.text;
            if (content.encoding === 'base64') {
                try { htmlContent = atob(htmlContent); }
                catch (e) { htmlContent = '[Error: Could not decode base64 content]'; }
            }
            iframe.srcdoc = htmlContent;
            iframe.className = 'response-preview-iframe';
            iframe.sandbox = ''; // Sandbox for security
            previewPane.appendChild(iframe);
        } else {
            previewTabBtn.disabled = true;
            previewPane.textContent = 'No preview available for this content type.';
        }

        // Timings Tab
        const timingsPane = document.querySelector('[data-tab-content="timings"]');
        const timings = entry.timings;
        timingsPane.innerHTML = `
            <dl class="detail-grid">
                <dt>Blocked</dt><dd>${Math.round(timings.blocked)} ms</dd>
                <dt>DNS</dt><dd>${timings.dns > -1 ? Math.round(timings.dns) + ' ms' : 'N/A'}</dd>
                <dt>Connect</dt><dd>${timings.connect > -1 ? Math.round(timings.connect) + ' ms' : 'N/A'}</dd>
                <dt>Send</dt><dd>${Math.round(timings.send)} ms</dd>
                <dt>Wait</dt><dd>${Math.round(timings.wait)} ms</dd>
                <dt>Receive</dt><dd>${Math.round(timings.receive)} ms</dd>
                <dt><strong>Total</strong></dt><dd><strong>${Math.round(entry.time)} ms</strong></dd>
            </dl>
        `;
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
