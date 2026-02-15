import React, { useState, useEffect } from 'react';
import { fetchClients, fetchClientLocations } from '../api';
import { Building2, MapPin, ChevronDown, AlertCircle } from 'lucide-react';

const ClientLocationSelector = ({ selectedClient, selectedLocation, onClientChange, onLocationChange }) => {
    const [clients, setClients] = useState([]);
    const [locations, setLocations] = useState([]);
    const [loadingClients, setLoadingClients] = useState(true);
    const [loadingLocations, setLoadingLocations] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadClients();
    }, []);

    useEffect(() => {
        if (selectedClient) {
            loadLocations(selectedClient);
        } else {
            setLocations([]);
            onLocationChange(null);
        }
    }, [selectedClient]);

    const loadClients = async () => {
        setLoadingClients(true);
        setError(null);
        try {
            const data = await fetchClients();
            setClients(data || []);
        } catch (err) {
            console.error("Failed to load clients", err);
            setError("Failed to load clients. Check backend connection.");
            setClients([]);
        } finally {
            setLoadingClients(false);
        }
    };

    const loadLocations = async (clientId) => {
        setLoadingLocations(true);
        try {
            const data = await fetchClientLocations(clientId);
            setLocations(data || []);
        } catch (err) {
            console.error("Failed to load locations", err);
            setLocations([]);
        } finally {
            setLoadingLocations(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Building2 size={16} className="text-blue-600" />
                Select Client & Location
            </h3>

            {error && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800 text-sm">
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Client Dropdown */}
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">Client</label>
                    <div className="relative">
                        <select
                            value={selectedClient || ''}
                            onChange={(e) => onClientChange(e.target.value || null)}
                            disabled={loadingClients}
                            className="w-full appearance-none bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <option value="">
                                {loadingClients ? 'Loading clients...' : '— Select a client —'}
                            </option>
                            {clients.map((client) => (
                                <option key={client.id} value={client.id}>
                                    {client.display_name || client.name} {client.client_type ? `(${client.client_type})` : ''}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                </div>

                {/* Location Dropdown */}
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">Location</label>
                    <div className="relative">
                        <select
                            value={selectedLocation || ''}
                            onChange={(e) => onLocationChange(e.target.value || null)}
                            disabled={!selectedClient || loadingLocations}
                            className="w-full appearance-none bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 pr-10 text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <option value="">
                                {!selectedClient
                                    ? '— Select client first —'
                                    : loadingLocations
                                        ? 'Loading locations...'
                                        : locations.length === 0
                                            ? '— No locations available —'
                                            : '— Select a location —'}
                            </option>
                            {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                    {loc.name} {loc.address ? `— ${loc.address}` : ''}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                </div>
            </div>

            {/* Selection summary */}
            {selectedClient && selectedLocation && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2 text-blue-800 text-sm">
                    <MapPin size={16} />
                    <span>
                        Extractions will be uploaded to:{' '}
                        <strong>{clients.find(c => String(c.id) === String(selectedClient))?.display_name || clients.find(c => String(c.id) === String(selectedClient))?.name}</strong>
                        {' → '}
                        <strong>{locations.find(l => String(l.id) === String(selectedLocation))?.name}</strong>
                    </span>
                </div>
            )}
        </div>
    );
};

export default ClientLocationSelector;
