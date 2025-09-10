(() => {
  // track fetch requests count
  const { useState, useEffect, useMemo, useRef } = React;

  (function installGlobalFetchTracker() {
    // monkey patch fetch quick
    if (window.__fetchTrackerInstalled) return;
    window.__fetchTrackerInstalled = true;
    let active = 0;
    const notify = () => {
      window.dispatchEvent(new CustomEvent('net:active', { detail: { active } }));
    };
    const orig = window.fetch;
    window.fetch = function trackedFetch(input, init) {
      active++;
      notify();
      return orig(input, init)
        .catch((err) => { throw err; })
        .finally(() => { active = Math.max(0, active - 1); notify(); });
    };
  })();

  const formatMoney = (value) => {
    // format number to money
    const num = Number(value || 0);
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const computeRowTotal = (row) => {
    // simple qty times price
    const qty = Number(row.quantity || 0);
    const unit = Number(row.unitCost || 0);
    return qty * unit;
  };

  const newRowLocal = (overrides = {}) => ({ id: null, description: '', quantity: 0, unitCost: 0, total: 0, ocrText: '', fileName: '', ...overrides });
  const initialRows = [];

  function TotalsChart({ rows }) {
    // renders charts fast
    const barRef = useRef(null);
    const doughnutRef = useRef(null);
    const vendorRef = useRef(null);
    const barChartRef = useRef(null);
    const doughnutChartRef = useRef(null);
    const vendorChartRef = useRef(null);

    const chartData = useMemo(() => {
      // compute chart data here
      const labels = rows.map((_, i) => `Row ${i + 1}`);
      const totals = rows.map((r) => Number(r.total || 0));
      const byCategory = {};
      const byVendor = {};
      rows.forEach((r) => {
        const cat = r.category || 'General';
        byCategory[cat] = (byCategory[cat] || 0) + Number(r.total || 0);
        const ven = r.vendor || 'Unknown';
        byVendor[ven] = (byVendor[ven] || 0) + Number(r.total || 0);
      });
      return { labels, totals, byCategory, byVendor };
    }, [rows]);

    useEffect(() => {
      // init or update charts
      if (barRef.current) {
        if (!barChartRef.current) {
          barChartRef.current = new Chart(barRef.current.getContext('2d'), {
            type: 'bar',
            data: {
              labels: chartData.labels,
              datasets: [{ label: 'Row Totals', data: chartData.totals, backgroundColor: 'rgba(54,162,235,0.5)', borderColor: 'rgba(54,162,235,1)', borderWidth: 1 }],
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } } },
          });
        } else {
          const c = barChartRef.current;
          c.data.labels = chartData.labels;
          c.data.datasets[0].data = chartData.totals;
          c.update();
        }
      }
      if (doughnutRef.current) {
        const catLabels = Object.keys(chartData.byCategory || {});
        const catTotals = catLabels.map((k) => chartData.byCategory[k]);
        if (!doughnutChartRef.current) {
          doughnutChartRef.current = new Chart(doughnutRef.current.getContext('2d'), {
            type: 'doughnut',
            data: { labels: catLabels, datasets: [{ label: 'By Category', data: catTotals }] },
            options: { responsive: true },
          });
        } else {
          const c = doughnutChartRef.current;
          c.data.labels = catLabels;
          c.data.datasets[0].data = catTotals;
          c.update();
        }
      }
      if (vendorRef.current) {
        const vLabels = Object.keys(chartData.byVendor || {});
        const vTotals = vLabels.map((k) => chartData.byVendor[k]);
        if (!vendorChartRef.current) {
          vendorChartRef.current = new Chart(vendorRef.current.getContext('2d'), {
            type: 'bar',
            data: { labels: vLabels, datasets: [{ label: 'By Vendor', data: vTotals, backgroundColor: 'rgba(75,192,192,0.5)', borderColor: 'rgba(75,192,192,1)', borderWidth: 1 }] },
            options: { responsive: true, indexAxis: 'y', scales: { x: { beginAtZero: true } } },
          });
        } else {
          const c = vendorChartRef.current;
          c.data.labels = vLabels;
          c.data.datasets[0].data = vTotals;
          c.update();
        }
      }
    }, [chartData]);

    return (
      <div style={{ width: '100%' }}>
        <div style={{ position: 'relative', width: '100%', height: 320 }}>
          <canvas ref={barRef} style={{ width: '100%', height: '100%' }} />
        </div>
        <div style={{ height: 8 }} />
        <div style={{ position: 'relative', width: '100%', height: 320, display: 'flex', justifyContent: 'center' }}>
          <canvas ref={doughnutRef} style={{ width: '100%', height: '100%', maxWidth: 420 }} />
        </div>
        <div style={{ height: 8 }} />
        <div style={{ position: 'relative', width: '100%', height: 320 }}>
          <canvas ref={vendorRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    );
  }

  function PriceHistory({ rowId }) {
    // show price history table
    const [history, setHistory] = useState([]);
    const [date, setDate] = useState('');
    const [price, setPrice] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [deletingIndex, setDeletingIndex] = useState(null);

    const load = async () => {
      // load prices from server
      const res = await fetch(`/api/rows/${rowId}/prices`);
      if (res.ok) setHistory(await res.json());
    };
    useEffect(() => { load(); }, [rowId]);

    const add = async () => {
      // add price point quick
      if (!price) return;
      setIsAdding(true);
      const res = await fetch(`/api/rows/${rowId}/prices`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, price }) });
      if (res.ok) { setDate(''); setPrice(''); load(); }
      setIsAdding(false);
    };
    const removeAt = async (idx) => {
      // delete price by index
      setDeletingIndex(idx);
      const res = await fetch(`/api/rows/${rowId}/prices/${idx}`, { method: 'DELETE' });
      if (res.status === 204) load();
      setDeletingIndex(null);
    };

    return (
      <div>
        <h4>Prices Over Time</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="number" step="0.01" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
          <button onClick={add} disabled={isAdding}>{isAdding ? (<><span className="spinner" />Adding…</>) : 'Add'}</button>
        </div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Price</th><th></th></tr></thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={3} className="empty-state">No price history yet.</td></tr>
            ) : history.map((p, idx) => (
              <tr key={idx}>
                <td>{p.date}</td>
                <td className="money">{formatMoney(p.price)}</td>
                <td><button onClick={() => removeAt(idx)} disabled={deletingIndex === idx}>{deletingIndex === idx ? (<><span className="spinner" />Deleting…</>) : 'Delete'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function DataRow({ row, onChange, onUpload, onDelete, onRunOcr }) {
    // one row component ui
    const disabled = !row.storedFileName;
    const [isOcr, setIsOcr] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    return (
      <tr>
        <td>{row.index}</td>
        <td>
          <input
            type="text"
            value={row.description}
            placeholder="Description"
            onChange={(e) => onChange({ description: e.target.value })}
            disabled={disabled}
          />
        </td>
        <td>
          <input
            type="date"
            value={row.date || ''}
            onChange={(e) => onChange({ date: e.target.value })}
            disabled={disabled}
          />
        </td>
        <td>
          <input
            type="number"
            step="1"
            min="0"
            value={row.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            disabled={disabled}
          />
        </td>
        <td>
          <input
            type="number"
            step="0.01"
            min="0"
            value={row.unitCost}
            onChange={(e) => onChange({ unitCost: e.target.value })}
            disabled={disabled}
          />
        </td>
        <td className="money">{formatMoney(row.total)}</td>
        <td style={{ whiteSpace: 'nowrap' }}>
          <label className="upload">
            <input
              type="file"
              accept="application/pdf"
              onChange={async (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                setIsUploading(true);
                try { await onUpload(f); } finally { setIsUploading(false); }
              }}
            />
            {isUploading ? (<><span className="spinner" />Uploading…</>) : (row.fileName ? `Uploaded: ${row.fileName}` : 'Choose PDF…')}
          </label>
          {' '}
          {row.filePath ? (
            <a href={row.filePath} target="_blank" rel="noreferrer">View PDF</a>
          ) : null}
          {' '}
          <button onClick={async () => { setIsOcr(true); try { await onRunOcr(); } finally { setIsOcr(false); } }} disabled={!row.storedFileName || isOcr} title={row.storedFileName ? 'Re-run OCR' : 'Upload a PDF first'}>{isOcr ? (<><span className="spinner" />Running…</>) : 'Run OCR'}</button>
          {' '}
          <button onClick={async () => { setIsDeleting(true); try { await onDelete(); } finally { setIsDeleting(false); } }} aria-label="Delete row" disabled={isDeleting}>{isDeleting ? (<><span className="spinner" />Deleting…</>) : 'Delete'}</button>
          {row.ocrText ? (
            <details className="ocr-details">
              <summary>OCR Text</summary>
              <pre>{row.ocrText}</pre>
            </details>
          ) : null}
          <details className="ocr-details">
            <summary>Details</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <label>
                Category
                <input type="text" value={row.category || ''} onChange={(e) => onChange({ category: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Vendor
                <input type="text" value={row.vendor || ''} onChange={(e) => onChange({ vendor: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Building
                <input type="text" value={row.building || ''} onChange={(e) => onChange({ building: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Floor
                <input type="text" value={row.floor || ''} onChange={(e) => onChange({ floor: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Room
                <input type="text" value={row.room || ''} onChange={(e) => onChange({ room: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Maintenance Type
                <input type="text" value={row.maintenanceType || ''} onChange={(e) => onChange({ maintenanceType: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Priority
                <input type="text" value={row.priority || 'Normal'} onChange={(e) => onChange({ priority: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Assigned To
                <input type="text" value={row.assignedTo || ''} onChange={(e) => onChange({ assignedTo: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Due Date
                <input type="date" value={row.dueDate || ''} onChange={(e) => onChange({ dueDate: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Service Provider
                <input type="text" value={row.serviceProvider || ''} onChange={(e) => onChange({ serviceProvider: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Invoice #
                <input type="text" value={row.invoiceNumber || ''} onChange={(e) => onChange({ invoiceNumber: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Payment Status
                <input type="text" value={row.paymentStatus || 'Unpaid'} onChange={(e) => onChange({ paymentStatus: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Warranty Expiry
                <input type="date" value={row.warrantyExpiry || ''} onChange={(e) => onChange({ warrantyExpiry: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Currency
                <input type="text" value={row.currency || 'USD'} onChange={(e) => onChange({ currency: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Tax %
                <input type="number" step="0.01" value={row.taxRate || 0} onChange={(e) => onChange({ taxRate: e.target.value })} disabled={disabled} />
              </label>
              <label>
                Discount
                <input type="number" step="0.01" value={row.discount || 0} onChange={(e) => onChange({ discount: e.target.value })} disabled={disabled} />
              </label>
              <label style={{ gridColumn: '1 / span 2' }}>
                Status
                <input type="text" value={row.status || ''} onChange={(e) => onChange({ status: e.target.value })} disabled={disabled} />
              </label>
              <label style={{ gridColumn: '1 / span 2' }}>
                Notes
                <input type="text" value={row.notes || ''} onChange={(e) => onChange({ notes: e.target.value })} disabled={disabled} />
              </label>
            </div>
            <div style={{ height: 8 }} />
            <PriceHistory rowId={row.id} />
          </details>
        </td>
      </tr>
    );
  }

  function DataTable({ rows, onChangeField, onUpload, onDelete, onRunOcr }) {
    // renders the whole table
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Date</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
              <th>Upload/Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">No rows yet. Click "Add Row" or "Load Sample Data".</td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <DataRow
                  key={row.id || idx}
                  row={{ ...row, index: idx + 1 }}
                  onChange={(patch) => onChangeField(row.id, patch)}
                  onUpload={(file) => onUpload(row.id, file)}
                  onDelete={() => onDelete(row.id)}
                  onRunOcr={() => onRunOcr(row.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  function App() {
    // main app component
    const [rows, setRows] = useState(initialRows);
    const [netActive, setNetActive] = useState(0);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoadingSample, setIsLoadingSample] = useState(false);
    const [isAddingRow, setIsAddingRow] = useState(false);
    const [toast, setToast] = useState('');
    const [ocrModal, setOcrModal] = useState({ open: false, text: '', title: '' });
    const [addModal, setAddModal] = useState({
      open: false,
      description: '',
      date: '',
      quantity: '',
      unitCost: '',
      category: '',
      vendor: '',
      currency: 'USD',
      taxRate: '',
      discount: '',
      status: 'Pending',
      notes: '',
      building: '', floor: '', room: '',
      maintenanceType: '', priority: 'Normal', assignedTo: '', dueDate: '',
      serviceProvider: '', invoiceNumber: '', paymentStatus: 'Unpaid', warrantyExpiry: '',
      file: null,
      tempRowId: null,
      tempRowData: null,
      ocrText: '',
      isUploading: false,
    });
    const [auditModal, setAuditModal] = useState({ open: false, data: null, speaking: false });

    const showToast = (msg) => {
      // quick toast message
      setToast(msg);
      window.clearTimeout(showToast._t);
      showToast._t = window.setTimeout(() => setToast(''), 3000);
    };


    useEffect(() => {
      // load initial rows
      const onNet = (e) => setNetActive(e.detail.active || 0);
      window.addEventListener('net:active', onNet);
      (async () => {
        const res = await fetch('/api/rows');
        const data = await res.json();
        setRows(data);
      })();
      return () => window.removeEventListener('net:active', onNet);
    }, []);

    const totals = useMemo(() => rows.map((r) => Number(r.total || 0)), [rows]);
    const labels = useMemo(() => rows.map((_, i) => `Row ${i + 1}`), [rows]);

    const addRow = async () => {
      // open add row modal
      setAddModal((_) => ({
        open: true,
        description: '', date: '', quantity: '', unitCost: '',
        category: '', vendor: '', currency: 'USD', taxRate: '', discount: '', status: 'Pending', notes: '',
        building: '', floor: '', room: '', maintenanceType: '', priority: 'Normal', assignedTo: '', dueDate: '',
        serviceProvider: '', invoiceNumber: '', paymentStatus: 'Unpaid', warrantyExpiry: '',
        file: null, tempRowId: null, tempRowData: null, ocrText: '', isUploading: false,
      }));
    };

    const submitNewRow = async () => {
      // submit new row to api
      try {
        setIsAddingRow(true);
        if (!addModal.file) { alert('Please choose a PDF'); return; }
        const payload = {
          description: addModal.description || '',
          date: addModal.date || undefined,
          quantity: addModal.quantity || 0,
          unitCost: addModal.unitCost || 0,
          category: addModal.category || undefined,
          vendor: addModal.vendor || undefined,
          currency: addModal.currency || undefined,
          taxRate: addModal.taxRate || undefined,
          discount: addModal.discount || undefined,
          status: addModal.status || undefined,
          notes: addModal.notes || undefined,
          building: addModal.building || undefined,
          floor: addModal.floor || undefined,
          room: addModal.room || undefined,
          maintenanceType: addModal.maintenanceType || undefined,
          priority: addModal.priority || undefined,
          assignedTo: addModal.assignedTo || undefined,
          dueDate: addModal.dueDate || undefined,
          serviceProvider: addModal.serviceProvider || undefined,
          invoiceNumber: addModal.invoiceNumber || undefined,
          paymentStatus: addModal.paymentStatus || undefined,
          warrantyExpiry: addModal.warrantyExpiry || undefined,
        };
        let rowId = addModal.tempRowId;
        let updated = addModal.tempRowData;

        if (!rowId) {
          const createdRes = await fetch('/api/rows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          const created = await createdRes.json();
          rowId = created.id;

          const form = new FormData();
          form.append('file', addModal.file);
          const up = await fetch(`/api/upload/${rowId}`, { method: 'POST', body: form });
          updated = up.ok ? await up.json() : created;
        } else {
          const put = await fetch(`/api/rows/${rowId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          updated = put.ok ? await put.json() : updated;
        }
        setRows((prev) => prev.concat([updated]));
        setAddModal({
          open: false,
          description: '', date: '', quantity: '', unitCost: '',
          category: '', vendor: '', currency: 'USD', taxRate: '', discount: '', status: 'Pending', notes: '',
          building: '', floor: '', room: '', maintenanceType: '', priority: 'Normal', assignedTo: '', dueDate: '',
          serviceProvider: '', invoiceNumber: '', paymentStatus: 'Unpaid', warrantyExpiry: '',
          file: null, tempRowId: null, tempRowData: null, ocrText: '', isUploading: false,
        });
        showToast('Row created and OCR generated');
        setOcrModal({ open: true, text: (updated.ocrText || updated.ocrWarning || 'No OCR text recognized.'), title: updated.fileName || 'OCR Result' });
      } catch (e) {
        alert('Failed to add row');
      } finally {
        setIsAddingRow(false);
      }
    };

    const updateRowField = async (id, patch) => {
      // update a row on server
      const res = await fetch(`/api/rows/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      if (!res.ok) return;
      const updated = await res.json();
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    };

    const handleFileChange = async (id, file) => {
      // upload pdf then update
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/upload/${id}`, { method: 'POST', body: form });
      if (!res.ok) {
        alert('Upload failed');
        return;
      }
      const updated = await res.json();
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      showToast('OCR generated from uploaded PDF');
      setOcrModal({ open: true, text: (updated.ocrText || updated.ocrWarning || 'No OCR text recognized.'), title: updated.fileName || 'OCR Result' });
    };
    // setting up constant for running the ocr, this val won' tchange 
    const runOcr = async (id) => {
      // request rerun ocr now
      try {
        const res = await fetch(`/api/rows/${id}/ocr`, { method: 'POST' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'OCR failed');
          return;
        }
        const updated = await res.json();
        setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
        showToast('OCR re-run completed');
        

        const ocrText = updated.ocrText || updated.ocrWarning || 'No OCR text recognized.';
        const fileName = updated.fileName || 'OCR Result';
        setOcrModal({ open: true, text: ocrText, title: fileName });
      } catch (error) {
        console.error('OCR error:', error);
        alert('OCR failed: ' + error.message);
      }
    };

    const viewOcr = (id) => {
      // open ocr modal view
      const r = rows.find((x) => x.id === id);
      if (!r || !r.ocrText) return;
      setOcrModal({ open: true, text: r.ocrText, title: r.fileName || 'OCR Result' });
    };

    const showAuditSummary = async () => {
      // fetch and show audit
      const res = await fetch('/api/audit');
      const a = await res.json();
      setAuditModal({ open: true, data: a, speaking: false });
    };

    const playAudit = () => {
      // speak audit using tts
      if (!auditModal.data) return;
      const a = auditModal.data;
      const text = `Items: ${a.items}. Grand Total: ${a.grandTotal}. Average per item: ${a.average}.`;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.onend = () => setAuditModal((m) => ({ ...m, speaking: false }));
        setAuditModal((m) => ({ ...m, speaking: true }));
        window.speechSynthesis.speak(utter);
      } catch (_) {}
    };
    const stopAudit = () => {
      // stop speaking now
      try { window.speechSynthesis.cancel(); } catch (_) {}
      setAuditModal((m) => ({ ...m, speaking: false }));
    };

    const downloadReport = async () => {
      // download pdf report file
      try {
        setIsGenerating(true);
        const res = await fetch('/api/report');
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'Failed to generate report');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'external_report.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        alert('Download failed: ' + (e?.message || e));
      } finally {
        setIsGenerating(false);
      }
    };

    const deleteRow = async (id) => {
      // delete row on server
      const res = await fetch(`/api/rows/${id}`, { method: 'DELETE' });
      if (res.status === 204) setRows((prev) => prev.filter((r) => r.id !== id));
    };

    const loadSample = async () => {
      // load some sample rows
      setIsLoadingSample(true);

      const samples = [
        { description: 'Office Chair Replacement', quantity: 5, unitCost: 125.99, category: 'Furniture', vendor: 'OfficeMax Solutions', building: 'Main Building', floor: '3rd Floor', room: 'A301' },
        { description: 'Network Switch Upgrade', quantity: 2, unitCost: 450.00, category: 'IT Equipment', vendor: 'TechGear Inc', building: 'Server Room', floor: 'Basement', room: 'B001' },
        { description: 'Window Cleaning Service', quantity: 1, unitCost: 85.50, category: 'Maintenance', vendor: 'Crystal Clear Windows', building: 'Main Building', floor: 'All Floors', room: 'Exterior' },
        { description: 'Fire Extinguisher Inspection', quantity: 8, unitCost: 25.00, category: 'Safety', vendor: 'Safety First Corp', building: 'All Buildings', floor: 'All Floors', room: 'Various' },
        { description: 'Coffee Machine Repair', quantity: 1, unitCost: 150.00, category: 'Appliances', vendor: 'BrewMaster Services', building: 'Main Building', floor: '2nd Floor', room: 'Break Room' },
        { description: 'Carpet Cleaning', quantity: 1, unitCost: 200.00, category: 'Cleaning', vendor: 'Fresh Clean Co', building: 'Conference Center', floor: 'Ground Floor', room: 'Main Hall' },
        { description: 'Printer Toner Cartridges', quantity: 12, unitCost: 45.75, category: 'Office Supplies', vendor: 'PrintPro Solutions', building: 'Main Building', floor: '2nd Floor', room: 'Copy Room' },
        { description: 'HVAC Filter Replacement', quantity: 4, unitCost: 32.50, category: 'HVAC', vendor: 'Climate Control Inc', building: 'Main Building', floor: 'All Floors', room: 'Mechanical Room' },
      ];

      const pdfRes = await fetch('/static/test.pdf');
      if (!pdfRes.ok) {
        alert('Could not load sample PDF');
        return;
      }
      const pdfBlob = await pdfRes.blob();
      const sampleFile = new File([pdfBlob], 'sample.pdf', { type: 'application/pdf' });

      for (const s of samples) {
        const res = await fetch('/api/rows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
        const row = await res.json();
        const form = new FormData();
        form.append('file', sampleFile);
        const up = await fetch(`/api/upload/${row.id}`, { method: 'POST', body: form });
        let updated = up.ok ? await up.json() : row;
        

        const sampleData = {
          description: s.description,
          quantity: s.quantity,
          unitCost: s.unitCost,
          category: s.category,
          vendor: s.vendor,
          building: s.building || '',
          floor: s.floor || '',
          room: s.room || '',
          ocrText: `Sample invoice for ${s.description}\nQuantity: ${s.quantity}\nUnit Cost: $${s.unitCost}\nTotal: $${s.quantity * s.unitCost}`,
          fileName: `sample_${s.description.replace(/\s+/g, '_').toLowerCase()}.pdf`
        };
        const put = await fetch(`/api/rows/${row.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sampleData) });
        if (put.ok) updated = await put.json();
        setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)).concat(prev.find((r) => r.id === updated.id) ? [] : [updated]));
      }
      showToast('Loaded sample rows with attached PDF');
      setIsLoadingSample(false);
    };


    return (
      <div className="app">
        {}

        <div className="toolbar">
          <button onClick={addRow} disabled={isAddingRow}>{isAddingRow ? (<><span className="spinner" />Adding…</>) : 'Add Row'}</button>
          <button onClick={loadSample} disabled={isLoadingSample}>{isLoadingSample ? (<><span className="spinner" />Loading…</>) : 'Load Sample Data'}</button>
          <button onClick={showAuditSummary}>Audit Summary</button>
          <a href="/static/test.pdf" download target="_blank" rel="noreferrer"><button type="button">Download Sample PDF</button></a>
          <button onClick={downloadReport} disabled={isGenerating}>{isGenerating ? (<><span className="spinner" />Generating…</>) : 'Download Report PDF'}</button>
        </div>

        <DataTable rows={rows} onChangeField={updateRowField} onUpload={handleFileChange} onDelete={deleteRow} onRunOcr={runOcr} onViewOcr={viewOcr} />

        <div className="chart-wrapper">
          <h3>Totals & Category Charts</h3>
          <TotalsChart rows={rows} />
        </div>

        <div className="grand-total">
          Grand Total: {formatMoney(totals.reduce((a, b) => a + b, 0))}
        </div>
        {toast ? <div className="toast">{toast}</div> : null}
        {auditModal.open ? (
          <div className="modal-backdrop" onClick={() => { stopAudit(); setAuditModal({ open: false, data: null, speaking: false }); }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <strong>Audit Summary</strong>
                <button onClick={() => { stopAudit(); setAuditModal({ open: false, data: null, speaking: false }); }}>Close</button>
              </div>
              <div className="modal-body">
                {auditModal.data ? (
                  <div>
                    <div>Items: {auditModal.data.items}</div>
                    <div>Grand Total: {auditModal.data.grandTotal}</div>
                    <div>Average per item: {auditModal.data.average}</div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      {!auditModal.speaking ? (
                        <button onClick={playAudit}>Play</button>
                      ) : (
                        <button onClick={stopAudit}>Stop</button>
                      )}
                      <button onClick={downloadReport}>Download PDF</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {addModal.open ? (
          <div className="modal-backdrop" onClick={async () => {
            if (addModal.tempRowId) { try { await fetch(`/api/rows/${addModal.tempRowId}`, { method: 'DELETE' }); } catch (_) {} }
            setAddModal({ open: false, description: '', date: '', quantity: '', unitCost: '', category: '', vendor: '', currency: 'USD', taxRate: '', discount: '', status: 'Pending', notes: '', building: '', floor: '', room: '', maintenanceType: '', priority: 'Normal', assignedTo: '', dueDate: '', serviceProvider: '', invoiceNumber: '', paymentStatus: 'Unpaid', warrantyExpiry: '', file: null, tempRowId: null, tempRowData: null, ocrText: '', isUploading: false });
          }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <strong>New Bill</strong>
                <button onClick={async () => {
                  if (addModal.tempRowId) { try { await fetch(`/api/rows/${addModal.tempRowId}`, { method: 'DELETE' }); } catch (_) {} }
                  setAddModal({ open: false, description: '', date: '', quantity: '', unitCost: '', category: '', vendor: '', currency: 'USD', taxRate: '', discount: '', status: 'Pending', notes: '', building: '', floor: '', room: '', maintenanceType: '', priority: 'Normal', assignedTo: '', dueDate: '', serviceProvider: '', invoiceNumber: '', paymentStatus: 'Unpaid', warrantyExpiry: '', file: null, tempRowId: null, tempRowData: null, ocrText: '', isUploading: false });
                }}>Close</button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  <label style={{ gridColumn: '1 / span 2' }}>PDF (required, upload first)
                    <input type="file" accept="application/pdf" onChange={async (e) => {
                      const file = e.target.files && e.target.files[0];
                      if (!file) return;
                      setAddModal((m) => ({ ...m, isUploading: true, file }));
                      try {
                        let rowId = addModal.tempRowId;
                        if (!rowId) {
                          const createdRes = await fetch('/api/rows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                          const created = await createdRes.json();
                          rowId = created.id;
                        }
                        const form = new FormData();
                        form.append('file', file);
                        const up = await fetch(`/api/upload/${rowId}`, { method: 'POST', body: form });
                        if (!up.ok) throw new Error('Upload failed');
                        const updated = await up.json();
                        setAddModal((m) => ({
                          ...m,
                          tempRowId: rowId,
                          tempRowData: updated,
                          isUploading: false,
                          ocrText: (updated.ocrText || updated.ocrWarning || ''),
                          description: updated.description || m.description,
                          date: updated.date || m.date,
                          quantity: (updated.quantity ?? m.quantity),
                          unitCost: (updated.unitCost ?? m.unitCost),
                          vendor: updated.vendor || m.vendor,
                        }));
                      } catch (_) {
                        setAddModal((m) => ({ ...m, isUploading: false }));
                        alert('Upload failed');
                      }
                    }} />
                  </label>
                  {addModal.isUploading ? <div style={{ gridColumn: '1 / span 2' }}>Uploading and running OCR…</div> : null}
                  {addModal.ocrText ? (
                    <div style={{ gridColumn: '1 / span 2' }}>
                      <strong>Recognized Text</strong>
                      <pre className="modal-body" style={{ maxHeight: 200, overflow: 'auto' }}>{addModal.ocrText}</pre>
                    </div>
                  ) : null}
                  <label style={{ gridColumn: '1 / span 2' }}>Description*
                    <input type="text" value={addModal.description} onChange={(e) => setAddModal((m) => ({ ...m, description: e.target.value }))} />
                  </label>
                  <label>Date
                    <input type="date" value={addModal.date} onChange={(e) => setAddModal((m) => ({ ...m, date: e.target.value }))} />
                  </label>
                  <label>Quantity*
                    <input type="number" step="1" min="0" value={addModal.quantity} onChange={(e) => setAddModal((m) => ({ ...m, quantity: e.target.value }))} />
                  </label>
                  <label>Price*
                    <input type="number" step="0.01" min="0" value={addModal.unitCost} onChange={(e) => setAddModal((m) => ({ ...m, unitCost: e.target.value }))} />
                  </label>
                  <label>Vendor*
                    <input type="text" value={addModal.vendor} onChange={(e) => setAddModal((m) => ({ ...m, vendor: e.target.value }))} />
                  </label>
                  <label>Category
                    <input type="text" value={addModal.category} onChange={(e) => setAddModal((m) => ({ ...m, category: e.target.value }))} />
                  </label>
                  <label>Currency
                    <input type="text" value={addModal.currency} onChange={(e) => setAddModal((m) => ({ ...m, currency: e.target.value }))} />
                  </label>
                  <label>Tax %
                    <input type="number" step="0.01" value={addModal.taxRate} onChange={(e) => setAddModal((m) => ({ ...m, taxRate: e.target.value }))} />
                  </label>
                  <label>Discount
                    <input type="number" step="0.01" value={addModal.discount} onChange={(e) => setAddModal((m) => ({ ...m, discount: e.target.value }))} />
                  </label>
                  <label style={{ gridColumn: '1 / span 2' }}>Status
                    <input type="text" value={addModal.status} onChange={(e) => setAddModal((m) => ({ ...m, status: e.target.value }))} />
                  </label>
                  <label style={{ gridColumn: '1 / span 2' }}>Notes
                    <input type="text" value={addModal.notes} onChange={(e) => setAddModal((m) => ({ ...m, notes: e.target.value }))} />
                  </label>
                  <label>Building
                    <input type="text" value={addModal.building} onChange={(e) => setAddModal((m) => ({ ...m, building: e.target.value }))} />
                  </label>
                  <label>Floor
                    <input type="text" value={addModal.floor} onChange={(e) => setAddModal((m) => ({ ...m, floor: e.target.value }))} />
                  </label>
                  <label>Room
                    <input type="text" value={addModal.room} onChange={(e) => setAddModal((m) => ({ ...m, room: e.target.value }))} />
                  </label>
                  <label>Maintenance Type
                    <input type="text" value={addModal.maintenanceType} onChange={(e) => setAddModal((m) => ({ ...m, maintenanceType: e.target.value }))} />
                  </label>
                  <label>Priority
                    <input type="text" value={addModal.priority} onChange={(e) => setAddModal((m) => ({ ...m, priority: e.target.value }))} />
                  </label>
                  <label>Assigned To
                    <input type="text" value={addModal.assignedTo} onChange={(e) => setAddModal((m) => ({ ...m, assignedTo: e.target.value }))} />
                  </label>
                  <label>Due Date
                    <input type="date" value={addModal.dueDate} onChange={(e) => setAddModal((m) => ({ ...m, dueDate: e.target.value }))} />
                  </label>
                  <label>Service Provider
                    <input type="text" value={addModal.serviceProvider} onChange={(e) => setAddModal((m) => ({ ...m, serviceProvider: e.target.value }))} />
                  </label>
                  <label>Invoice #
                    <input type="text" value={addModal.invoiceNumber} onChange={(e) => setAddModal((m) => ({ ...m, invoiceNumber: e.target.value }))} />
                  </label>
                  <label>Payment Status
                    <input type="text" value={addModal.paymentStatus} onChange={(e) => setAddModal((m) => ({ ...m, paymentStatus: e.target.value }))} />
                  </label>
                  <label>Warranty Expiry
                    <input type="date" value={addModal.warrantyExpiry} onChange={(e) => setAddModal((m) => ({ ...m, warrantyExpiry: e.target.value }))} />
                  </label>
                </div>
                <div className="modal-footer">
                  {(() => {
                    const valid = addModal.file && (addModal.description || '').trim() && Number(addModal.quantity) > 0 && Number(addModal.unitCost) > 0 && (addModal.vendor || '').trim();
                    return (
                      <button onClick={submitNewRow} disabled={isAddingRow || !valid}>{isAddingRow ? 'Creating…' : 'Create'}</button>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {ocrModal.open ? (
          <div className="modal-backdrop" onClick={() => setOcrModal({ open: false, text: '', title: '' })}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <strong>{ocrModal.title}</strong>
                <button onClick={() => setOcrModal({ open: false, text: '', title: '' })}>Close</button>
              </div>
              <pre className="modal-body" style={{ maxHeight: 300, overflow: 'auto' }}>{ocrModal.text}</pre>
            </div>
          </div>
        ) : null}
        {netActive > 0 ? (
          <div className="loading-overlay"><span className="spinner spinner-lg" /></div>
        ) : null}
      </div>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
})();


