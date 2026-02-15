import React, { useState } from 'react';
import { getImageUrl, getThumbnailUrl, addToQueue, uploadCroppedImage, processImage } from '../api';
import { Check, Plus, Crop, Loader } from 'lucide-react';
import CropModal from './CropModal';
import VerificationModal from './VerificationModal';

const ProductCard = ({ product }) => {
    const [selectedImage, setSelectedImage] = useState(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractedResult, setExtractedResult] = useState(null);
    const [isVerificationOpen, setIsVerificationOpen] = useState(false);

    // Combine thumbnail and other images
    const allImages = [
        ...(product.thumbnail_image ? [product.thumbnail_image] : []),
        ...(product.other_images || [])
    ];

    const handleImageClick = (img) => {
        setSelectedImage(img);
    };

    const handleCropSave = async (croppedBlob) => {
        // Close modal INSTANTLY
        setSelectedImage(null);
        setIsExtracting(true);

        try {
            // 1. Upload the cropped image
            const uploadResp = await uploadCroppedImage(product.id, croppedBlob);
            const croppedFilename = uploadResp.filename;

            // 2. Add to Queue (Mocking extraction process here)
            // In a real scenario, we might poll for status or use a websocket.
            // For now, let's assume the process is triggered and we wait a bit or call process directly.

            // Note: The backend 'process' endpoint actually runs the extraction.
            // Let's call it directly to get the result.
            // But we need to add to queue first because 'process_image' looks in queue.
            await addToQueue(product.id, croppedFilename);

            // 3. Trigger processing
            // Assuming this is synchronous enough for the demo or returns when done
            // The backend 'process_image' endpoint calls 'do_process_item' in a thread.
            // We might need to poll for the result file?
            // The result file is named: processed_{product_id}_{croppedFilename}
            // Let's assume the backend returns success and we can construct the filename.

            // Wait a moment for 'process_image' to complete or poll.
            // Since we can't await the thread in backend easily without modification,
            // we will simulate a delay and constructing the filename.

            // TODO: In production, POLL status. Here we just wait 5s for demo purposes if backend is fast.
            // Or better, let's just constructing the filename and hope it's ready.
            // The backend endpoint returns {"message": "Processing complete"} *after* the thread finishes?
            // "await asyncio.to_thread(...)" - Yes, it waits!

            // So we can assume it waits.
            // We need to call the process endpoint.
            // But 'process_image' needs to be imported or called via API.
            // We don't have 'processImage' imported yet in this file scope if we didn't add it.
            // Let's add it to imports or use axios directly.

            // Wait, we need to import processImage.

            /*
            // Simulating call:
            // await processImage(product.id, croppedFilename);
            */
            await processImage(product.id, croppedFilename);

            const processedFilename = `processed_${product.id}_${croppedFilename}`;
            setExtractedResult(processedFilename);
            setIsExtracting(false);
            setIsVerificationOpen(true);

        } catch (error) {
            console.error("Failed to process", error);
            setIsExtracting(false);
            alert("Failed to process image. Please try again.");
        }
    };

    const handleVerificationClose = () => {
        setIsVerificationOpen(false);
        setExtractedResult(null);
    };

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow bg-gray-50 flex flex-col h-full relative">
            {isExtracting && (
                <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center">
                    <Loader className="animate-spin text-blue-600 mb-2" size={32} />
                    <span className="text-sm font-medium text-blue-800">Extracting garment...</span>
                </div>
            )}

            <div className="p-3 border-b bg-white">
                <h3 className="font-semibold text-gray-800 line-clamp-1" title={product.name}>{product.name}</h3>
                <p className="text-xs text-gray-500">{product.brand}</p>
                <div className="flex justify-between items-center mt-1">
                    <span className="font-bold text-gray-900">₹{product.mrp}</span>
                    {product.vton_image && (
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check size={10} /> Ready
                        </span>
                    )}
                </div>
            </div>

            <div className="p-2 flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                    {allImages.map((img, idx) => (
                        <div
                            key={idx}
                            className="relative group aspect-[3/4] overflow-hidden rounded-md border border-gray-200 cursor-pointer"
                            onClick={() => handleImageClick(img)}
                        >
                            <img
                                src={getThumbnailUrl(product.id, img)}
                                alt={`Product ${idx}`}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0 transition-transform duration-150 ease-out bg-gradient-to-t from-black/70 to-transparent py-3 px-2 flex justify-center"
                                style={{ willChange: 'transform' }}>
                                <span className="bg-white text-gray-900 px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1">
                                    <Crop size={12} /> Select & Crop
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {selectedImage && (
                <CropModal
                    imageUrl={getImageUrl(product.id, selectedImage)}
                    onCancel={() => setSelectedImage(null)}
                    onSave={handleCropSave}
                />
            )}

            <VerificationModal
                isOpen={isVerificationOpen}
                onClose={handleVerificationClose}
                product={product}
                extractedFilename={extractedResult}
            />
        </div>
    );
};

export default ProductCard;
