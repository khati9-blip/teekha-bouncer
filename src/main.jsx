import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const ERR_STYLES = `background:#0C0C0F;min-height:100vh;padding:24px;font-family:'Plus Jakarta Sans',sans-serif;color:#E8E0CC`;
const BOX_STYLES = `background:#111118;padding:16px;border-radius:10px;font-size:12px;font-family:monospace;color:#9AA5B8;margin-top:8px`;
const BTN_STYLES = `margin-top:20px;background:linear-gradient(135deg,#C9A84C,#8B6914);border:none;border-radius:10px;padding:10px 22px;color:#0C0C0F;font-weight:800;font-family:'Exo 2',sans-serif;letter-spacing:1px;cursor:pointer;font-size:13px`;

window.onerror = (msg, src, line, col) => {
  document.getElementById('root').innerHTML =
    `<div style="${ERR_STYLES}">` +
    `<div style="color:#FF3D5A;font-size:18px;font-family:'Exo 2',sans-serif;font-weight:800;letter-spacing:1px;margin-bottom:12px">💥 CRASH REPORT</div>` +
    `<div style="color:#E8E0CC;font-size:14px;margin-bottom:8px">${msg}</div>` +
    `<div style="${BOX_STYLES}">Line ${line}:${col} in ${src}</div>` +
    `<button onclick="localStorage.clear();location.reload()" style="${BTN_STYLES}">CLEAR & RELOAD</button>` +
    `</div>`;
};

window.onunhandledrejection = (e) => {
  document.getElementById('root').innerHTML =
    `<div style="${ERR_STYLES}">` +
    `<div style="color:#FF3D5A;font-size:18px;font-family:'Exo 2',sans-serif;font-weight:800;letter-spacing:1px;margin-bottom:12px">⚠️ PROMISE ERROR</div>` +
    `<div style="${BOX_STYLES}">${e.reason?.message || e.reason}</div>` +
    `<button onclick="localStorage.clear();location.reload()" style="${BTN_STYLES}">CLEAR & RELOAD</button>` +
    `</div>`;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
