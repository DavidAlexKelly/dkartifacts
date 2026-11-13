import sys
from pathlib import Path

# Run from anywhere: put terrain-gen/ on the path so `terrain_gen` imports.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
