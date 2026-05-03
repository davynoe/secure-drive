import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';

const App = () => {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <h1 className="text-3xl font-bold text-blue-600">Hello!</h1>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
