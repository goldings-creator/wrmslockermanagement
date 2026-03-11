import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// This is the specific command Vercel needs to clear the loading screen!
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
