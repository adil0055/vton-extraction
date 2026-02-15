import React, { useState, useEffect } from 'react';
import ProductCard from './ProductCard';
import { fetchProducts } from '../api';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const Catalogue = () => {
    const [products, setProducts] = useState([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showPendingOnly, setShowPendingOnly] = useState(false);
    const LIMIT = 30;

    useEffect(() => {
        loadProducts();
    }, [page, showPendingOnly]);

    const loadProducts = async () => {
        setLoading(true);
        try {
            // Note: currently fetching based on showPendingOnly state
            const data = await fetchProducts(page, LIMIT, showPendingOnly);
            setProducts(data.products || []);
            setTotal(data.total || 0);
        } catch (error) {
            console.error("Failed to load products", error);
            setProducts([]);
        } finally {
            setLoading(false);
        }
    };

    const totalPages = Math.ceil(total / LIMIT) || 1;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-800">Product Catalogue</h2>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer bg-white border border-gray-300 px-3 py-2 rounded-md hover:bg-gray-50 transition select-none">
                        <input
                            type="checkbox"
                            checked={!showPendingOnly}
                            onChange={() => setShowPendingOnly(!showPendingOnly)}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Show Processed</span>
                    </label>
                </div>
            </div>

            <div className="text-sm text-gray-500 mb-4">
                Showing {Math.min((page - 1) * LIMIT + 1, total)}-{Math.min(page * LIMIT, total)} of {total} products ({showPendingOnly ? "Pending Processing" : "All Products"})
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : (
                <>
                    {products.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            No pending products found. Upload a catalogue to get started.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {products.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Pagination */}
            {total > 0 && (
                <div className="flex justify-center items-center gap-4 py-8">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <span className="text-gray-700 font-medium">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>
            )}

        </div>
    );
};

export default Catalogue;
