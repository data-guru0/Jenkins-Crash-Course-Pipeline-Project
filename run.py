import subprocess
import sys
import os

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    app_path = os.path.join(script_dir, "src", "ui", "app.py")
    
    cmd = [sys.executable, "-m", "streamlit", "run", app_path] + sys.argv[1:]
    
    try:
        subprocess.run(cmd, check=True)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
