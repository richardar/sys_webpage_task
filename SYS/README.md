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
# Chart not updating for one row

If chart updates for all rows except one, here are the debugging steps to rectify it:

1. **Row state**  
   Maybe that row has `quantity` or `unitCost` as string instead of number. We coerce to number on change but better to add some console.log to see what’s actually in state.  

2. **Keys issue**  
   Right now rows use index as key. If rows get reordered or removed, React might mess up. Safer to use an id for each row instead of index.  

3. **Dataset vs labels**  
   Chart.js wants data length same as labels length. If they don’t match, the chart won’t update right.  

4. **Row total**  
   `computeRowTotal` must always give a number. If it returns NaN then chart breaks. Put a guard and fallback to 0.  

5. **Chart update call**  
   Need to check if `chart.update()` actually gets called. Our hook depends on `[labels, data]`, so confirm those are changing.  

6. **Console errors**  
   Look in devtools, sometimes errors in OCR or parsing can stop state updates for that single row.


Tech choices
- Frontend via CDN for simplicity (React 18, Chart.js 4)
- Backend Flask for serving, OCR, analytics, and report generation

