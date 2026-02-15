
import os
import pandas as pd
import time

ROOT_DIR = r"c:/Users/admin/Desktop/vton extractor"

def test_load():
    print(f"Scanning {ROOT_DIR}")
    if os.path.exists(ROOT_DIR):
        for root, dirs, files in os.walk(ROOT_DIR):
            csv_path = None
            if "catalogue.csv" in files:
                print(f"Found catalogue.csv in {root}")
                csv_path = os.path.join(root, "catalogue.csv")
            elif "catalogue - Sheet1.csv" in files:
                print(f"Found catalogue - Sheet1.csv in {root}")
                csv_path = os.path.join(root, "catalogue - Sheet1.csv")

            if csv_path:
                print(f"Processing {csv_path}...")
                try:
                    df = pd.read_csv(csv_path)
                    print(f"  Loaded {len(df)} rows.")
                    print(f"  Columns: {df.columns.tolist()}")
                    
                    # Check required columns
                    required_cols = ['id', 'Name', 'Brand', 'MRP', 'Thumbnail Image Filename']
                    missing = [c for c in required_cols if c not in df.columns]
                    if missing:
                        print(f"  WARNING: Missing columns: {missing}")
                    
                    # Show first row sample
                    if not df.empty:
                        print(f"  Sample row: {df.iloc[0].to_dict()}")
                        
                except Exception as e:
                    print(f"  Error reading CSV: {e}")

test_load()
