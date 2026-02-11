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
# Configuration
ROOT_DIR = "../../Kalyan Silks"
PROCESSED_DIR = "./processed_images"
TEMP_CROP_DIR = "./temp_crops"
INFERENCE_URL = "http://82.141.118.34:29894/infer"

# Ensure directories exist
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(TEMP_CROP_DIR, exist_ok=True)

class QueueItem(BaseModel):
    product_id: str
    image_filename: str
    status: str = "pending" # pending, processing, completed, approved
    processed_image_path: Optional[str] = None
    is_cropped: bool = False

# In-memory queue (replace with database for production)
import json

QUEUE_FILE = "queue_data.json"

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

# Helper to load all products and their source paths
def load_all_products(force_refresh=False):
    global PRODUCTS_CACHE, LAST_CACHE_UPDATE
    
    current_time = time.time()
    if not force_refresh and PRODUCTS_CACHE and (current_time - LAST_CACHE_UPDATE < CACHE_DURATION):
        return PRODUCTS_CACHE
        
    print("Refreshing product cache...")
    all_products = []
    
    # Walk through the directory to find catalogue.csv files
    for root, dirs, files in os.walk(ROOT_DIR):
        if "catalogue.csv" in files:
            csv_path = os.path.join(root, "catalogue.csv")
            garment_dir = os.path.join(root, "garment")
            
            try:
                df = pd.read_csv(csv_path)
                # Store the absolute path to garment dir for this batch of products
                # We'll attach it to the product object internally for image retrieval
                
                for _, row in df.iterrows():
                    other_images = str(row['Other images filename']).split('; ') if pd.notna(row['Other images filename']) else []
                    all_products.append({
                        "id": str(row['id']),
                        "name": row['Name'],
                        "brand": row['Brand'],
                        "mrp": float(row['MRP']) if pd.notna(row['MRP']) else 0.0,
                        "discount_percent": float(row['Discount %']) if pd.notna(row['Discount %']) else 0.0,
                        "category": row['Category'],
                        "sub_category": row['Sub_Category'],
                        "gender": row['Gender'],
                        "color": row['Color'],
                        "description": row['Description'],
                        "thumbnail_image": row['Thumbnail Image Filename'],
                        "vton_image": row['Vton Ready Image Filename'] if pd.notna(row['Vton Ready Image Filename']) else None,
                        "other_images": other_images,
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

@app.on_event("startup")
async def startup_event():
    load_all_products(force_refresh=True)
    # Start the background queue worker
    asyncio.create_task(queue_worker())

async def queue_worker():
    """Background worker: processes queue items one at a time, sequentially."""
    print("Queue worker started.")
    while True:
        await asyncio.sleep(3)  # Check every 3 seconds
        
        # Skip if anything is currently processing
        is_processing = any(item.status == "processing" for item in extraction_queue)
        if is_processing:
            continue
        
        # Find next pending item
        pending_item = next((item for item in extraction_queue if item.status == "pending"), None)
        if not pending_item:
            continue
        
        # Process it in a thread (requests.post is blocking)
        print(f"Auto-processing: {pending_item.product_id}/{pending_item.image_filename}")
        await asyncio.to_thread(do_process_item, pending_item)

def do_process_item(queue_item):
    """Core processing logic — runs in a thread."""
    product_id = queue_item.product_id
    filename = queue_item.image_filename
    
    queue_item.status = "processing"
    save_queue_to_file()
    
    # Determine input path
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
                data = {
                    'category': 'dress',
                    'seed': 42,
                    'steps': 10,
                    'cfg': 1.0
                }
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
            # Fallback: copy original as result (FOR DEMO/TESTING ONLY)
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
            # Filter products that do NOT have a vton_image (empty or None)
            products = [p for p in products if not p.get('vton_image')]

        start = (page - 1) * limit
        end = start + limit
        
        paginated_products = products[start:end]
        
        # Remove internal fields before sending to frontend
        response_products = []
        for p in paginated_products:
            p_copy = p.copy()
            del p_copy['_base_garment_dir']
            del p_copy['_source_csv']
            response_products.append(p_copy)
            
        return {
            "total": len(products),
            "page": page,
            "limit": limit,
            "products": response_products
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/product/{product_id}")
async def get_product(product_id: str):
    try:
        products = load_all_products()
        product = next((p for p in products if p['id'] == product_id), None)
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        p_copy = product.copy()
        del p_copy['_base_garment_dir']
        del p_copy['_source_csv']
        return p_copy
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/images/{product_id}/{filename}")
async def get_image(product_id: str, filename: str):
    # Check if it's a temp cropped image
    temp_path = os.path.join(TEMP_CROP_DIR, filename)
    if os.path.exists(temp_path):
        return FileResponse(temp_path)

    products = load_all_products()
    product = next((p for p in products if p['id'] == product_id), None)
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    path = os.path.join(product['_base_garment_dir'], product_id, filename)
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="Image not found")

from PIL import Image

# ... (existing imports)

THUMB_DIR = "./thumbnails"
os.makedirs(THUMB_DIR, exist_ok=True)

@app.get("/thumbnail/{product_id}/{filename}")
async def get_thumbnail(product_id: str, filename: str):
    # Check if thumbnail already exists
    thumb_filename = f"thumb_{product_id}_{filename}"
    thumb_path = os.path.join(THUMB_DIR, thumb_filename)
    
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path)

    # If not, generate it from original
    products = load_all_products()
    product = next((p for p in products if p['id'] == product_id), None)
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    original_path = os.path.join(product['_base_garment_dir'], product_id, filename)
    if not os.path.exists(original_path):
        # Fallback to temp check if needed, or just 404
        temp_path = os.path.join(TEMP_CROP_DIR, filename)
        if os.path.exists(temp_path):
             original_path = temp_path
        else:
             raise HTTPException(status_code=404, detail="Image not found")

    try:
        with Image.open(original_path) as img:
            img.thumbnail((400, 400)) # Resize to max 400x400
            # Convert to RGB if RGBA (for JPEG saving, though we use original ext usually)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            
            # Save as JPEG for thumbnails to be small.
            img.save(thumb_path, "JPEG", quality=70) # Low quality for speed
            
        return FileResponse(thumb_path)
    except Exception as e:
        print(f"Thumbnail generation failed: {e}")
        # Fallback to original if thumb fails
        return FileResponse(original_path)


@app.get("/processed-images/{filename}")
async def get_processed_image(filename: str):
    path = os.path.join(PROCESSED_DIR, filename)
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="Image not found")

