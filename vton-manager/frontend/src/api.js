import axios from 'axios';

const API_BASE_URL = 'http://localhost:8001';

export const fetchProducts = async (page = 1, limit = 30, pendingOnly = false) => {
    const response = await axios.get(`${API_BASE_URL}/products?page=${page}&limit=${limit}&pending_only=${pendingOnly}`);
    return response.data;
};

export const fetchProduct = async (id) => {
    const response = await axios.get(`${API_BASE_URL}/product/${id}`);
    return response.data;
};

export const getImageUrl = (productId, filename) => {
    if (!filename) return null;
    return `${API_BASE_URL}/images/${productId}/${filename}`;
};

export const getThumbnailUrl = (productId, filename) => {
    if (!filename) return null;
    return `${API_BASE_URL}/thumbnail/${productId}/${filename}`;
};

export const getProcessedImageUrl = (filename) => {
    return `${API_BASE_URL}/processed-images/${filename}`;
}

export const addToQueue = async (productId, filename) => {
    const response = await axios.post(`${API_BASE_URL}/queue/add`, {
        product_id: productId,
        image_filename: filename
    });
    return response.data;
};

export const fetchQueue = async () => {
    const response = await axios.get(`${API_BASE_URL}/queue`);
    return response.data;
};

export const processImage = async (productId, filename) => {
    const response = await axios.post(`${API_BASE_URL}/process/${productId}/${filename}`);
    return response.data;
};

export const approveImage = async (productId, filename, processedFilename) => {
    const response = await axios.post(`${API_BASE_URL}/approve/${productId}/${filename}?processed_filename=${processedFilename}`);
    return response.data;
};

export const discardImage = async (productId, filename) => {
    const response = await axios.delete(`${API_BASE_URL}/queue/${productId}/${filename}`);
    return response.data;
};

export const uploadCroppedImage = async (productId, blob) => {
    const formData = new FormData();
    formData.append('file', blob, 'cropped.png');

    const response = await axios.post(`${API_BASE_URL}/upload-crop/${productId}`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const uploadCatalogue = async (formData) => {
    const response = await axios.post(`${API_BASE_URL}/catalogues/upload`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const fetchClients = async () => {
    const response = await axios.get(`${API_BASE_URL}/clients`);
    return response.data;
};

export const fetchClientLocations = async (clientId) => {
    const response = await axios.get(`${API_BASE_URL}/clients/${clientId}/locations`);
    return response.data;
};

export const clearApprovedQueue = async () => {
    const response = await axios.delete(`${API_BASE_URL}/queue/approved`);
    return response.data;
};

export const uploadSingleProduct = async (payload) => {
    const response = await axios.post(`${API_BASE_URL}/catalogue/upload-single`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000, // 2 min timeout for large uploads
    });
    return response.data;
};
