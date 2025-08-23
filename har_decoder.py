import json
import argparse
from typing import Dict, Any

def analyze_har(har_data: Dict[str, Any]) -> None:
    """
    Analyzes the HAR data and prints a summary.
    """
    log = har_data.get('log', {})
    
    version = log.get('version', 'N/A')
    creator = log.get('creator', {}).get('name', 'N/A')
    
    print(f"HAR Version: {version}")
    print(f"Creator: {creator}")
    
    entries = log.get('entries', [])
    print(f"\nTotal requests: {len(entries)}")

def main():
    """
    Main function to parse arguments and start the analysis.
    """
    parser = argparse.ArgumentParser(description='Analyze a .HAR file.')
    parser.add_argument('har_file', type=str, help='Path to the .HAR file')
    args = parser.parse_args()

    try:
        with open(args.har_file, 'r', encoding='utf-8') as f:
            har_data = json.load(f)
        
        analyze_har(har_data)

    except FileNotFoundError:
        print(f"Error: The file '{args.har_file}' was not found.")
    except json.JSONDecodeError:
        print(f"Error: The file '{args.har_file}' is not a valid JSON file.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    main()
