from flask import Flask, request, jsonify, render_template
import json
from collections import defaultdict
import os

# --- HAR Analyzer Logic ---
# (We'll move the logic from har_decoder.py here and adapt it)

def analyze_har_data(har_data: dict, args: dict) -> list:
    """Analyzes and filters HAR data, returning a list of entries."""
    log = har_data.get('log', {})
    entries = log.get('entries', [])
    
    # Filtering logic
    filtered_entries = []
    for entry in entries:
        request = entry.get('request', {})
        response = entry.get('response', {})
        
        status = response.get('status', 0)
        if args.get('has_errors') and status < 400:
            continue
        if args.get('no_errors') and status >= 400:
            continue
            
        method = request.get('method', '')
        if args.get('method') and method.upper() not in [m.upper() for m in args['method']]:
            continue

        content = response.get('content', {})
        mime_type = content.get('mimeType', '')
        if args.get('content_type') and not any(ct.lower() in mime_type.lower() for ct in args['content_type']):
            continue

        url = request.get('url', '')
        if args.get('url_contains') and args['url_contains'].lower() not in url.lower():
            continue
            
        filtered_entries.append(entry)

    # Sorting logic
    sort_by = args.get('sort_by', 'time')
    reverse = args.get('reverse', False)
    if sort_by == 'time':
        filtered_entries.sort(key=lambda e: e.get('time', 0), reverse=reverse)
    elif sort_by == 'size':
        filtered_entries.sort(key=lambda e: e.get('response', {}).get('content', {}).get('size', 0), reverse=reverse)
        
    return filtered_entries

def format_entries_for_display(entries: list) -> list:
    """Formats the list of entries into a more frontend-friendly structure."""
    formatted = []
    for entry in entries:
        request = entry.get('request', {})
        response = entry.get('response', {})
        content = response.get('content', {})
        
        # Determine a simple content type
        mime_type = content.get('mimeType', 'N/A').split(';')[0]
        simple_mime = mime_type.split('/')[-1]

        formatted.append({
            'method': request.get('method', 'N/A'),
            'status': response.get('status', 'N/A'),
            'url': request.get('url', 'N/A'),
            'time': f"{entry.get('time', 0):.2f}ms",
            'size': content.get('size', -1),
            'mimeType': simple_mime if simple_mime else "unknown"
        })
    return formatted

# --- Flask App ---

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_har():
    if 'har_file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['har_file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        # It's more robust to read the file's content and then load it as JSON
        # This handles potential encoding issues better.
        file_content = file.read().decode('utf-8')
        har_data = json.loads(file_content)
        
        # Get options from the form data
        options = {
            'has_errors': request.form.get('error-filter') == 'has-errors',
            'no_errors': request.form.get('error-filter') == 'no-errors',
            'method': request.form.getlist('method'),
            'content_type': request.form.getlist('content-type'),
            'url_contains': request.form.get('url-contains', ''),
            'sort_by': request.form.get('sort-by', 'time'),
            'reverse': request.form.get('sort-order') == 'desc',
            'group_by': request.form.get('group-by', '')
        }
        
        # Process and filter data
        filtered_entries = analyze_har_data(har_data, options)
        
        # Grouping logic
        group_by = options.get('group_by')
        if group_by:
            groups = defaultdict(list)
            for entry in filtered_entries:
                key = 'N/A'
                if group_by == 'method':
                    key = entry.get('request', {}).get('method', 'N/A')
                elif group_by == 'content-type':
                    mime_type = entry.get('response', {}).get('content', {}).get('mimeType', 'N/A')
                    simple_mime = mime_type.split(';')[0].split('/')[-1]
                    key = simple_mime if simple_mime else "unknown"
                elif group_by == 'status':
                    status = entry.get('response', {}).get('status', 0)
                    key = f"{status // 100}xx" if status > 0 else "Status N/A"
                groups[key].append(entry)
            
            # Format entries within each group for display
            display_groups = {k: format_entries_for_display(v) for k, v in groups.items()}
            return jsonify(display_groups)

        else:
            # Just return the formatted list if not grouping
            return jsonify(format_entries_for_display(filtered_entries))

    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON in HAR file. Check if the file is corrupted or incomplete.'}), 400
    except UnicodeDecodeError:
        return jsonify({'error': 'Failed to decode the file. Please ensure it is UTF-8 encoded.'}), 400
    except Exception as e:
        return jsonify({'error': f'An unexpected error occurred: {str(e)}'}), 500

if __name__ == '__main__':
    # Use a high port number to avoid conflicts
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
