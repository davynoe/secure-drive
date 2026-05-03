import './index.css'; // import css

import * as React from "react";
import { createRoot } from "react-dom/client";
import App from './App';

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  React.createElement(React.StrictMode, null,
    React.createElement(App, null)
  )
);