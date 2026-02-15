
import os
import pandas as pd

ROOT_DIR = r"c:/Users/admin/Desktop/vton extractor/vton-extraction"

def test_load():
    print(f"Scanning {ROOT_DIR}")
    if os.path.exists(ROOT_DIR):
        for root, dirs, files in os.walk(ROOT_DIR):
            if "catalogue.csv" in files:
                print(f"Found catalogue.csv in {root}")
                csv_path = os.path.join(root, "catalogue.csv")
                
                garment_dir = os.path.join(root, "garment")
                if not os.path.exists(garment_dir) and os.path.exists(os.path.join(root, "garments")):
                    garment_dir = os.path.join(root, "garments")
                
                print(f"Garment dir (detected): {garment_dir}")
                print(f"Exists? {os.path.exists(garment_dir)}")

                try:
                    df = pd.read_csv(csv_path)
                    print(f"Loaded CSV with {len(df)} rows")
                    print("Columns:", df.columns.tolist())
                    print("First row:", df.iloc[0].to_dict())
                except Exception as e:
                    print(f"Error reading CSV: {e}")

test_load()
