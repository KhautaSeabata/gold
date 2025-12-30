// Signal History Manager
const FIREBASE_URL = 'https://mzanzifx-default-rtdb.firebaseio.com';
let allSignals = [];
let filteredSignals = [];
let currentFilter = 'all';

async function loadSignals() {
    try {
        const response = await fetch(`${FIREBASE_URL}/signals.json`);
        if (!response.ok) throw new Error('Failed to load signals');
        const data = await response.json();
        if (data) {
            allSignals = Object.keys(data).map(key => ({ id: key, ...data[key] }));
            allSignals.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        } else {
            allSignals = [];
        }
        updateStats();
        filterSignals(currentFilter);
    } catch (error) {
        console.error('Error loading signals:', error);
        allSignals = [];
        displayNoSignals();
    }
}

function updateStats() {
    document.getElementById('successCount').textContent = allSignals.filter(s => s.status === 'success').length;
    document.getElementById('failCount').textContent = allSignals.filter(s => s.status === 'failed').length;
    document.getElementById('activeCount').textContent = allSignals.filter(s => s.status === 'active' || !s.status).length;
    document.getElementById('breakevenCount').textContent = allSignals.filter(s => s.status === 'breakeven').length;
}

function filterSignals(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event?.target?.classList.add('active');
    if (filter === 'all') filteredSignals = [...allSignals];
    else if (filter === 'active') filteredSignals = allSignals.filter(s => s.status === 'active' || !s.status);
    else if (filter === 'success') filteredSignals = allSignals.filter(s => s.status === 'success');
    else if (filter === 'failed') filteredSignals = allSignals.filter(s => s.status === 'failed');
    else if (filter === 'breakeven') filteredSignals = allSignals.filter(s => s.status === 'breakeven');
    else if (filter === 'bullish') filteredSignals = allSignals.filter(s => s.bias && s.bias.toLowerCase() === 'bullish');
    else if (filter === 'bearish') filteredSignals = allSignals.filter(s => s.bias && s.bias.toLowerCase() === 'bearish');
    displaySignals();
}

function displaySignals() {
    const container = document.getElementById('signalsList');
    if (filteredSignals.length === 0) {
        displayNoSignals();
        return;
    }
    let html = '';
    filteredSignals.forEach(signal => {
        const status = signal.status || 'active';
        const bias = signal.bias || 'neutral';
        const timestamp = new Date(signal.timestamp || Date.now());
        const dateStr = timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        html += `<div class="signal-item ${status}"><div class="signal-header"><div class="signal-symbol">${signal.symbol || 'N/A'}</div><div class="status-badge ${status}">${status.toUpperCase()}</div></div><div class="signal-info"><div class="info-item"><span class="info-label">Bias:</span><span class="info-value">${bias.toUpperCase()}</span></div><div class="info-item"><span class="info-label">Confidence:</span><span class="info-value">${signal.confidence || 0}%</span></div><div class="info-item"><span class="info-label">Entry:</span><span class="info-value">${signal.entry || 'N/A'}</span></div><div class="info-item"><span class="info-label">TP1:</span><span class="info-value">${signal.tp1 || 'N/A'}</span></div><div class="info-item"><span class="info-label">TP2:</span><span class="info-value">${signal.tp2 || 'N/A'}</span></div><div class="info-item"><span class="info-label">SL:</span><span class="info-value">${signal.sl || 'N/A'}</span></div></div><div class="signal-actions">${status === 'active' ? `<button class="action-btn btn-success" onclick="updateSignalStatus('${signal.id}', 'success')">✓ Success</button><button class="action-btn btn-breakeven" onclick="updateSignalStatus('${signal.id}', 'breakeven')">⊚ Breakeven</button><button class="action-btn btn-fail" onclick="updateSignalStatus('${signal.id}', 'failed')">✗ Failed</button>` : ''}<button class="action-btn btn-delete" onclick="deleteSignal('${signal.id}')">🗑️ Delete</button></div><div class="signal-date">${dateStr}</div></div>`;
    });
    container.innerHTML = html;
}

function displayNoSignals() {
    document.getElementById('signalsList').innerHTML = `<div class="no-signals"><div class="no-signals-icon">📊</div><div>No signals yet</div><div style="font-size: 11px; margin-top: 8px; color: rgba(0,255,0,0.5);">All generated signals will appear here automatically</div></div>`;
}

async function updateSignalStatus(signalId, newStatus) {
    try {
        const response = await fetch(`${FIREBASE_URL}/signals/${signalId}/status.json`, {
            method: 'PUT',
            body: JSON.stringify(newStatus),
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error('Failed to update signal');
        await loadSignals();
    } catch (error) {
        console.error('Error updating signal:', error);
        alert('Failed to update signal status');
    }
}

async function deleteSignal(signalId) {
    if (!confirm('Are you sure you want to delete this signal?')) return;
    try {
        const response = await fetch(`${FIREBASE_URL}/signals/${signalId}.json`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete signal');
        await loadSignals();
    } catch (error) {
        console.error('Error deleting signal:', error);
        alert('Failed to delete signal');
    }
}

function filterByDate() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    if (!startDate && !endDate) {
        filterSignals(currentFilter);
        return;
    }
    const startTime = startDate ? new Date(startDate).getTime() : 0;
    const endTime = endDate ? new Date(endDate).getTime() + 86400000 : Date.now();
    filteredSignals = allSignals.filter(signal => {
        const signalTime = signal.timestamp || 0;
        return signalTime >= startTime && signalTime <= endTime;
    });
    if (currentFilter !== 'all') {
        filterSignals(currentFilter);
    } else {
        displaySignals();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Signal History Page Loaded');
    loadSignals();
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    document.getElementById('endDate').value = today.toISOString().split('T')[0];
    document.getElementById('startDate').value = thirtyDaysAgo.toISOString().split('T')[0];
});

window.filterSignals = filterSignals;
window.updateSignalStatus = updateSignalStatus;
window.deleteSignal = deleteSignal;
window.filterByDate = filterByDate;
