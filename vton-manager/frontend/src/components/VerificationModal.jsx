import React, { useState } from 'react';
import { Upload, X, Check, Loader } from 'lucide-react';
import { approveImage, getProcessedImageUrl, getImageUrl } from '../api';

const VerificationModal = ({ isOpen, onClose, product, extractedFilename }) => {
    const [step, setStep] = useState('verify'); // 'verify' | 'details'
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null); // 'success' | 'error'

    if (!isOpen) return null;

    const handleApprove = () => {
        setStep('details');
    };

    const handleUpload = async () => {
        setIsUploading(true);
        setUploadStatus(null);
        try {
            await approveImage(product.id, 'dummy', extractedFilename); // The backend takes processed_filename query param
            setUploadStatus('success');
            setTimeout(() => {
                onClose();
                setStep('verify');
                setUploadStatus(null);
            }, 2000);
        } catch (error) {
            console.error("Upload failed", error);
            setUploadStatus('error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {step === 'verify' ? 'Verify Extraction' : 'Product Details'}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
                        <X size={24} className="text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {step === 'verify' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                            <div className="space-y-2">
                                <h3 className="font-medium text-gray-700">Original Image</h3>
                                <div className="border rounded-lg overflow-hidden bg-gray-50 aspect-[3/4]">
                                    <img
                                        src={getImageUrl(product.id, product.thumbnail_image)}
                                        alt="Original"
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-medium text-gray-700">Extracted Result</h3>
                                <div className="border rounded-lg overflow-hidden bg-gray-50 aspect-[3/4]">
                                    <img
                                        src={getProcessedImageUrl(extractedFilename)}
                                        alt="Extracted"
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h3 className="font-medium text-gray-700 mb-2">Image Preview</h3>
                                    <div className="border rounded-lg overflow-hidden w-48 aspect-[3/4] bg-gray-50">
                                        <img
                                            src={getProcessedImageUrl(extractedFilename)}
                                            alt="Final"
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="text-gray-500 block">Product ID</span>
                                            <span className="font-medium">{product.id}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block">Name</span>
                                            <span className="font-medium">{product.name}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block">Brand</span>
                                            <span className="font-medium">{product.brand}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block">Price</span>
                                            <span className="font-medium">₹{product.mrp}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block">Category</span>
                                            <span className="font-medium">{product.category}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block">Gender</span>
                                            <span className="font-medium">{product.gender}</span>
                                        </div>
                                    </div>
                                    <div className="bg-blue-50 p-4 rounded-md text-sm text-blue-800">
                                        This product details along with the extracted image will be uploaded to the backend and S3.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                    {step === 'verify' ? (
                        <>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition"
                            >
                                Discard
                            </button>
                            <button
                                onClick={handleApprove}
                                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition flex items-center gap-2"
                            >
                                <Check size={18} /> Approve
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => setStep('verify')}
                                disabled={isUploading}
                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition disabled:opacity-50"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={isUploading || uploadStatus === 'success'}
                                className={`px-4 py-2 text-white rounded-md transition flex items-center gap-2 ${uploadStatus === 'success'
                                        ? 'bg-green-600'
                                        : uploadStatus === 'error'
                                            ? 'bg-red-600'
                                            : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                            >
                                {isUploading ? (
                                    <>
                                        <Loader size={18} className="animate-spin" /> Uploading...
                                    </>
                                ) : uploadStatus === 'success' ? (
                                    <>
                                        <Check size={18} /> Uploaded!
                                    </>
                                ) : (
                                    <>
                                        <Upload size={18} /> Upload to Backend
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VerificationModal;
