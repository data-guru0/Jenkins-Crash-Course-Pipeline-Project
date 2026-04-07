import subprocess
import sys
import os

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    app_path = os.path.join(script_dir, "src", "ui", "app.py")

    cmd = [
        sys.executable, "-m", "streamlit", "run", app_path,
        "--server.port=8501",
        "--server.address=0.0.0.0",
        "--server.enableCORS=false",
        "--server.enableXsrfProtection=false",
        "--server.enableWebsocketCompression=false",
        "--server.headless=true"
    ]

    subprocess.run(cmd, check=True)

if __name__ == "__main__":
    main()