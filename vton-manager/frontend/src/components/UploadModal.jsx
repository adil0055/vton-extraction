import React, { useState, useEffect, useCallback } from 'react';
import {
    X, Upload, CheckCircle, AlertCircle, Loader2, Building2, MapPin,
    ChevronDown, Plus, Minus, Table, Package, Eye, EyeOff
} from 'lucide-react';
import { fetchClients, fetchClientLocations, uploadSingleProduct } from '../api';

const UploadModal = ({ product, processedImageUrl, onClose, onSuccess }) => {
    // Client & Location state
    const [clients, setClients] = useState([]);
    const [locations, setLocations] = useState([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [selectedLocations, setSelectedLocations] = useState([]);
    const [isCustomLocation, setIsCustomLocation] = useState(false);
    const [customLocationName, setCustomLocationName] = useState('');
    const [loadingClients, setLoadingClients] = useState(true);
    const [loadingLocations, setLoadingLocations] = useState(false);

    // Size chart state
    const [showSizeChart, setShowSizeChart] = useState(false);
    const [sizeChartUnit, setSizeChartUnit] = useState('cm');
    const [sizes, setSizes] = useState([]);
    const [measurements, setMeasurements] = useState([]);
    const [chart, setChart] = useState({});

    // Pre-fill size chart from product data (CSV)
    useEffect(() => {
        if (!product?.size_chart) return;
        try {
            const parsed = typeof product.size_chart === 'string'
                ? JSON.parse(product.size_chart)
                : product.size_chart;
            if (!Array.isArray(parsed) || parsed.length === 0) return;

            // Extract sizes and measurements from the JSON array
            const sizeNames = parsed.map(entry => entry.Size || entry.size || '').filter(Boolean);
            const measurementKeys = new Set();
            parsed.forEach(entry => {
                Object.keys(entry).forEach(key => {
                    const lower = key.toLowerCase();
                    if (lower !== 'size' && lower !== 'brand size') {
                        measurementKeys.add(lower);
                    }
                });
            });
            const measurementList = [...measurementKeys];

            // Build the chart data
            const chartData = {};
            parsed.forEach(entry => {
                const sizeName = entry.Size || entry.size || '';
                if (!sizeName) return;
                chartData[sizeName] = {};
                measurementList.forEach(m => {
                    // Try to match case-insensitively
                    const val = Object.entries(entry).find(([k]) => k.toLowerCase() === m)?.[1] || '';
                    chartData[sizeName][m] = String(val);
                });
            });

            setSizes(sizeNames);
            setMeasurements(measurementList);
            setChart(chartData);
            setShowSizeChart(true);
        } catch (e) {
            console.error('Failed to parse size_chart from product:', e);
        }
    }, [product?.size_chart]);

    // Upload state
    const [step, setStep] = useState('review'); // review | uploading | success | error
    const [uploadError, setUploadError] = useState(null);
    const [uploadResult, setUploadResult] = useState(null);

    // Product field editing
    const [editableProduct, setEditableProduct] = useState({
        id: product?.id || '',
        name: product?.name || '',
        brand: product?.brand || '',
        mrp: product?.mrp || 0,
        discount_percent: product?.discount_percent || 0,
        category: product?.category || '',
        gender: product?.gender || '',
        color: product?.color || '',
        sizes: product?.sizes || '',
        description: product?.description || '',
        material_care: product?.material_care || '',
    });

    // Load clients on mount
    useEffect(() => {
        loadClients();
    }, []);

    // Load locations when client changes
    useEffect(() => {
        if (selectedClient) {
            loadLocationsFn(selectedClient);
        } else {
            setLocations([]);
            setSelectedLocations([]);
        }
    }, [selectedClient]);

    const loadClients = async () => {
        setLoadingClients(true);
        try {
            const data = await fetchClients();
            setClients(data || []);
        } catch {
            setClients([]);
        } finally {
            setLoadingClients(false);
        }
    };

    const loadLocationsFn = async (clientId) => {
        setLoadingLocations(true);
        try {
            const data = await fetchClientLocations(clientId);
            setLocations(data || []);
        } catch {
            setLocations([]);
        } finally {
            setLoadingLocations(false);
        }
    };

    const toggleLocation = (locId) => {
        setSelectedLocations(prev =>
            prev.includes(locId) ? prev.filter(id => id !== locId) : [...prev, locId]
        );
    };

    // Size chart helpers
    const addSizeRow = () => {
        const name = prompt('Enter size name (e.g. S, M, L, XL):');
        if (!name || sizes.includes(name)) return;
        setSizes(prev => [...prev, name]);
        setChart(prev => {
            const updated = { ...prev };
            updated[name] = {};
            measurements.forEach(m => { updated[name][m] = ''; });
            return updated;
        });
    };

    const removeSizeRow = (size) => {
        setSizes(prev => prev.filter(s => s !== size));
        setChart(prev => {
            const updated = { ...prev };
            delete updated[size];
            return updated;
        });
    };

    const addMeasurement = () => {
        const name = prompt('Enter measurement name (e.g. chest, waist, hip):');
        if (!name || measurements.includes(name.toLowerCase())) return;
        const m = name.toLowerCase();
        setMeasurements(prev => [...prev, m]);
        setChart(prev => {
            const updated = { ...prev };
            sizes.forEach(s => { updated[s] = { ...updated[s], [m]: '' }; });
            return updated;
        });
    };

    const removeMeasurement = (measurement) => {
        setMeasurements(prev => prev.filter(m => m !== measurement));
        setChart(prev => {
            const updated = { ...prev };
            sizes.forEach(s => {
                if (updated[s]) delete updated[s][measurement];
            });
            return updated;
        });
    };

    const handleCellChange = (size, measurement, value) => {
        setChart(prev => ({
            ...prev,
            [size]: { ...prev[size], [measurement]: value }
        }));
    };

    const initDefaultSizeChart = () => {
        const defaultSizes = ['S', 'M', 'L', 'XL'];
        const defaultMeasurements = ['chest', 'waist'];
        setSizes(defaultSizes);
        setMeasurements(defaultMeasurements);
        const defaultChart = {};
        defaultSizes.forEach(s => {
            defaultChart[s] = {};
            defaultMeasurements.forEach(m => { defaultChart[s][m] = ''; });
        });
        setChart(defaultChart);
        setShowSizeChart(true);
    };

    // Build size chart JSON for CSV
    const buildSizeChartJson = () => {
        if (sizes.length === 0 || measurements.length === 0) return null;
        const hasAnyValue = sizes.some(s => measurements.some(m => chart[s]?.[m]));
        if (!hasAnyValue) return null;
        return sizes.map(s => {
            const entry = { Size: s };
            measurements.forEach(m => {
                const val = chart[s]?.[m];
                if (val !== '' && val !== undefined) {
                    entry[m.charAt(0).toUpperCase() + m.slice(1)] = val;
                }
            });
            return entry;
        });
    };

    const canUpload = selectedClient && (selectedLocations.length > 0 || isCustomLocation) && editableProduct.name;

    const handleUpload = async () => {
        setStep('uploading');
        setUploadError(null);

        try {
            const sizeChartData = buildSizeChartJson();
            const payload = {
                client_id: parseInt(selectedClient),
                location_ids: isCustomLocation ? null : selectedLocations.map(id => parseInt(id)),
                custom_location: isCustomLocation ? customLocationName : null,
                product: editableProduct,
                size_chart: sizeChartData,
                size_chart_unit: sizeChartData ? sizeChartUnit : null,
                processed_filename: getProcessedFilename(),
            };

            const result = await uploadSingleProduct(payload);
            setUploadResult(result);
            setStep('success');
            if (onSuccess) onSuccess(result);
        } catch (err) {
            console.error('Upload failed:', err);
            const detail = err.response?.data?.detail || err.message || 'Upload failed';
            setUploadError(typeof detail === 'string' ? detail : JSON.stringify(detail));
            setStep('error');
        }
    };

    const getProcessedFilename = () => {
        return `processed_${product.id}_${product.image_filename || 'vton.png'}`;
    };

    const updateField = (field, value) => {
        setEditableProduct(prev => ({ ...prev, [field]: value }));
    };

    // Render
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && step !== 'uploading' && onClose()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <Upload size={22} />
                        <div>
                            <h2 className="text-lg font-bold">Upload to Catalogue</h2>
                            <p className="text-blue-100 text-sm">{editableProduct.name || editableProduct.id}</p>
                        </div>
                    </div>
                    {step !== 'uploading' && (
                        <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                            <X size={22} />
                        </button>
                    )}
                </div>

                {/* Body - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {step === 'uploading' && (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 size={48} className="animate-spin text-blue-600 mb-4" />
                            <p className="text-lg font-semibold text-gray-800">Uploading to catalogue...</p>
                            <p className="text-sm text-gray-500 mt-1">Packaging product data and image for the internal API</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle size={36} className="text-green-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Upload Successful!</h3>
                            <p className="text-gray-600 text-center max-w-md mb-6">
                                Product <strong>{editableProduct.name}</strong> has been uploaded to the catalogue.
                            </p>
                            {uploadResult && (
                                <div className="bg-gray-50 rounded-xl p-4 w-full max-w-md text-sm space-y-2">
                                    {uploadResult.products_processed && (
                                        <div className="flex justify-between"><span className="text-gray-500">Products processed:</span><strong>{uploadResult.products_processed}</strong></div>
                                    )}
                                    {uploadResult.message && (
                                        <div className="flex justify-between"><span className="text-gray-500">Status:</span><strong className="text-green-600">{uploadResult.message}</strong></div>
                                    )}
                                </div>
                            )}
                            <button onClick={onClose} className="mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">
                                Done
                            </button>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                <AlertCircle size={36} className="text-red-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Upload Failed</h3>
                            <p className="text-red-600 text-center max-w-md mb-6 text-sm">{uploadError}</p>
                            <div className="flex gap-3">
                                <button onClick={() => setStep('review')} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors">
                                    Back to Review
                                </button>
                                <button onClick={handleUpload} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">
                                    Retry Upload
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'review' && (
                        <>
                            {/* Section 1: Client & Location */}
                            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Building2 size={16} className="text-blue-600" />
                                    Client & Location <span className="text-red-500">*</span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    {/* Client dropdown */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-1.5">Client</label>
                                        <div className="relative">
                                            <select
                                                value={selectedClient}
                                                onChange={(e) => { setSelectedClient(e.target.value); setSelectedLocations([]); setIsCustomLocation(false); }}
                                                disabled={loadingClients}
                                                className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="">{loadingClients ? 'Loading...' : '— Select a client —'}</option>
                                                {clients.map(c => (
                                                    <option key={c.id} value={c.id}>{c.display_name || c.name} {c.client_type ? `(${c.client_type})` : ''}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>

                                    {/* Size chart unit */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-1.5">Size Chart Unit</label>
                                        <div className="relative">
                                            <select
                                                value={sizeChartUnit}
                                                onChange={(e) => setSizeChartUnit(e.target.value)}
                                                className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="cm">Centimeters (cm)</option>
                                                <option value="inches">Inches</option>
                                            </select>
                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>

                                {/* Locations - multi-select with checkboxes */}
                                {selectedClient && !loadingLocations && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-2">
                                            Locations <span className="text-red-500">*</span>
                                        </label>
                                        <div className="bg-white border border-gray-300 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                                            {locations.length === 0 && !isCustomLocation && (
                                                <p className="text-sm text-gray-400 italic">No locations available for this client.</p>
                                            )}
                                            {locations.map(loc => (
                                                <label key={loc.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLocations.includes(String(loc.id))}
                                                        onChange={() => { setIsCustomLocation(false); toggleLocation(String(loc.id)); }}
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                    <div className="flex items-center gap-1.5">
                                                        <MapPin size={14} className="text-gray-400" />
                                                        <span className="text-sm text-gray-800">{loc.name}</span>
                                                        {loc.address && <span className="text-xs text-gray-400">— {loc.address}</span>}
                                                    </div>
                                                </label>
                                            ))}
                                            <hr className="my-1" />
                                            <label className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={isCustomLocation}
                                                    onChange={() => {
                                                        setIsCustomLocation(!isCustomLocation);
                                                        if (!isCustomLocation) setSelectedLocations([]);
                                                    }}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-gray-800 font-medium">Custom Location (specify name)</span>
                                            </label>
                                            {isCustomLocation && (
                                                <input
                                                    type="text"
                                                    value={customLocationName}
                                                    onChange={(e) => setCustomLocationName(e.target.value)}
                                                    placeholder="Enter location name..."
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            )}
                                        </div>
                                        {selectedLocations.length > 0 && (
                                            <p className="text-xs text-blue-600 mt-1.5">{selectedLocations.length} location(s) selected</p>
                                        )}
                                    </div>
                                )}
                                {selectedClient && loadingLocations && (
                                    <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                                        <Loader2 size={14} className="animate-spin" /> Loading locations...
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Product Details */}
                            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Package size={16} className="text-blue-600" />
                                    Product Details
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <InputField label="Product ID" value={editableProduct.id} readOnly />
                                    <InputField label="Name *" value={editableProduct.name} onChange={v => updateField('name', v)} />
                                    <InputField label="Brand" value={editableProduct.brand} onChange={v => updateField('brand', v)} />
                                    <InputField label="MRP" value={editableProduct.mrp} onChange={v => updateField('mrp', v)} type="number" />
                                    <InputField label="Discount %" value={editableProduct.discount_percent} onChange={v => updateField('discount_percent', v)} type="number" />
                                    <InputField label="Category" value={editableProduct.category} onChange={v => updateField('category', v)} />
                                    <InputField label="Gender" value={editableProduct.gender} onChange={v => updateField('gender', v)} />
                                    <InputField label="Color" value={editableProduct.color} onChange={v => updateField('color', v)} />
                                    <InputField label="Sizes (S;M;L)" value={editableProduct.sizes} onChange={v => updateField('sizes', v)} />
                                </div>
                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                                        <textarea
                                            value={editableProduct.description || ''}
                                            onChange={(e) => updateField('description', e.target.value)}
                                            rows={2}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Material & Care</label>
                                        <textarea
                                            value={editableProduct.material_care || ''}
                                            onChange={(e) => updateField('material_care', e.target.value)}
                                            rows={2}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                        />
                                    </div>
                                </div>

                                {/* Image preview */}
                                <div className="mt-4 flex items-center gap-4">
                                    <div className="bg-white rounded-lg border border-gray-200 p-2 w-24 h-24 flex items-center justify-center overflow-hidden">
                                        <img src={processedImageUrl} alt="VTON" className="max-w-full max-h-full object-contain" />
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        <p className="font-medium">VTON Image Ready</p>
                                        <p className="text-xs text-gray-400">This extracted image will be uploaded as the VTON-ready image for this product.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Size Chart (Optional) */}
                            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                                        <Table size={16} className="text-blue-600" />
                                        Size Chart <span className="text-xs font-normal text-gray-400 normal-case">(optional)</span>
                                    </h3>
                                    {!showSizeChart ? (
                                        <button
                                            onClick={initDefaultSizeChart}
                                            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                        >
                                            <Plus size={14} /> Add Size Chart
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setShowSizeChart(false); setSizes([]); setMeasurements([]); setChart({}); }}
                                            className="text-sm text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
                                        >
                                            <Minus size={14} /> Remove Size Chart
                                        </button>
                                    )}
                                </div>

                                {showSizeChart && (
                                    <div className="space-y-3">
                                        {/* Controls */}
                                        <div className="flex gap-2">
                                            <button onClick={addSizeRow} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-md text-xs font-medium hover:bg-blue-100 flex items-center gap-1">
                                                <Plus size={12} /> Add Size
                                            </button>
                                            <button onClick={addMeasurement} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-md text-xs font-medium hover:bg-blue-100 flex items-center gap-1">
                                                <Plus size={12} /> Add Measurement
                                            </button>
                                        </div>

                                        {/* Table */}
                                        {sizes.length > 0 && measurements.length > 0 && (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm border-collapse">
                                                    <thead>
                                                        <tr className="bg-gray-100">
                                                            <th className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">Size</th>
                                                            {measurements.map(m => (
                                                                <th key={m} className="border border-gray-200 px-3 py-2 text-left font-medium text-gray-700">
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="capitalize">{m}</span>
                                                                        <button onClick={() => removeMeasurement(m)} className="text-red-400 hover:text-red-600 ml-2">
                                                                            <X size={12} />
                                                                        </button>
                                                                    </div>
                                                                </th>
                                                            ))}
                                                            <th className="border border-gray-200 px-2 py-2 w-8"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sizes.map(s => (
                                                            <tr key={s}>
                                                                <td className="border border-gray-200 px-3 py-1.5 font-medium text-gray-800 bg-gray-50">{s}</td>
                                                                {measurements.map(m => (
                                                                    <td key={m} className="border border-gray-200 px-1 py-1">
                                                                        <input
                                                                            type="number"
                                                                            value={chart[s]?.[m] || ''}
                                                                            onChange={(e) => handleCellChange(s, m, e.target.value)}
                                                                            className="w-full px-2 py-1 text-sm border-0 focus:ring-1 focus:ring-blue-400 rounded bg-transparent"
                                                                            placeholder="—"
                                                                        />
                                                                    </td>
                                                                ))}
                                                                <td className="border border-gray-200 px-1 py-1 text-center">
                                                                    <button onClick={() => removeSizeRow(s)} className="text-red-400 hover:text-red-600">
                                                                        <X size={14} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                {step === 'review' && (
                    <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between shrink-0">
                        <div className="text-sm text-gray-500">
                            {!canUpload && <span className="text-amber-600">Select a client and at least one location to upload.</span>}
                        </div>
                        <div className="flex gap-3">
                            <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={!canUpload}
                                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Upload size={16} /> Upload to Catalogue
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Reusable input field
const InputField = ({ label, value, onChange, readOnly = false, type = 'text' }) => (
    <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
        <input
            type={type}
            value={value || ''}
            onChange={onChange ? (e) => onChange(e.target.value) : undefined}
            readOnly={readOnly}
            className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${readOnly ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
        />
    </div>
);

export default UploadModal;
