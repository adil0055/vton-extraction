import React, { useState, useEffect } from 'react';
import { fetchQueue, fetchProduct, processImage, approveImage, discardImage, getImageUrl, getProcessedImageUrl, clearApprovedQueue } from '../api';
import { Play, CheckCircle, Loader2, Check, Trash2, Upload, ExternalLink } from 'lucide-react';
import UploadModal from './UploadModal';

const ExtractionQueue = () => {
    const [queue, setQueue] = useState([]);
    const [products, setProducts] = useState({});

    // Upload modal state
    const [uploadModalItem, setUploadModalItem] = useState(null);
    const [uploadModalProduct, setUploadModalProduct] = useState(null);

    useEffect(() => {
        loadQueue();
        const interval = setInterval(loadQueue, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, []);

    const loadQueue = async () => {
        try {
            const data = await fetchQueue();
            setQueue(data);
            const userIds = [...new Set(data.map(item => item.product_id))];
            userIds.forEach(async (id) => {
                if (!products[id]) {
                    try {
                        const prod = await fetchProduct(id);
                        setProducts(prev => ({ ...prev, [id]: prod }));
                    } catch (e) {
                        console.error("Failed to fetch product", id);
                    }
                }
            });
        } catch (error) {
            console.error("Failed to load queue", error);
        }
    };

    const handleProcess = async (item) => {
        try {
            setQueue(prev => prev.map(q =>
                q.product_id === item.product_id && q.image_filename === item.image_filename
                    ? { ...q, status: 'processing' }
                    : q
            ));
            await processImage(item.product_id, item.image_filename);
            loadQueue();
        } catch (error) {
            console.error("Processing failed", error);
            loadQueue();
        }
    };

    const handleApprove = async (item) => {
        try {
            const processedFilename = item.processed_image_path || `processed_${item.product_id}_${item.image_filename}`;
            await approveImage(item.product_id, item.image_filename, processedFilename);
            loadQueue();
        } catch (error) {
            console.error("Approval failed", error);
            alert("Failed to approve image");
        }
    };

    const handleApproveAndUpload = (item) => {
        // First approve, then show upload modal
        const product = products[item.product_id];
        setUploadModalItem(item);
        setUploadModalProduct({
            ...product,
            image_filename: item.image_filename,
        });
    };

    const handleUploadAfterApproval = async () => {
        // If item is completed but not yet approved, approve first
        const item = uploadModalItem;
        if (item && item.status === 'completed') {
            try {
                const processedFilename = item.processed_image_path || `processed_${item.product_id}_${item.image_filename}`;
                await approveImage(item.product_id, item.image_filename, processedFilename);
                loadQueue();
            } catch (error) {
                console.error("Background approval failed", error);
            }
        }
    };

    // Open upload modal for already-approved items
    const handleUploadApproved = (item) => {
        const product = products[item.product_id];
        setUploadModalItem(item);
        setUploadModalProduct({
            ...product,
            image_filename: item.image_filename,
        });
    };

    const handleDiscard = async (item) => {
        if (!confirm("Are you sure you want to discard this extraction?")) return;
        try {
            await discardImage(item.product_id, item.image_filename);
            loadQueue();
        } catch (error) {
            console.error("Discard failed", error);
        }
    };

    const [activeTab, setActiveTab] = useState('queue'); // 'queue' or 'approved'

    const filteredQueue = queue.filter(item => {
        if (activeTab === 'queue') {
            return item.status !== 'approved';
        } else {
            return item.status === 'approved';
        }
    });

    return (
        <div className="space-y-6">
            {/* Upload Modal */}
            {uploadModalItem && uploadModalProduct && (
                <UploadModal
                    product={uploadModalProduct}
                    processedImageUrl={
                        getProcessedImageUrl(
                            uploadModalItem.processed_image_path || `processed_${uploadModalItem.product_id}_${uploadModalItem.image_filename}`
                        ) + `?t=${Date.now()}`
                    }
                    onClose={() => {
                        setUploadModalItem(null);
                        setUploadModalProduct(null);
                    }}
                    onSuccess={async (result) => {
                        // Approve image in the background if not already
                        await handleUploadAfterApproval();
                        loadQueue();
                    }}
                />
            )}

            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">Extraction Queue</h2>
                <div className="flex items-center gap-3">
                    {activeTab === 'approved' && queue.filter(i => i.status === 'approved').length > 0 && (
                        <button
                            onClick={async () => {
                                if (!confirm('Clear all approved items? This cannot be undone.')) return;
                                try {
                                    await clearApprovedQueue();
                                    loadQueue();
                                } catch (err) {
                                    console.error('Failed to clear approved', err);
                                    alert('Failed to clear approved items');
                                }
                            }}
                            className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 flex items-center gap-2 text-sm font-medium transition-colors"
                        >
                            <Trash2 size={16} /> Clear All
                        </button>
                    )}
                    <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('queue')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'queue'
                                ? 'bg-white text-gray-900 shadow'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Queue ({queue.filter(i => i.status !== 'approved').length})
                        </button>
                        <button
                            onClick={() => setActiveTab('approved')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'approved'
                                ? 'bg-white text-gray-900 shadow'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Approved ({queue.filter(i => i.status === 'approved').length})
                        </button>
                    </div>
                </div>
            </div>

            {filteredQueue.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
                    {activeTab === 'queue' ? 'No items in queue.' : 'No approved items yet.'}
                </div>
            ) : (
                <div className="space-y-6">
                    {filteredQueue.map((item, idx) => {
                        const product = products[item.product_id];
                        const processedUrl = item.status === 'completed' || item.status === 'approved'
                            ? getProcessedImageUrl(item.processed_image_path || `processed_${item.product_id}_${item.image_filename}`)
                            : null;

                        return (
                            <div key={`${item.product_id}-${item.image_filename}-${idx}`} className="bg-white rounded-xl shadow-md overflow-hidden">
                                {/* Header */}
                                <div className="px-6 py-3 bg-gray-50 border-b flex items-center justify-between">
                                    <div>
                                        <span className="font-semibold text-gray-900">{product?.name || item.product_id}</span>
                                        {product?.brand && <span className="ml-2 text-sm text-gray-500">• {product.brand}</span>}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 text-xs font-semibold rounded-full 
                                            ${item.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                item.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                                                    item.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                                        item.status === 'failed' ? 'bg-red-100 text-red-800' :
                                                            'bg-gray-100 text-gray-800'}`}>
                                            {item.status === 'processing' && <Loader2 size={12} className="inline animate-spin mr-1" />}
                                            {item.status}
                                        </span>
                                    </div>
                                </div>

                                {/* Images side by side */}
                                <div className="p-6">
                                    <div className="grid grid-cols-2 gap-6">
                                        {/* Original */}
                                        <div>
                                            <p className="text-xs font-medium text-gray-500 uppercase mb-2">Original</p>
                                            <div className="bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden" style={{ minHeight: '500px' }}>
                                                <img
                                                    className="max-h-[600px] w-auto object-contain"
                                                    src={getImageUrl(item.product_id, item.image_filename)}
                                                    alt="Original"
                                                />
                                            </div>
                                        </div>
                                        {/* Result */}
                                        <div>
                                            <p className="text-xs font-medium text-gray-500 uppercase mb-2">Extracted Result</p>
                                            <div className="bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden" style={{ minHeight: '500px' }}>
                                                {processedUrl ? (
                                                    <img
                                                        className="max-h-[600px] w-auto object-contain"
                                                        src={`${processedUrl}?t=${Date.now()}`}
                                                        alt="Result"
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 text-gray-400">
                                                        {item.status === 'processing' ? (
                                                            <>
                                                                <Loader2 size={32} className="animate-spin" />
                                                                <span className="text-sm">Processing...</span>
                                                            </>
                                                        ) : (
                                                            <span className="text-sm">Waiting in queue...</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions Footer */}
                                <div className="px-6 py-3 bg-gray-50 border-t flex justify-end gap-3">
                                    {item.status === 'pending' && (
                                        <button
                                            onClick={() => handleDiscard(item)}
                                            className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 flex items-center gap-2 text-sm font-medium"
                                        >
                                            <Trash2 size={16} /> Remove
                                        </button>
                                    )}
                                    {item.status === 'completed' && (
                                        <>
                                            <button
                                                onClick={() => handleDiscard(item)}
                                                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 flex items-center gap-2 text-sm font-medium"
                                            >
                                                <Trash2 size={16} /> Discard
                                            </button>
                                            <button
                                                onClick={() => handleApprove(item)}
                                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm font-medium"
                                            >
                                                <Check size={16} /> Approve Only
                                            </button>
                                            <button
                                                onClick={() => handleApproveAndUpload(item)}
                                                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 flex items-center gap-2 text-sm font-medium shadow-md"
                                            >
                                                <Upload size={16} /> Approve & Upload
                                            </button>
                                        </>
                                    )}
                                    {item.status === 'approved' && (
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2 text-blue-600 text-sm font-medium">
                                                <CheckCircle size={18} /> Approved
                                            </div>
                                            <button
                                                onClick={() => handleUploadApproved(item)}
                                                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 flex items-center gap-2 text-sm font-medium shadow-md"
                                            >
                                                <Upload size={16} /> Upload to Catalogue
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ExtractionQueue;
