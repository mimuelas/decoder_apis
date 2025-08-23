document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('upload-form');
    const harFileInput = document.getElementById('har-file');
    const dropZone = document.getElementById('drop-zone');
    const fileInfo = document.getElementById('file-info');
    const fileNameSpan = document.getElementById('file-name');
    const resultsSection = document.getElementById('results-section');
    const resultsContainer = document.getElementById('results-container');
    const spinner = document.getElementById('spinner');

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
            renderResults(data);

        } catch (error) {
            resultsContainer.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        } finally {
            spinner.classList.add('spinner-hidden');
        }
    });

    // --- Render Results ---
    function renderResults(data) {
        resultsContainer.innerHTML = ''; // Clear again just in case

        function showNoResults() {
            resultsContainer.innerHTML = '<p>No matching requests found.</p>';
        }

        if (Array.isArray(data)) {
            // Non-grouped results
            if (data.length === 0) {
                 showNoResults();
                 return;
            }
            resultsContainer.appendChild(createTable(data));
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
                
                groupDiv.appendChild(createTable(entries));
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
        const headers = ['Method', 'Status', 'Time (ms)', 'Size (B)', 'MIME Type', 'URL'];
        headers.forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
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
