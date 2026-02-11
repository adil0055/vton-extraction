import React, { useState } from 'react';
import { getImageUrl, getThumbnailUrl, addToQueue, uploadCroppedImage } from '../api';
import { Check, Plus, Crop } from 'lucide-react';
import CropModal from './CropModal';

const ProductCard = ({ product }) => {
    const [selectedImage, setSelectedImage] = useState(null);
    const [success, setSuccess] = useState(false);

    // Combine thumbnail and other images
    const allImages = [
        ...(product.thumbnail_image ? [product.thumbnail_image] : []),
        ...(product.other_images || [])
    ];

    const handleImageClick = (img) => {
        setSelectedImage(img);
    };

    const handleCropSave = (croppedBlob) => {
        // Close modal INSTANTLY — no waiting
        setSelectedImage(null);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);

        // Upload and queue in background — backend worker handles processing
        (async () => {
            try {
                const uploadResp = await uploadCroppedImage(product.id, croppedBlob);
                const croppedFilename = uploadResp.filename;
                await addToQueue(product.id, croppedFilename);
            } catch (error) {
                console.error("Failed to send to extraction", error);
            }
        })();
    };

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow bg-gray-50 flex flex-col h-full">
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
        </div>
    );
};

export default ProductCard;
