import React from 'react';
import { X, Check } from 'lucide-react';
import { getImageUrl, getProcessedImageUrl } from '../api';

const VerificationModal = ({ item, onApprove, onClose, product }) => {
    if (!item || !product) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="text-xl font-semibold">Verify Extraction Result</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <h4 className="font-medium text-gray-700 text-center">Original Image</h4>
                            <div className="border rounded-lg overflow-hidden bg-gray-50 aspect-[3/4]">
                                <img
                                    src={getImageUrl(item.product_id, item.image_filename)}
                                    alt="Original"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h4 className="font-medium text-gray-700 text-center">Extracted Result</h4>
                            <div className="border rounded-lg overflow-hidden bg-gray-50 aspect-[3/4]">
                                <img
                                    src={getProcessedImageUrl(item.processed_image_path)}
                                    alt="Processed"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onApprove(item)}
                        className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 flex items-center gap-2"
                    >
                        <Check size={18} /> Approve & Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VerificationModal;
