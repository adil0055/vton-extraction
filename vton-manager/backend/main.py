import os
import shutil
import time
from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import pandas as pd
import requests
from pydantic import BaseModel
import json
import zipfile
import io
import boto3
from botocore.exceptions import NoCredentialsError

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
ROOT_DIR = r"c:/Users/admin/Desktop/vton extractor"
PROCESSED_DIR = "./processed_images"
TEMP_CROP_DIR = "./temp_crops"
INFERENCE_URL = "http://82.141.118.34:29894/infer"
THUMB_DIR = "./thumbnails"
QUEUE_FILE = "queue_data.json"

# Ensure directories exist
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(TEMP_CROP_DIR, exist_ok=True)
os.makedirs(THUMB_DIR, exist_ok=True)

# Try to ensure ROOT_DIR exists
if not os.path.exists(ROOT_DIR):
    try:
        os.makedirs(ROOT_DIR, exist_ok=True)
    except Exception as e:
        print(f"Warning: Could not create ROOT_DIR {ROOT_DIR}: {e}")

class QueueItem(BaseModel):
    product_id: str
    image_filename: str
    status: str = "pending" # pending, processing, completed, approved
    processed_image_path: Optional[str] = None
    is_cropped: bool = False

def load_queue_from_file():
    if os.path.exists(QUEUE_FILE):
        try:
            with open(QUEUE_FILE, 'r') as f:
                data = json.load(f)
                return [QueueItem(**item) for item in data]
        except Exception as e:
            print(f"Failed to load queue: {e}")
    return []

