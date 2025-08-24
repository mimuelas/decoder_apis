document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('upload-form');
    const harFileInput = document.getElementById('har-file');
    const dropZone = document.getElementById('drop-zone');
    const fileInfo = document.getElementById('file-info');
    const fileNameSpan = document.getElementById('file-name');
    const resultsSection = document.getElementById('results-section');
    const resultsContainer = document.getElementById('results-container');
    const spinner = document.getElementById('spinner');

    let currentData = null;
    let sortCriteria = []; // Array of {key: string, direction: 'asc' | 'desc'}

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

    // --- Form Submission ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!harFileInput.files[0]) {
            alert('Please select a HAR file.');
            return;
        }

        const formData = new FormData(form);
        
        // Show spinner and clear previous results
        resultsSection.classList.remove('results-hidden');
        spinner.classList.remove('spinner-hidden');
        resultsContainer.innerHTML = '';

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'An unknown error occurred.');
            }

            const data = await response.json();
            currentData = data;
            sortCriteria = [];
            renderResults(data);

        } catch (error) {
            resultsContainer.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        } finally {
            spinner.classList.add('spinner-hidden');
        }
    });

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
            // Non-grouped results
            if (data.length === 0) {
                 showNoResults();
                 return;
            }
            resultsContainer.appendChild(createTable(sortEntries(data)));
        } else {
            // Grouped results
            const groups = Object.keys(data).sort();
             if (groups.length === 0) {
                 showNoResults();
                 return;
            }
            for (const groupName of groups) {
                const entries = data[groupName];
                const groupDiv = document.createElement('div');
                groupDiv.className = 'result-group';
                
                const title = document.createElement('h3');
                title.textContent = `${groupName} (${entries.length} requests)`;
                groupDiv.appendChild(title);
                
                groupDiv.appendChild(createTable(sortEntries(entries)));
                resultsContainer.appendChild(groupDiv);
            }
        }
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
            th.title = 'Click to sort. Hold Shift to sort by multiple columns.';

            th.addEventListener('click', (e) => {
                const existingCriterionIndex = sortCriteria.findIndex(c => c.key === key);

                if (e.shiftKey) {
                    // Multi-sort: asc -> desc -> remove
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
                } else {
                    // Single-sort: asc -> desc -> remove
                    const isSameSingleSort = sortCriteria.length === 1 && sortCriteria[0].key === key;
                    if (isSameSingleSort) {
                        if (sortCriteria[0].direction === 'asc') {
                            sortCriteria[0].direction = 'desc';
                        } else {
                            sortCriteria = [];
                        }
                    } else {
                        sortCriteria = [{ key, direction: 'asc' }];
                    }
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
        entries.forEach(entry => {
            const row = tbody.insertRow();
            
            const createCellWithDiv = (text) => {
                const cell = row.insertCell();
                const contentDiv = document.createElement('div');
                contentDiv.textContent = text;
                contentDiv.title = text; // Add title attribute for tooltip
                cell.appendChild(contentDiv);
                return cell;
            };

            createCellWithDiv(entry.method);
            
            const statusCell = createCellWithDiv(entry.status);
            statusCell.className = entry.status >= 400 ? 'status-error' : 'status-success';

            createCellWithDiv(Math.round(entry.time));
            createCellWithDiv(entry.size === -1 ? 'N/A' : entry.size);
            createCellWithDiv(entry.mimeType || 'N/A');
            
            const urlCell = createCellWithDiv(entry.url);
            urlCell.className = 'url';
        });

        return table;
    }
});
