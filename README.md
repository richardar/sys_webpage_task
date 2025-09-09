# Flask + React Table, Chart, OCR Demo

Quick start

1. Create and activate a virtual environment (recommended).
2. Install requirements:

```bash
pip install -r requirements.txt
```

3. Run the app:

```bash
python app.py
```

4. Open http://localhost:5000.

A test PDF will be created at static/test.pdf on first run. Use it to test per-row uploads and OCR.

What this app demonstrates
- React table with add-row, inputs for quantity and unit cost, automatic totals, and grand total
- Per-row file upload (PDF). Server-side text extraction using pdfminer; OCR fallback using Tesseract via pytesseract
- Chart.js bar chart of per-row totals
- Audit summary button (alert) and server-generated PDF report button
- Flask endpoint to generate a PDF report (ReportLab)

Notes on services and costs
- OCR/Text extraction runs on the server (Flask). No paid services required. For production-grade accuracy/throughput, consider AWS Textract, Google Document AI, or Azure Form Recognizer.
- PDF report generation uses ReportLab locally, no paid services.

Windows notes (OCR dependencies)
- Install Tesseract OCR for Windows (add to PATH): https://github.com/UB-Mannheim/tesseract/wiki
- Install Poppler for Windows (needed by pdf2image) and add its bin directory to PATH: http://blog.alivate.com.au/poppler-windows/
- After installing, restart your shell so PATH updates are applied.

Debugging chart not updating for one row
If the chart updates for all rows except one:
1. Verify state: ensure the problematic row's quantity and unitCost are numbers (not empty strings). In this app we coerce to numbers on change. Add console logs to inspect rows state.
2. Check keys: each row uses index as key. If rows are being re-ordered or removed, consider a stable id for each row to avoid reconciliation issues.
3. Confirm dataset length matches labels length; Chart.js requires them to be aligned.
4. Ensure computeRowTotal returns a number (not NaN). Guard parsing and default to 0.
5. Check Chart.js update() is called. Our useChart hook updates on [labels, data] changes.
6. Inspect for render errors in DevTools console. Fix any exceptions during OCR or data parsing that could prevent state updates.

Tech choices
- Frontend via CDN for simplicity (React 18, Chart.js 4)
- Backend Flask for serving, OCR, analytics, and report generation