def save_queue_to_file():
    try:
        data = [item.dict() for item in extraction_queue]
        with open(QUEUE_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Failed to save queue: {e}")

extraction_queue: List[QueueItem] = load_queue_from_file()

class ProductUpdate(BaseModel):
    vton_image: str

# Global Cache
PRODUCTS_CACHE = []
LAST_CACHE_UPDATE = 0
CACHE_DURATION = 300 # 5 minutes

def upload_file_to_s3(file_path, bucket_name, s3_key):
    """Uploads a file to S3 if credentials are available."""
    try:
        s3 = boto3.client('s3')
        s3.upload_file(file_path, bucket_name, s3_key)
        return f"https://{bucket_name}.s3.amazonaws.com/{s3_key}"
    except NoCredentialsError:
        print("S3 Credentials not available.")
        return None
    except Exception as e:
        print(f"S3 Upload Error: {e}")
        return None

# Helper to load all products
def load_all_products(force_refresh=False):
    global PRODUCTS_CACHE, LAST_CACHE_UPDATE
    
    current_time = time.time()
    if not force_refresh and PRODUCTS_CACHE and (current_time - LAST_CACHE_UPDATE < CACHE_DURATION):
        return PRODUCTS_CACHE
        
    print("Refreshing product cache...")
    all_products = []
    
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
                # Check for "garment" or "garments" folder
                garment_dir = os.path.join(root, "garment")
                if not os.path.exists(garment_dir) and os.path.exists(os.path.join(root, "garments")):
                    garment_dir = os.path.join(root, "garments")
                
                try:
                    df = pd.read_csv(csv_path)
                    # Helper to safely get a string field (NaN -> "")
                    def safe_str(val, default=""):
                        return str(val) if pd.notna(val) else default

                    for _, row in df.iterrows():
                        other_images = str(row.get('Other images filename', '')).split('; ') if pd.notna(row.get('Other images filename')) else []
                        size_chart_raw = safe_str(row.get('size_chart'))
                        all_products.append({
                            "id": str(row['id']),
                            "name": safe_str(row.get('Name')),
                            "brand": safe_str(row.get('Brand')),
                            "mrp": float(row['MRP']) if 'MRP' in row and pd.notna(row['MRP']) else 0.0,
                            "discount_percent": float(row['Discount %']) if 'Discount %' in row and pd.notna(row['Discount %']) else 0.0,
                            "category": safe_str(row.get('Category')),
                            "sub_category": safe_str(row.get('Sub_Category')),
                            "gender": safe_str(row.get('Gender')),
                            "color": safe_str(row.get('Color')),
                            "description": safe_str(row.get('Description')),
                            "material_care": safe_str(row.get('Material Care')),
                            "sizes": safe_str(row.get('sizes')),
                            "thumbnail_image": safe_str(row.get('Thumbnail Image Filename')),
                            "vton_image": safe_str(row.get('Vton Ready Image Filename'), None),
                            "other_images": other_images,
                            "size_chart": size_chart_raw,
                            "_base_garment_dir": garment_dir,
                            "_source_csv": csv_path
                        })
                except Exception as e:
                    print(f"Error reading {csv_path}: {e}")
                    continue
    
    PRODUCTS_CACHE = all_products
    LAST_CACHE_UPDATE = current_time
    print(f"Cache refreshed. Found {len(all_products)} products.")
    return all_products

import asyncio

def cleanup_temp_files():
    """Remove orphaned files from temp_crops, processed_images, and thumbnails."""
    # Collect all filenames and product IDs still referenced by the queue
    queue_crop_files = set()
    queue_processed_files = set()
    queue_product_ids = set()
    for item in extraction_queue:
        queue_crop_files.add(item.image_filename)
        if item.processed_image_path:
            queue_processed_files.add(item.processed_image_path)
        queue_processed_files.add(f"processed_{item.product_id}_{item.image_filename}")
        queue_product_ids.add(item.product_id)

    # Collect all valid product IDs
    products = load_all_products()
    valid_product_ids = set(p['id'] for p in products)

    cleaned = {"temp_crops": 0, "processed_images": 0, "thumbnails": 0}

    # 1. Clean temp_crops — keep only files referenced by current queue items
    if os.path.exists(TEMP_CROP_DIR):
        for f in os.listdir(TEMP_CROP_DIR):
            if f not in queue_crop_files:
                try:
                    os.remove(os.path.join(TEMP_CROP_DIR, f))
                    cleaned["temp_crops"] += 1
                except: pass

    # 2. Clean processed_images — keep only files referenced by current queue items
    if os.path.exists(PROCESSED_DIR):
        for f in os.listdir(PROCESSED_DIR):
            if f not in queue_processed_files:
                try:
                    os.remove(os.path.join(PROCESSED_DIR, f))
                    cleaned["processed_images"] += 1
                except: pass

    # 3. Clean thumbnails — keep only thumbnails for valid products
    if os.path.exists(THUMB_DIR):
        for f in os.listdir(THUMB_DIR):
            # Thumbnail filenames are: thumb_{product_id}_{original_filename}
            # Extract product_id from the filename
            if f.startswith("thumb_"):
                parts = f[len("thumb_"):].split("_", 1)
                product_id = parts[0] if parts else ""
                if product_id and product_id not in valid_product_ids:
                    try:
                        os.remove(os.path.join(THUMB_DIR, f))
                        cleaned["thumbnails"] += 1
                    except: pass

    total = sum(cleaned.values())
    if total > 0:
        print(f"Cleanup: removed {cleaned['temp_crops']} temp crops, {cleaned['processed_images']} processed images, {cleaned['thumbnails']} thumbnails")
    return cleaned

@app.on_event("startup")
async def startup_event():
    load_all_products(force_refresh=True)
    cleanup_temp_files()
    asyncio.create_task(queue_worker())

async def queue_worker():
    print("Queue worker started.")
    cleanup_counter = 0
    while True:
        await asyncio.sleep(3)
        is_processing = any(item.status == "processing" for item in extraction_queue)
        if is_processing: continue
        
        pending_item = next((item for item in extraction_queue if item.status == "pending"), None)
        if pending_item:
            print(f"Auto-processing: {pending_item.product_id}/{pending_item.image_filename}")
            await asyncio.to_thread(do_process_item, pending_item)
        
        # Run cleanup every ~60 seconds (20 iterations × 3s sleep)
        cleanup_counter += 1
        if cleanup_counter >= 20:
            cleanup_counter = 0
            await asyncio.to_thread(cleanup_temp_files)

def do_process_item(queue_item):
    product_id = queue_item.product_id
    filename = queue_item.image_filename
    
    queue_item.status = "processing"
    save_queue_to_file()
    
    input_path = None
    temp_path = os.path.join(TEMP_CROP_DIR, filename)
    if os.path.exists(temp_path):
        input_path = temp_path
    else:
        products = load_all_products()
        product = next((p for p in products if p['id'] == product_id), None)
        if not product:
            queue_item.status = "failed"
            save_queue_to_file()
            print(f"Processing failed: Product {product_id} not found")
            return
        input_path = os.path.join(product['_base_garment_dir'], product_id, filename)

    if not os.path.exists(input_path):
        queue_item.status = "failed"
        save_queue_to_file()
        print(f"Processing failed: Source file not found at {input_path}")
        return

    processed_filename = f"processed_{product_id}_{filename}"
    output_path = os.path.join(PROCESSED_DIR, processed_filename)

    try:
        success = False
        try:
            with open(input_path, 'rb') as f:
                content_type = 'image/png' if filename.endswith('.png') else 'image/jpeg'
                files = {'image': (filename, f, content_type)}
                data = {'category': 'dress', 'seed': 42, 'steps': 10, 'cfg': 1.0}
                response = requests.post(INFERENCE_URL, files=files, data=data, timeout=120)
                if response.status_code == 200:
                    with open(output_path, 'wb') as out_f:
                        out_f.write(response.content)
                    success = True
                else:
                    print(f"Inference failed: {response.status_code} {response.text}")
        except Exception as e:
            print(f"Inference connection error: {e}")

        if not success:
            shutil.copy(input_path, output_path)

        queue_item.status = "completed"
        queue_item.processed_image_path = processed_filename
        save_queue_to_file()
        print(f"Processing complete: {processed_filename}")

    except Exception as e:
        queue_item.status = "failed"
        save_queue_to_file()
        print(f"Processing error: {e}")

@app.get("/products")
async def get_products(page: int = 1, limit: int = 30, pending_only: bool = False):
    try:
        products = load_all_products()
        if pending_only:
            products = [p for p in products if not p.get('vton_image')]
        start = (page - 1) * limit
        end = start + limit
        paginated_products = products[start:end]
        response_products = []
        for p in paginated_products:
            p_copy = p.copy()
            if '_base_garment_dir' in p_copy: del p_copy['_base_garment_dir']
            if '_source_csv' in p_copy: del p_copy['_source_csv']
            response_products.append(p_copy)
        return {"total": len(products), "page": page, "limit": limit, "products": response_products}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/product/{product_id}")
async def get_product(product_id: str):
    try:
        products = load_all_products()
        product = next((p for p in products if p['id'] == product_id), None)
        if not product: raise HTTPException(status_code=404, detail="Product not found")
        p_copy = product.copy()
        if '_base_garment_dir' in p_copy: del p_copy['_base_garment_dir']
        if '_source_csv' in p_copy: del p_copy['_source_csv']
        return p_copy
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/images/{product_id}/{filename}")
async def get_image(product_id: str, filename: str):
    temp_path = os.path.join(TEMP_CROP_DIR, filename)
    if os.path.exists(temp_path): return FileResponse(temp_path)
    products = load_all_products()
    product = next((p for p in products if p['id'] == product_id), None)
    if not product: raise HTTPException(status_code=404, detail="Product not found")
    path = os.path.join(product['_base_garment_dir'], product_id, filename)
    if os.path.exists(path): return FileResponse(path)
    raise HTTPException(status_code=404, detail="Image not found")

from PIL import Image

@app.get("/thumbnail/{product_id}/{filename}")
async def get_thumbnail(product_id: str, filename: str):
    thumb_filename = f"thumb_{product_id}_{filename}"
    thumb_path = os.path.join(THUMB_DIR, thumb_filename)
    if os.path.exists(thumb_path): return FileResponse(thumb_path)
    products = load_all_products()
    product = next((p for p in products if p['id'] == product_id), None)
    if not product: raise HTTPException(status_code=404, detail="Product not found")
    original_path = os.path.join(product['_base_garment_dir'], product_id, filename)
    if not os.path.exists(original_path):
        temp_path = os.path.join(TEMP_CROP_DIR, filename)
        if os.path.exists(temp_path): original_path = temp_path
        else: raise HTTPException(status_code=404, detail="Image not found")
    try:
        with Image.open(original_path) as img:
            img.thumbnail((400, 400))
            if img.mode in ("RGBA", "P"): img = img.convert("RGB")
            img.save(thumb_path, "JPEG", quality=70)
        return FileResponse(thumb_path)
    except Exception as e:
        return FileResponse(original_path)

@app.get("/processed-images/{filename}")
async def get_processed_image(filename: str):
    path = os.path.join(PROCESSED_DIR, filename)
    if os.path.exists(path): return FileResponse(path)
    raise HTTPException(status_code=404, detail="Image not found")

@app.post("/queue/add")
async def add_to_queue(item: QueueItem):
    for q_item in extraction_queue:
        if q_item.product_id == item.product_id and q_item.image_filename == item.image_filename:
             return {"message": "Already in queue", "queue": extraction_queue}
    extraction_queue.append(item)
    save_queue_to_file()
    return {"message": "Added to queue", "queue": extraction_queue}

@app.get("/queue")
async def get_queue():
    return extraction_queue

@app.delete("/queue/approved")
async def clear_approved():
    global extraction_queue
    approved_count = len([q for q in extraction_queue if q.status == "approved"])
    extraction_queue = [q for q in extraction_queue if q.status != "approved"]
    save_queue_to_file()
    cleanup_temp_files()
    return {"message": f"Cleared {approved_count} approved items", "cleared": approved_count}

@app.delete("/queue/{product_id}/{filename}")
async def delete_from_queue(product_id: str, filename: str):
    global extraction_queue
    initial_len = len(extraction_queue)
    extraction_queue = [q for q in extraction_queue if not (q.product_id == product_id and q.image_filename == filename)]
    if len(extraction_queue) < initial_len:
        processed_filename = f"processed_{product_id}_{filename}"
        processed_path = os.path.join(PROCESSED_DIR, processed_filename)
        if os.path.exists(processed_path):
            try: os.remove(processed_path)
            except: pass
        save_queue_to_file()
        cleanup_temp_files()
        return {"message": "Removed from queue"}
    raise HTTPException(status_code=404, detail="Item not found")

@app.post("/process/{product_id}/{filename}")
async def process_image(product_id: str, filename: str):
    queue_item = None
    for item in extraction_queue:
        if item.product_id == product_id and item.image_filename == filename:
            queue_item = item
            break
    if not queue_item: raise HTTPException(status_code=404, detail="Item not found in queue")
    await asyncio.to_thread(do_process_item, queue_item)
    return {"message": "Processing complete"}

@app.post("/upload-crop/{product_id}")
async def upload_cropped_image(product_id: str, file: UploadFile = File(...)):
    try:
        timestamp = int(time.time())
        filename = f"cropped_{timestamp}.png"
        file_path = os.path.join(TEMP_CROP_DIR, filename)
        with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        return {"filename": filename}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/approve/{product_id}/{filename}")
async def approve_image(product_id: str, filename: str, processed_filename: str):
    products = load_all_products()
    product = next((p for p in products if p['id'] == product_id), None)
    if not product: raise HTTPException(status_code=404, detail="Product not found")

    source_path = os.path.join(PROCESSED_DIR, processed_filename)
    new_filename = f"{product_id}_vton.png" 
    dest_path = os.path.join(product['_base_garment_dir'], product_id, new_filename)
    
    if not os.path.exists(source_path): raise HTTPException(status_code=404, detail="Processed image not found")
    shutil.copy(source_path, dest_path)
    
    # Try S3 upload for correct flow
    s3_bucket = os.environ.get("S3_BUCKET_NAME")
    if s3_bucket:
        try:
            # Try to determine client_id/structure or just use a flat structure for now
            # Best effort S3 key
            s3_key = f"products/{product_id}/{new_filename}" 
            upload_file_to_s3(dest_path, s3_bucket, s3_key)
        except Exception as e:
            print(f"S3 upload in approve failed: {e}")

    try:
        csv_path = product['_source_csv']
        df = pd.read_csv(csv_path)
        mask = df['id'].astype(str) == product_id
        if not mask.any(): raise HTTPException(status_code=404, detail="Product not found in CSV")
        df.loc[mask, 'Vton Ready Image Filename'] = new_filename
        df.to_csv(csv_path, index=False)
        for item in extraction_queue:
            if item.product_id == product_id and item.image_filename == filename:
                item.status = "approved"
                save_queue_to_file()
                break
        load_all_products(force_refresh=True)
        return {"message": "Image approved and CSV updated", "vton_filename": new_filename}
    except Exception as e: raise HTTPException(status_code=500, detail=f"Failed to update CSV: {str(e)}")

@app.post("/catalogues/upload")
async def upload_catalogue(
    client_id: int = Form(...),
    location_ids: Optional[str] = Form(None),
    file: UploadFile = File(...),
    images_zip: UploadFile = File(...)
):
    upload_id = str(int(time.time()))
    upload_rel_path = f"client_{client_id}/upload_{upload_id}"
    upload_dir = os.path.join(ROOT_DIR, upload_rel_path)
    os.makedirs(upload_dir, exist_ok=True)
    
    csv_filename = "catalogue.csv"
    csv_path = os.path.join(upload_dir, csv_filename)
    with open(csv_path, "wb") as f: shutil.copyfileobj(file.file, f)
        
    try:
        zip_content = await images_zip.read()
        zip_file = zipfile.ZipFile(io.BytesIO(zip_content))
        extract_path = os.path.join(upload_dir, "garment")
        os.makedirs(extract_path, exist_ok=True)
        zip_file.extractall(extract_path)
        
        # Handle "garments" subfolder from zip
        extracted_items = os.listdir(extract_path)
        if len(extracted_items) == 1 and extracted_items[0].lower() == 'garments' and os.path.isdir(os.path.join(extract_path, extracted_items[0])):
            nested_dir = os.path.join(extract_path, extracted_items[0])
            for item in os.listdir(nested_dir):
                shutil.move(os.path.join(nested_dir, item), extract_path)
            os.rmdir(nested_dir)
            
        df = pd.read_csv(csv_path)
        required_columns = ["id", "Name", "Category", "Gender", "Thumbnail Image Filename"]
        missing_cols = [col for col in required_columns if col not in df.columns]
        if missing_cols:
            shutil.rmtree(upload_dir)
            raise HTTPException(status_code=400, detail=f"Missing required columns: {missing_cols}")

        validation_errors = []
        s3_bucket = os.environ.get("S3_BUCKET_NAME")
        do_s3_upload = s3_bucket is not None
        
        # Helper to check image
        # Assuming zip extracted structure: extract_path/garments/SKU...
        # So we search recursively
        
        for idx, row in df.iterrows():
            product_id = str(row['id'])
            for img_col in ['Thumbnail Image Filename', 'Vton Ready Image Filename']: 
                if img_col in row and pd.notna(row[img_col]):
                    image_filename = row[img_col]
                    found_path = None
                    for root, dirs, files in os.walk(extract_path):
                         if image_filename in files:
                             found_path = os.path.join(root, image_filename)
                             break
                    if not found_path:
                        validation_errors.append(f"Row {idx+1}: Image {image_filename} not found for ID {product_id}")
                    elif do_s3_upload:
                         try:
                             s3_key = f"clients/{client_id}/products/{product_id}/{image_filename}"
                             upload_file_to_s3(found_path, s3_bucket, s3_key)
                         except: pass

        if validation_errors:
            shutil.rmtree(upload_dir)
            return {
                "success": False,
                "validation_report": {
                    "status": "failed",
                    "total_rows": len(df),
                    "valid_rows": len(df) - len(validation_errors),
                    "errors": validation_errors
                }
            }
            
        load_all_products(force_refresh=True)
        return {
            "success": True,
            "message": f"Successfully uploaded {len(df)} products",
            "products_processed": len(df),
            "validation_report": { "status": "completed", "total_rows": len(df), "valid_rows": len(df), "errors": [] }
        }

    except zipfile.BadZipFile:
        shutil.rmtree(upload_dir)
        raise HTTPException(status_code=400, detail="Invalid ZIP file")
    except Exception as e:
        if os.path.exists(upload_dir): shutil.rmtree(upload_dir)
        raise HTTPException(status_code=500, detail=str(e))
# ─── Client & Location Proxy Endpoints ─────────────────────────────
# These proxy to the internal admin API for client/location data
INTERNAL_API_URL = os.environ.get("INTERNAL_API_URL", "http://35.154.214.159:8000/api/internal")
INTERNAL_API_EMAIL = os.environ.get("INTERNAL_API_EMAIL", "admin@fashionx.com")
INTERNAL_API_PASSWORD = os.environ.get("INTERNAL_API_PASSWORD", "adminpassword")

# Token cache
_internal_api_token = os.environ.get("INTERNAL_API_TOKEN", "")
_token_fetched_at = 0
_TOKEN_LIFETIME = 6 * 60 * 60  # Refresh every 6 hours

def get_internal_token():
    """Get API token, auto-login if needed."""
    global _internal_api_token, _token_fetched_at
    
    current_time = time.time()
    
    # Use cached token if still valid
    if _internal_api_token and (current_time - _token_fetched_at < _TOKEN_LIFETIME):
        return _internal_api_token
    
    # If we have a static token from env and never logged in, use it
    if _internal_api_token and _token_fetched_at == 0:
        _token_fetched_at = current_time
        return _internal_api_token
    
    # Try to login
    if not INTERNAL_API_PASSWORD:
        print("Warning: INTERNAL_API_PASSWORD not set, cannot auto-login to internal API")
        return _internal_api_token
    
    try:
        print(f"Logging in to internal API as {INTERNAL_API_EMAIL}...")
        resp = requests.post(
            f"{INTERNAL_API_URL}/auth/login",
            json={"email": INTERNAL_API_EMAIL, "password": INTERNAL_API_PASSWORD},
            timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("data", {}).get("token", "")
            if token:
                _internal_api_token = token
                _token_fetched_at = current_time
                print("Successfully logged in to internal API")
                return token
            else:
                print(f"Login response missing token: {data}")
        else:
            print(f"Internal API login failed: {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        print(f"Internal API login error: {e}")
    
    return _internal_api_token

def refresh_token_on_401():
    """Force re-login on next call."""
    global _token_fetched_at
    _token_fetched_at = 0

def get_internal_headers():
    token = get_internal_token()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

@app.get("/clients")
async def list_clients():
    """Proxy: List all clients from internal API."""
    try:
        resp = requests.get(f"{INTERNAL_API_URL}/clients", headers=get_internal_headers(), timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            # The internal API wraps in {"success": true, "data": [...]}
            if isinstance(data, dict) and "data" in data:
                return data["data"]
            return data
        else:
            print(f"Internal API /clients error: {resp.status_code} {resp.text}")
            raise HTTPException(status_code=resp.status_code, detail="Failed to fetch clients from internal API")
    except requests.exceptions.ConnectionError:
        print("Cannot connect to internal API - returning empty list")
        return []
    except requests.exceptions.Timeout:
        print("Internal API timeout")
        return []

@app.get("/clients/{client_id}/locations")
async def list_client_locations(client_id: int):
    """Proxy: Get locations for a specific client from internal API."""
    try:
        resp = requests.get(f"{INTERNAL_API_URL}/clients/{client_id}", headers=get_internal_headers(), timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            # Extract locations from client detail response
            client_data = data.get("data", data) if isinstance(data, dict) else data
            locations = client_data.get("locations", []) if isinstance(client_data, dict) else []
            return locations
        else:
            print(f"Internal API /clients/{client_id} error: {resp.status_code}")
            raise HTTPException(status_code=resp.status_code, detail="Failed to fetch client locations")
    except requests.exceptions.ConnectionError:
        print("Cannot connect to internal API - returning empty locations")
        return []
    except requests.exceptions.Timeout:
        print("Internal API timeout")
        return []

# ─── Single Product Upload to Internal API ─────────────────────────
@app.post("/catalogue/upload-single")
async def upload_single_product(body: dict):
    """
    Upload a single product to the internal catalogue API.
    Packages product data as a 1-row CSV + image as a ZIP, then POSTs
    to the internal API's /catalogues/upload endpoint.
    """
    client_id = body.get("client_id")
    location_ids = body.get("location_ids")  # list of ints, or None
    custom_location = body.get("custom_location")  # string, or None
    product_data = body.get("product", {})
    size_chart = body.get("size_chart")  # list of dicts or None
    size_chart_unit = body.get("size_chart_unit")
    processed_filename = body.get("processed_filename")

    if not client_id:
        raise HTTPException(status_code=400, detail="client_id is required")
    if not product_data.get("id"):
        raise HTTPException(status_code=400, detail="product.id is required")

    product_id = str(product_data["id"])

    # Find the processed VTON image
    processed_path = os.path.join(PROCESSED_DIR, processed_filename) if processed_filename else None
    
    # Also try the approved image in the garment dir
    products = load_all_products()
    local_product = next((p for p in products if p['id'] == product_id), None)
    vton_filename = f"{product_id}_vton.png"
    
    if processed_path and os.path.exists(processed_path):
        image_source = processed_path
    elif local_product:
        approved_path = os.path.join(local_product['_base_garment_dir'], product_id, vton_filename)
        if os.path.exists(approved_path):
            image_source = approved_path
        else:
            raise HTTPException(status_code=404, detail=f"No VTON image found for product {product_id}")
    else:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found and no processed image available")

    # Use the existing thumbnail if available
    thumb_filename = local_product.get('thumbnail_image', '') if local_product else ''
    thumb_source = None
    if local_product and thumb_filename:
        thumb_path = os.path.join(local_product['_base_garment_dir'], product_id, thumb_filename)
        if os.path.exists(thumb_path):
            thumb_source = thumb_path

    # --- Build 1-row CSV ---
    csv_columns = ["id", "Name", "Brand", "MRP", "Discount %", "Category", "Gender",
                    "Color", "sizes", "Thumbnail Image Filename", "Vton Ready Image Filename"]
    
    # Add optional columns if data present
    if product_data.get("description"):
        csv_columns.append("Description")
    if product_data.get("material_care"):
        csv_columns.append("Material Care")
    if custom_location:
        csv_columns.append("locations")
    if size_chart:
        csv_columns.append("size_chart")
    if size_chart_unit and not size_chart:
        pass  # No size chart data, skip unit too
    elif size_chart_unit:
        csv_columns.append("size_chart_unit")

    row_values = {
        "id": product_id,
        "Name": product_data.get("name", ""),
        "Brand": product_data.get("brand", ""),
        "MRP": str(product_data.get("mrp", 0)),
        "Discount %": str(product_data.get("discount_percent", 0)),
        "Category": product_data.get("category", ""),
        "Gender": product_data.get("gender", ""),
        "Color": product_data.get("color", ""),
        "sizes": product_data.get("sizes", ""),
        "Thumbnail Image Filename": thumb_filename or vton_filename,
        "Vton Ready Image Filename": vton_filename,
    }
    if product_data.get("description"):
        row_values["Description"] = product_data["description"]
    if product_data.get("material_care"):
        row_values["Material Care"] = product_data["material_care"]
    if custom_location:
        row_values["locations"] = custom_location
    if size_chart:
        import json as json_module
        row_values["size_chart"] = json_module.dumps(size_chart)
    if size_chart_unit and size_chart:
        row_values["size_chart_unit"] = size_chart_unit

    # Build CSV string
    import csv as csv_module
    csv_buffer = io.StringIO()
    writer = csv_module.DictWriter(csv_buffer, fieldnames=csv_columns)
    writer.writeheader()
    writer.writerow(row_values)
    csv_content = csv_buffer.getvalue().encode('utf-8')

    # --- Build ZIP with product images ---
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add VTON image: garments/{product_id}/vton_filename
        zf.write(image_source, f"garments/{product_id}/{vton_filename}")
        # Add thumbnail if different and available
        if thumb_source and thumb_filename and thumb_filename != vton_filename:
            zf.write(thumb_source, f"garments/{product_id}/{thumb_filename}")
    zip_buffer.seek(0)

    # --- POST to internal API ---
    try:
        files = {
            'file': ('catalogue.csv', csv_content, 'text/csv'),
            'images_zip': ('images.zip', zip_buffer.getvalue(), 'application/zip'),
        }
        data = {
            'client_id': str(client_id),
        }
        if location_ids and not custom_location:
            data['location_ids'] = ','.join(str(lid) for lid in location_ids)
        if size_chart_unit and size_chart:
            data['size_chart_unit'] = size_chart_unit

        headers = {}
        token = get_internal_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"

        resp = requests.post(
            f"{INTERNAL_API_URL}/catalogues/upload",
            files=files,
            data=data,
            headers=headers,
            timeout=120
        )

        if resp.status_code == 200:
            result = resp.json()
            return {
                "success": True,
                "message": f"Product {product_id} uploaded successfully",
                "products_processed": 1,
                "internal_response": result
            }
        else:
            error_detail = "Upload failed"
            try:
                error_data = resp.json()
                error_detail = error_data.get("detail", error_data.get("message", str(error_data)))
            except:
                error_detail = resp.text[:500]
            raise HTTPException(status_code=resp.status_code, detail=error_detail)

    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=503, detail="Cannot connect to internal API. Check INTERNAL_API_URL configuration.")
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Internal API request timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
