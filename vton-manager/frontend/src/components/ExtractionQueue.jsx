import React, { useState, useEffect } from 'react';
import { fetchQueue, fetchProduct, processImage, approveImage, discardImage, getImageUrl, getProcessedImageUrl } from '../api';
import { Play, CheckCircle, Loader2, Check, Trash2 } from 'lucide-react';

const ExtractionQueue = () => {
    const [queue, setQueue] = useState([]);
    const [products, setProducts] = useState({});

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
            // processed_image_path is usually just filename in current backend implementation?
            // Wait, main.py: item.processed_image_path = processed_filename
            const processedFilename = item.processed_image_path || `processed_${item.product_id}_${item.image_filename}`;
            await approveImage(item.product_id, item.image_filename, processedFilename);
            loadQueue();
        } catch (error) {
            console.error("Approval failed", error);
            alert("Failed to approve image");
        }
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
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">Extraction Queue</h2>
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
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm font-medium"
                                            >
                                                <Check size={16} /> Approve
                                            </button>
                                        </>
                                    )}
                                    {item.status === 'approved' && (
                                        <div className="flex items-center gap-2 text-blue-600 text-sm font-medium">
                                            <CheckCircle size={18} /> Approved & Saved
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
