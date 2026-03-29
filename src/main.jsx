import React from 'react'
import ReactDOM from 'react-dom/client'

// Catch any import errors
window.onerror = (msg, src, line, col, err) => {
  document.getElementById('root').innerHTML = `
    <div style="background:#080C14;min-height:100vh;padding:24px;font-family:monospace;color:#E2EAF4">
      <div style="color:#FF3D5A;font-size:18px;margin-bottom:16px">💥 JS ERROR</div>
      <div style="background:#0E1521;padding:16px;border-radius:8px;font-size:13px;word-break:break-all">
        <b>Message:</b> ${msg}<br/>
        <b>Source:</b> ${src}<br/>
        <b>Line:</b> ${line}:${col}<br/>
        <b>Error:</b> ${err?.stack || err}
      </div>
      <button onclick="localStorage.clear();location.reload()" style="margin-top:20px;background:#F5A623;border:none;border-radius:8px;padding:10px 20px;color:#080C14;font-weight:700;cursor:pointer">CLEAR & RELOAD</button>
    </div>
  `;
};

try {
  const App = (await import('./App.jsx')).default;
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch(e) {
  document.getElementById('root').innerHTML = `
    <div style="background:#080C14;min-height:100vh;padding:24px;font-family:monospace;color:#E2EAF4">
      <div style="color:#FF3D5A;font-size:18px;margin-bottom:16px">💥 IMPORT ERROR</div>
      <div style="background:#0E1521;padding:16px;border-radius:8px;font-size:13px;word-break:break-all">${e?.stack || e?.message || e}</div>
      <button onclick="localStorage.clear();location.reload()" style="margin-top:20px;background:#F5A623;border:none;border-radius:8px;padding:10px 20px;color:#080C14;font-weight:700;cursor:pointer">CLEAR & RELOAD</button>
    </div>
  `;
}
