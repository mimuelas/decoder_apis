from flask import Flask, request, render_template, redirect
import os
import time
import logging
from urllib.parse import urlparse, urlunparse

# --- Flask App ---

app = Flask(__name__)

# --- Production-Ready Logging ---
if not app.debug:
    # Configure logging to stdout/stderr (Google Cloud captures this automatically)
    handler = logging.StreamHandler()
    handler.setLevel(logging.ERROR)  # Log only errors and critical issues
    # Create a formatter and set it for the handler
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    app.logger.addHandler(handler)


@app.before_request
def redirect_www():
    """Redirects www to non-www for SEO consolidation."""
    urlparts = urlparse(request.url)
    if urlparts.netloc.startswith('www.'):
        urlparts_list = list(urlparts)
        urlparts_list[1] = urlparts_list[1][4:]
        return redirect(urlunparse(urlparts_list), code=301)


@app.route('/')
def index():
    ga_id = os.environ.get('GOOGLE_ANALYTICS_ID')
    return render_template('index.html', version=time.time(), ga_id=ga_id)


@app.route('/privacy')
def privacy():
    ga_id = os.environ.get('GOOGLE_ANALYTICS_ID')
    return render_template('privacy.html', version=time.time(), ga_id=ga_id)


@app.route('/terms')
def terms():
    ga_id = os.environ.get('GOOGLE_ANALYTICS_ID')
    return render_template('terms.html', version=time.time(), ga_id=ga_id)


@app.errorhandler(404)
def page_not_found(e):
    ga_id = os.environ.get('GOOGLE_ANALYTICS_ID')
    return render_template('404.html', ga_id=ga_id), 404


@app.errorhandler(500)
def internal_server_error(e):
    ga_id = os.environ.get('GOOGLE_ANALYTICS_ID')
    return render_template('500.html', ga_id=ga_id), 500


if __name__ == '__main__':
    # Production-ready configuration
    is_debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'

    # Use a high port number to avoid conflicts
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port, debug=is_debug)
