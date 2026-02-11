import React, { useState } from 'react';
import Catalogue from './components/Catalogue';
import ExtractionQueue from './components/ExtractionQueue';
import { LayoutGrid, List } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('catalogue');

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">VTON Image Manager</h1>
          <nav className="flex space-x-4">
            <button
              onClick={() => setActiveTab('catalogue')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 ${activeTab === 'catalogue'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <LayoutGrid size={20} />
              Catalogue
            </button>
            <button
              onClick={() => setActiveTab('extraction')}
              className={`px-4 py-2 rounded-md flex items-center gap-2 ${activeTab === 'extraction'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <List size={20} />
              Extraction Queue
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'catalogue' ? <Catalogue /> : <ExtractionQueue />}
      </main>
    </div>
  );
}

export default App;
