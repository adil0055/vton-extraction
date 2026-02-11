import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check } from 'lucide-react';
import { getImageUrl } from '../api'; // Ensure getImageUrl handles the blob or URL logic if needed, but here we likely pass URL.

// Helper to center the crop initially
function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
    return centerCrop(
        makeAspectCrop(
            {
                unit: '%',
                width: 90,
            },
            aspect,
            mediaWidth,
            mediaHeight,
        ),
        mediaWidth,
        mediaHeight,
    )
}

const CropModal = ({ imageUrl, onCancel, onSave }) => {
    const [crop, setCrop] = useState();
    const [completedCrop, setCompletedCrop] = useState();
    const imgRef = useRef(null);

    const secureImageUrl = React.useMemo(() => {
        return `${imageUrl}?t=${new Date().getTime()}`;
    }, [imageUrl]);

    const onImageLoad = (e) => {
        const { width, height } = e.currentTarget;
        // Set initial crop to cover most of the image, centered. 
        // No aspect ratio enforced for free form.
        const initialCrop = centerCrop(
            {
                unit: '%',
                width: 80,
                height: 80,
                x: 10,
                y: 10
            },
            width,
            height
        );
        setCrop(initialCrop);
    };

    const getCroppedImg = async (image, crop) => {
        const canvas = document.createElement('canvas');
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;

        canvas.width = crop.width * scaleX;
        canvas.height = crop.height * scaleY;

        const ctx = canvas.getContext('2d');

        ctx.drawImage(
            image,
            crop.x * scaleX,
            crop.y * scaleY,
            crop.width * scaleX,
            crop.height * scaleY,
            0,
            0,
            crop.width * scaleX,
            crop.height * scaleY
        );

        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    };

    const handleSave = async () => {
        if (completedCrop && imgRef.current) {
            const croppedBlob = await getCroppedImg(imgRef.current, completedCrop);
            onSave(croppedBlob);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-4 text-white bg-black/50 backdrop-blur-sm z-10">
                <h3 className="text-lg font-semibold">Freeform Crop</h3>
                <button onClick={onCancel} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                    <X size={24} />
                </button>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                <div className="max-h-full max-w-full">
                    <ReactCrop
                        crop={crop}
                        onChange={(c) => setCrop(c)}
                        onComplete={(c) => setCompletedCrop(c)}
                        className="max-h-[80vh]" // Limit height so controls remain visible
                    >
                        <img
                            ref={imgRef}
                            src={secureImageUrl}
                            alt="Crop me"
                            crossOrigin="anonymous"
                            onLoad={onImageLoad}
                            onError={(e) => console.error("Crop Image Load Error", e)}
                            className="max-h-[70vh] w-auto block object-contain"
                        />
                    </ReactCrop>
                </div>
            </div>

            <div className="p-4 bg-gray-900 border-t border-gray-800 flex justify-end gap-3 z-10">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-gray-300 hover:text-white font-medium"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={!completedCrop?.width || !completedCrop?.height}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                    <Check size={18} /> Confirm Crop
                </button>
            </div>
        </div>
    );
};

export default CropModal;
