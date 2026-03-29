import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

window.onerror = (msg, src, line, col, err) => {
  document.getElementById('root').innerHTML =
    '<div style="background:#080C14;min-height:100vh;padding:24px;font-family:monospace;color:#E2EAF4">' +
    '<div style="color:#FF3D5A;font-size:18px;margin-bottom:16px">CRASH: ' + msg + '</div>' +
    '<div style="background:#0E1521;padding:16px;border-radius:8px;font-size:12px">Line ' + line + ':' + col + ' in ' + src + '</div>' +
    '<button onclick="localStorage.clear();location.reload()" style="margin-top:16px;background:#F5A623;border:none;border-radius:8px;padding:10px 20px;color:#080C14;font-weight:700;cursor:pointer">CLEAR AND RELOAD</button>' +
    '</div>';
};

window.onunhandledrejection = (e) => {
  document.getElementById('root').innerHTML =
    '<div style="background:#080C14;min-height:100vh;padding:24px;font-family:monospace;color:#E2EAF4">' +
    '<div style="color:#FF3D5A;font-size:18px;margin-bottom:16px">PROMISE ERROR: ' + (e.reason?.message || e.reason) + '</div>' +
    '<button onclick="localStorage.clear();location.reload()" style="margin-top:16px;background:#F5A623;border:none;border-radius:8px;padding:10px 20px;color:#080C14;font-weight:700;cursor:pointer">CLEAR AND RELOAD</button>' +
    '</div>';
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