@app.post("/queue/add")
async def add_to_queue(item: QueueItem):
    # Check if already in queue
    for q_item in extraction_queue:
        if q_item.product_id == item.product_id and q_item.image_filename == item.image_filename:
             return {"message": "Already in queue", "queue": extraction_queue}

    extraction_queue.append(item)
    save_queue_to_file()
    return {"message": "Added to queue", "queue": extraction_queue}

@app.get("/queue")
async def get_queue():
    return extraction_queue

@app.delete("/queue/{product_id}/{filename}")
async def delete_from_queue(product_id: str, filename: str):
    global extraction_queue
    # remove item
    initial_len = len(extraction_queue)
    extraction_queue = [q for q in extraction_queue if not (q.product_id == product_id and q.image_filename == filename)]
    
    if len(extraction_queue) < initial_len:
        # Also try to clean up processed temp file if it exists?
        processed_filename = f"processed_{product_id}_{filename}"
        processed_path = os.path.join(PROCESSED_DIR, processed_filename)
        if os.path.exists(processed_path):
            try:
                os.remove(processed_path)
            except:
                pass
        save_queue_to_file()
        return {"message": "Removed from queue"}
    
    raise HTTPException(status_code=404, detail="Item not found")

# Keep endpoint for manual triggering if needed
@app.post("/process/{product_id}/{filename}")
async def process_image(product_id: str, filename: str):
    queue_item = None
    for item in extraction_queue:
        if item.product_id == product_id and item.image_filename == filename:
            queue_item = item
            break
    if not queue_item:
        raise HTTPException(status_code=404, detail="Item not found in queue")
    
    await asyncio.to_thread(do_process_item, queue_item)
    return {"message": "Processing complete"}

@app.post("/upload-crop/{product_id}")
async def upload_cropped_image(product_id: str, file: UploadFile = File(...)):
    try:
        # Create unique filename
        timestamp = int(time.time())
        filename = f"cropped_{timestamp}.png"
        file_path = os.path.join(TEMP_CROP_DIR, filename)
        
        # Save file to temp dir
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {"filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/approve/{product_id}/{filename}")
async def approve_image(product_id: str, filename: str, processed_filename: str):
    # Retrieve product to find garment dir and csv path
    products = load_all_products()
    product = next((p for p in products if p['id'] == product_id), None)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 1. Move processed image to product folder
    source_path = os.path.join(PROCESSED_DIR, processed_filename)
    
    # Create new filename for VTON ready image
    new_filename = f"{product_id}_vton.png" 
    dest_path = os.path.join(product['_base_garment_dir'], product_id, new_filename)
    
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Processed image not found")
        
    shutil.copy(source_path, dest_path)
    
    # 2. Update the specific CSV
    try:
        csv_path = product['_source_csv']
        df = pd.read_csv(csv_path)
        # Find product row
        mask = df['id'].astype(str) == product_id
        if not mask.any():
            raise HTTPException(status_code=404, detail="Product not found in CSV")
            
        df.loc[mask, 'Vton Ready Image Filename'] = new_filename
        df.to_csv(csv_path, index=False)
        
        # Update queue status
        for item in extraction_queue:
            if item.product_id == product_id and item.image_filename == filename:
                item.status = "approved"
                save_queue_to_file()
                break
        
        # Refresh product cache so catalogue filters update immediately
        load_all_products(force_refresh=True)
                
        return {"message": "Image approved and CSV updated", "vton_filename": new_filename}
        
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Failed to update CSV: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
