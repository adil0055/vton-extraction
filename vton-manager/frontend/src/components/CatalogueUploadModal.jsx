import React, { useState } from 'react';
import { X, Upload, CheckCircle, AlertTriangle } from 'lucide-react';
import { uploadCatalogue } from '../api';

const CatalogueUploadModal = ({ isOpen, onClose, onSuccess }) => {
    const [clientId, setClientId] = useState('');
    const [locationIds, setLocationIds] = useState('');
    const [csvFile, setCsvFile] = useState(null);
    const [zipFile, setZipFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState(null); // { success: boolean, message: string, report: object }

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!clientId || !csvFile || !zipFile) {
            alert("Please fill all required fields");
            return;
        }

        setIsUploading(true);
        setUploadStatus(null);

        const formData = new FormData();
        formData.append('client_id', clientId);
        if (locationIds) formData.append('location_ids', locationIds);
        formData.append('file', csvFile);
        formData.append('images_zip', zipFile);

        try {
            const result = await uploadCatalogue(formData);
            setUploadStatus(result);
            if (result.success) {
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 2000);
            }
        } catch (error) {
            console.error("Upload failed", error);
            setUploadStatus({
                success: false,
                message: error.response?.data?.detail || "Upload failed. Please check your files and try again.",
                validation_report: error.response?.data?.validation_report
            });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b border-gray-800">
                    <h2 className="text-xl font-semibold text-white">Upload Product Catalogue</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6">
                    {!uploadStatus || !uploadStatus.success ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Client ID <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={clientId}
                                        onChange={(e) => setClientId(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="e.g. 5"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Location IDs (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={locationIds}
                                        onChange={(e) => setLocationIds(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="e.g. 1, 2, 3"
                                    />
                                </div>
                            </div>

                            <div className="p-4 border border-dashed border-gray-600 rounded-lg bg-gray-800/50">
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Catalogue CSV <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={(e) => setCsvFile(e.target.files[0])}
                                    className="block w-full text-sm text-gray-400
                                      file:mr-4 file:py-2 file:px-4
                                      file:rounded-full file:border-0
                                      file:text-sm file:font-semibold
                                      file:bg-blue-600 file:text-white
                                      hover:file:bg-blue-700 cursor-pointer"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Required columns: id, Name, Category, Gender, Thumbnail Image Filename...
                                </p>
                            </div>

                            <div className="p-4 border border-dashed border-gray-600 rounded-lg bg-gray-800/50">
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Images ZIP <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="file"
                                    accept=".zip"
                                    onChange={(e) => setZipFile(e.target.files[0])}
                                    className="block w-full text-sm text-gray-400
                                      file:mr-4 file:py-2 file:px-4
                                      file:rounded-full file:border-0
                                      file:text-sm file:font-semibold
                                      file:bg-purple-600 file:text-white
                                      hover:file:bg-purple-700 cursor-pointer"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Must contain all images referenced in the CSV.
                                </p>
                            </div>

                            {uploadStatus && !uploadStatus.success && (
                                <div className="bg-red-900/50 border border-red-700 text-red-200 p-4 rounded-lg">
                                    <div className="flex items-center gap-2 font-semibold mb-2">
                                        <AlertTriangle size={20} />
                                        Upload Failed
                                    </div>
                                    <p>{uploadStatus.message}</p>
                                    {uploadStatus.validation_report?.errors?.length > 0 && (
                                        <ul className="list-disc list-inside mt-2 text-sm opacity-80 max-h-32 overflow-y-auto">
                                            {uploadStatus.validation_report.errors.map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-gray-300 hover:text-white font-medium"
                                    disabled={isUploading}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isUploading}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isUploading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={18} /> Upload Catalogue
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="text-center py-12">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-900/50 text-green-400 mb-4">
                                <CheckCircle size={32} />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">Upload Successful!</h3>
                            <p className="text-gray-400 mb-6">{uploadStatus.message}</p>
                            <p className="text-sm text-gray-500">Closing window...</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CatalogueUploadModal;
