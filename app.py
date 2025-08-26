from flask import Flask, request, jsonify, render_template
import json
from collections import defaultdict
import os
import shlex
from urllib.parse import urlparse
import mimetypes

# --- File Extension Logic ---

def get_extension_from_mimetype(mime_type_str: str) -> str:
    """Guesses a file extension from a MIME type string in a robust way."""
    if not mime_type_str:
        return 'bin'  # Default for unknown

    # Clean up the mime type (e.g., 'application/json; charset=utf-8' -> 'application/json')
    base_mime_type = mime_type_str.split(';')[0].strip()

    # Use the mimetypes library to guess the extension
    extension = mimetypes.guess_extension(base_mime_type, strict=False)

    if extension:
        # mimetypes returns '.ext', so we strip the dot
        return extension.lstrip('.')
    else:
        # Fallback for truly unknown types like application/octet-stream
        if 'json' in base_mime_type: return 'json'
        if 'javascript' in base_mime_type: return 'js'
        if 'svg' in base_mime_type: return 'svg'
        return 'bin'

# --- cURL Generation ---

def generate_curl_command(entry: dict) -> str:
    """Generates a cURL command string from a HAR entry."""
    req = entry.get('request', {})
    
    parts = ['curl', shlex.quote(req.get('url', ''))]

    method = req.get('method', 'GET').upper()
    if method != 'GET':
        parts.extend(['-X', method])

    for header in req.get('headers', []):
        parts.extend(['-H', shlex.quote(f"{header['name']}: {header['value']}")])

    post_data = req.get('postData', {})
    if 'text' in post_data:
        # shlex.quote handles escaping for the shell
        parts.extend(['--data-binary', shlex.quote(post_data['text'])])
        
        # Add content-type header if not already present
        has_content_type = any(h['name'].lower() == 'content-type' for h in req.get('headers', []))
        if not has_content_type and 'mimeType' in post_data:
            parts.extend(['-H', shlex.quote(f"Content-Type: {post_data['mimeType']}")])

    return ' '.join(parts)


# --- HAR Analyzer Logic ---
# (We'll move the logic from har_decoder.py here and adapt it)

def analyze_har_data(har_data: dict, args: dict) -> list:
    """Analyzes and filters HAR data, returning a list of entries."""
    log = har_data.get('log', {})
    entries = log.get('entries', [])
    
    # Add a unique ID to each entry before filtering
    entries_with_id = []
    for i, entry in enumerate(entries):
        entry['_id'] = i
        entries_with_id.append(entry)

    # Filtering logic
    filtered_entries = []
    
    # Pre-process filters for efficiency
    methods_to_check = {m.upper() for m in args.get('method', [])}
    content_types_to_check = {ct.lower() for ct in args.get('content_type', [])}

    for entry in entries_with_id:
        request = entry.get('request', {})
        response = entry.get('response', {})
        
        # Domain filtering
        if args.get('domains'):
            url = request.get('url', '')
            if url:
                try:
                    domain = urlparse(url).netloc
                    if domain not in args['domains']:
                        continue
                except Exception:
                    continue # Skip invalid URLs
            else:
                continue # Skip entries without URLs

        status = response.get('status', 0)
        if args.get('has_errors') and status < 400:
            continue
        if args.get('no_errors') and status >= 400:
            continue
            
        method = request.get('method', '')
        if methods_to_check and method.upper() not in methods_to_check:
            continue

        content = response.get('content', {})
        mime_type = content.get('mimeType', '').lower()
        if content_types_to_check and not any(ct in mime_type for ct in content_types_to_check):
            continue

        url = request.get('url', '')
        if args.get('url_contains') and args['url_contains'].lower() not in url.lower():
            continue
            
        # Filter by URL length
        max_len = args.get('max_url_len')
        if max_len is not None and len(url) > max_len:
            continue

        filtered_entries.append(entry)

    # Sorting is now handled client-side
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
            '_id': entry.get('_id'),
            'method': request.get('method', 'N/A'),
            'status': response.get('status', 'N/A'),
            'url': request.get('url', 'N/A'),
            'time': entry.get('time', 0),
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
        max_url_len_str = request.form.get('max-url-len')
        max_url_len = None
        if max_url_len_str and max_url_len_str.isdigit():
            max_url_len = int(max_url_len_str)

        options = {
            'has_errors': request.form.get('error-filter') == 'has-errors',
            'no_errors': request.form.get('error-filter') == 'no-errors',
            'method': request.form.getlist('method'),
            'content_type': request.form.getlist('content-type'),
            'url_contains': request.form.get('url-contains', ''),
            'max_url_len': max_url_len,
            'group_by': request.form.get('group-by', ''),
            'domains': request.form.getlist('domains')
        }
        
        # Process and filter data
        filtered_entries = analyze_har_data(har_data, options)

        # Create a map of full entries for the modal view and add cURL commands
        full_data_map = {}
        for entry in filtered_entries:
            entry['curl'] = generate_curl_command(entry)
            entry['fileExtension'] = get_extension_from_mimetype(
                entry.get('response', {}).get('content', {}).get('mimeType', '')
            )
            full_data_map[entry['_id']] = entry
        
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
                elif group_by == 'domain':
                    url = entry.get('request', {}).get('url', '')
                    if url:
                        try:
                            key = urlparse(url).netloc
                        except Exception:
                            key = "Invalid URL"
                    else:
                        key = "No URL"
                groups[key].append(entry)
            
            # Format entries within each group for display
            display_groups = {k: format_entries_for_display(v) for k, v in groups.items()}
            return jsonify({'displayData': display_groups, 'fullDataMap': full_data_map})

        else:
            # Just return the formatted list if not grouping
            display_data = format_entries_for_display(filtered_entries)
            return jsonify({'displayData': display_data, 'fullDataMap': full_data_map})

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
