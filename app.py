import os
import json
import time
from datetime import datetime
from io import BytesIO

from flask import Flask, render_template, send_file, request, jsonify


app = Flask(__name__, static_folder="static", template_folder="templates")


ROWS: list[dict] = []


def ensure_dirs() -> None:
    # makes sure folders exist
    os.makedirs(app.static_folder, exist_ok=True)
    os.makedirs(app.template_folder, exist_ok=True)

    os.makedirs(os.path.join(app.static_folder, "uploads"), exist_ok=True)


def create_test_pdf_if_missing() -> None:
    # creates sample pdf if missing
    test_pdf_path = os.path.join(app.static_folder, "test.pdf")
    if os.path.exists(test_pdf_path):
        return
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas

        c = canvas.Canvas(test_pdf_path, pagesize=A4)
        width, height = A4
        c.setTitle("OCR Test Document")
        c.setFont("Helvetica-Bold", 18)
        c.drawString(72, height - 72, "Invoice / Receipt Extract")

        c.setFont("Helvetica", 12)
        lines = [
            f"Generated: {datetime.utcnow().isoformat()}Z",
            "Item: Widget A",
            "Quantity: 2",
            "Unit Cost: 123.45",
            "Total: 246.90",
            "Notes: This PDF is intended for OCR testing.",
        ]
        y = height - 110
        for line in lines:
            c.drawString(72, y, line)
            y -= 18

        c.showPage()
        c.save()
        print(f"Created test PDF at {test_pdf_path}")
    except Exception as exc:
        print(f"Warning: Could not create test PDF: {exc}")


def compute_total(row: dict) -> float:
    # compute total price with tax
    try:
        qty = float(row.get("quantity", 0) or 0)
        unit = float(row.get("unitCost", 0) or 0)
        subtotal = qty * unit
        tax_rate = float(row.get("taxRate", 0) or 0)  
        discount = float(row.get("discount", 0) or 0)
        taxed = subtotal * (1 + (tax_rate / 100.0))
        total = taxed - discount
        return round(max(total, 0.0), 2)
    except Exception:
        return 0.0


def refresh_totals() -> None:
    # recompute totals for all rows
    for row in ROWS:
        row["total"] = compute_total(row)


@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/rows")
def get_rows():
    refresh_totals()
    return jsonify(ROWS)


@app.post("/api/rows")
def add_row():
    # add a new row fast
    import uuid
    data = request.get_json(force=True) if request.is_json else {}
    row = {
        "id": str(uuid.uuid4()),
        "description": data.get("description", ""),
        "quantity": data.get("quantity", 0),
        "unitCost": data.get("unitCost", 0),
        "ocrText": "",
        "fileName": data.get("fileName", ""),
        "filePath": data.get("filePath", ""),
        "storedFileName": data.get("storedFileName", ""),
        "date": data.get("date", datetime.utcnow().date().isoformat()),
        "category": data.get("category", "General"),
        "vendor": data.get("vendor", ""),
        "currency": data.get("currency", "USD"),
        "taxRate": data.get("taxRate", 0),
        "discount": data.get("discount", 0),
        "status": data.get("status", "Pending"),
        "notes": data.get("notes", ""),
        "building": data.get("building", ""),
        "floor": data.get("floor", ""),
        "room": data.get("room", ""),
        "maintenanceType": data.get("maintenanceType", ""),
        "priority": data.get("priority", "Normal"),
        "assignedTo": data.get("assignedTo", ""),
        "dueDate": data.get("dueDate", ""),
        "serviceProvider": data.get("serviceProvider", ""),
        "invoiceNumber": data.get("invoiceNumber", ""),
        "paymentStatus": data.get("paymentStatus", "Unpaid"),
        "warrantyExpiry": data.get("warrantyExpiry", ""),
        "priceHistory": data.get("priceHistory", []),
    }
    row["total"] = compute_total(row)
    ROWS.append(row)
    return jsonify(row), 201


@app.put("/api/rows/<row_id>")
def update_row(row_id: str):
    # update existing row fields quick
    data = request.get_json(force=True)
    for row in ROWS:
        if row["id"] == row_id:
            if not row.get("storedFileName"):
                return jsonify({"error": "PDF required before editing this row"}), 400
            row.update({
                "description": data.get("description", row.get("description", "")),
                "quantity": data.get("quantity", row.get("quantity", 0)),
                "unitCost": data.get("unitCost", row.get("unitCost", 0)),
                "date": data.get("date", row.get("date")),
                "category": data.get("category", row.get("category")),
                "vendor": data.get("vendor", row.get("vendor")),
                "currency": data.get("currency", row.get("currency")),
                "taxRate": data.get("taxRate", row.get("taxRate", 0)),
                "discount": data.get("discount", row.get("discount", 0)),
                "status": data.get("status", row.get("status")),
                "notes": data.get("notes", row.get("notes", "")),
                # Facility fields
                "building": data.get("building", row.get("building", "")),
                "floor": data.get("floor", row.get("floor", "")),
                "room": data.get("room", row.get("room", "")),
                "maintenanceType": data.get("maintenanceType", row.get("maintenanceType", "")),
                "priority": data.get("priority", row.get("priority", "Normal")),
                "assignedTo": data.get("assignedTo", row.get("assignedTo", "")),
                "dueDate": data.get("dueDate", row.get("dueDate", "")),
                "serviceProvider": data.get("serviceProvider", row.get("serviceProvider", "")),
                "invoiceNumber": data.get("invoiceNumber", row.get("invoiceNumber", "")),
                "paymentStatus": data.get("paymentStatus", row.get("paymentStatus", "Unpaid")),
                "warrantyExpiry": data.get("warrantyExpiry", row.get("warrantyExpiry", "")),
            })
            row["total"] = compute_total(row)
            return jsonify(row)
    return jsonify({"error": "Row not found"}), 404


@app.delete("/api/rows/<row_id>")
def delete_row(row_id: str):
    # delete a row by id
    global ROWS
    before = len(ROWS)
    ROWS = [r for r in ROWS if r.get("id") != row_id]
    if len(ROWS) < before:
        return "", 204
    return jsonify({"error": "Row not found"}), 404


def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    # try pdf then fallback ocr
    """get text from pdf

    rn , first step is checking if it works with something like pdfminer, 
    is computationally inexpensive compared to easy ocr, if it failed, it goes to ocr extractor
    """
    text = ""
    try:
        from pdfminer.high_level import extract_text
        text = extract_text(BytesIO(pdf_bytes)) or ""
    except Exception as exc:
        print(f"pdfminer extract failed: {exc}")

    if text.strip():
        return text

    try:
        import pypdfium2 as pdfium
        import numpy as np
        import cv2  
        import easyocr

        pdf = pdfium.PdfDocument(BytesIO(pdf_bytes))
        if len(pdf) == 0:
            return ""
        page = pdf[0]
        pil_image = page.render(scale=2.0).to_pil()
        image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        reader = easyocr.Reader(["en"], gpu=False)
        results = reader.readtext(image, detail=0)
        text = "\n".join([s for s in results if isinstance(s, str)])
        return text or ""
    except Exception as exc:
        print(f"easy ocr failed for teh reason  {exc}")
    return text or ""


def parse_fields_from_text(text: str) -> dict:
    # grab fields from raw text
    import re
    result: dict = {}
    m_desc = re.search(r"Item\s*[:\-]?\s*([^\n]+)", text, flags=re.IGNORECASE)
    if m_desc:
        result["description"] = m_desc.group(1).strip()
    m_qty = re.search(r"Quantity\s*[:\-]?\s*(\d+(?:[\.,]\d+)?)", text, flags=re.IGNORECASE)
    if m_qty:
        result["quantity"] = float(m_qty.group(1).replace(",", "."))
    m_unit = re.search(r"Unit\s*Cost\s*[:\-]?\s*(\d+[\.,]\d{2})", text, flags=re.IGNORECASE)
    if m_unit:
        result["unitCost"] = float(m_unit.group(1).replace(",", "."))
    m_vendor = re.search(r"Vendor\s*[:\-]?\s*([^\n]+)", text, flags=re.IGNORECASE)
    if m_vendor:
        result["vendor"] = m_vendor.group(1).strip()
    m_date = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    if m_date:
        result["date"] = m_date.group(1)
    return result


@app.post("/api/upload/<row_id>")
def upload_and_ocr(row_id: str):
    # save pdf and run ocr
    if "file" not in request.files:
        return jsonify({"error": "no file"}), 400
    f = request.files["file"]
    pdf_bytes = f.read()
    uploads_dir = os.path.join(app.static_folder, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    filename = f"{row_id}_{int(time.time())}.pdf"
    disk_path = os.path.join(uploads_dir, filename)
    try:
        with open(disk_path, "wb") as out:
            out.write(pdf_bytes)
    except Exception as exc:
        return jsonify({"error": f"faile saving file: {exc}"}), 500
    text = extract_text_from_pdf_bytes(pdf_bytes)

    for row in ROWS:
        if row["id"] == row_id:
            row["ocrText"] = text
            row["fileName"] = f.filename
            row["storedFileName"] = filename
            row["filePath"] = f"/static/uploads/{filename}"
            fields = parse_fields_from_text(text)
            if fields:
                row.update(fields)
                row["total"] = compute_total(row)

            response = dict(row)
            if not (text or "").strip():
                response["ocrWarning"] = (
                    "No text recognized ensure easyocr and pypdfium2 are installed."
                )
            return jsonify(response)
    return jsonify({"error": "Row not found"}), 404


@app.post("/api/rows/<row_id>/ocr")
def rerun_ocr(row_id: str):
    # run ocr again 
    """runnign ocr again."""
    for row in ROWS:
        if row.get("id") == row_id:
            stored_name = row.get("storedFileName")
            if not stored_name:
                return jsonify({"error": "there is no stored pdf for this"}), 400
            disk_path = os.path.join(app.static_folder, "uploads", stored_name)
            if not os.path.exists(disk_path):
                return jsonify({"error": "pdf store not found on server"}), 404
            try:
                with open(disk_path, "rb") as fh:
                    pdf_bytes = fh.read()
                text = extract_text_from_pdf_bytes(pdf_bytes)
                row["ocrText"] = text
                fields = parse_fields_from_text(text)
                if fields:
                    row.update(fields)
                    row["total"] = compute_total(row)
                response = dict(row)
                if not (text or "").strip():
                    response["ocrWarning"] = (
                        "No text recognize ansure easyocr and pypdfium2 are installed."
                    )
                return jsonify(response)
            except Exception as exc:
                return jsonify({"error": f"ocr failed: {exc}"}), 500
    return jsonify({"error": "row not found"}), 404


@app.get("/api/chart-data")
def chart_data():
    # data for charts quickly
    refresh_totals()
    labels = [f"Row {i+1}" for i in range(len(ROWS))]
    totals = [row.get("total", 0) for row in ROWS]
    categories = {}
    for row in ROWS:
        cat = row.get("category", "General")
        categories[cat] = categories.get(cat, 0) + row.get("total", 0)
    return jsonify({"labels": labels, "totals": totals, "byCategory": categories})


@app.get("/api/audit")
def audit():
    # calculate simple audit stats
    refresh_totals()
    non_empty = [r for r in ROWS if (r.get("description") or "").strip() or r.get("quantity") or r.get("unitCost")]
    items = len(non_empty)
    grand_total = round(sum(r.get("total", 0) for r in ROWS), 2)
    avg = round((grand_total / items), 2) if items else 0.0
    return jsonify({"items": items, "grandTotal": grand_total, "average": avg, "generatedAt": datetime.utcnow().isoformat() + "Z"})


@app.get("/api/rows/<row_id>/prices")
def get_prices(row_id: str):
    # get price history list
    for row in ROWS:
        if row["id"] == row_id:
            return jsonify(row.get("priceHistory", []))
    return jsonify({"error": "rowa not found"}), 404


@app.post("/api/rows/<row_id>/prices")
def add_price(row_id: str):
    # add a new price point
    data = request.get_json(force=True)
    price_point = {
        "date": data.get("date", datetime.utcnow().date().isoformat()),
        "price": float(data.get("price", 0) or 0),
    }
    for row in ROWS:
        if row["id"] == row_id:
            row.setdefault("priceHistory", []).append(price_point)
            return jsonify(price_point), 201
    return jsonify({"error": "row not found"}), 404


@app.delete("/api/rows/<row_id>/prices/<int:index>")
def delete_price(row_id: str, index: int):
    # remove price 
    for row in ROWS:
        if row["id"] == row_id:
            history = row.setdefault("priceHistory", [])
            if 0 <= index < len(history):
                history.pop(index)
                return "", 204
            return jsonify({"error": "Index out of range"}), 400
    return jsonify({"error": "row not found"}), 404


@app.route("/api/report", methods=["GET", "POST"])
def generate_report_pdf():
    # build pdf report 
    try:
        payload = request.get_json(force=True) if request.is_json else {}
        rows = payload.get("rows") if payload.get("rows") is not None else ROWS
        if payload.get("summary") is not None:
            summary = payload["summary"]
        else:
            refresh_totals()
            non_empty = [r for r in ROWS if (r.get("description") or "").strip() or r.get("quantity") or r.get("unitCost")]
            items = len(non_empty)
            grand_total = round(sum(r.get("total", 0) for r in ROWS), 2)
            avg = round((grand_total / items), 2) if items else 0.0
            summary = {"items": items, "grandTotal": grand_total, "average": avg, "generatedAt": datetime.utcnow().isoformat() + "Z"}

        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, title="External Report")
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph("External Report (Generated)", styles["Title"]))
        story.append(Spacer(1, 12))

        # summa
        story.append(Paragraph("Audit Summary", styles["Heading2"]))
        for key, value in summary.items():
            story.append(Paragraph(f"{key}: {value}", styles["Normal"]))
        story.append(Spacer(1, 12))

        # table
        story.append(Paragraph("Table Data", styles["Heading2"]))
        table_data = [["#", "Description", "Quantity", "Unit Cost", "Total"]]
        for idx, row in enumerate(rows, start=1):
            table_data.append([
                str(idx),
                str(row.get("description", "")),
                str(row.get("quantity", "")),
                str(row.get("unitCost", "")),
                str(row.get("total", "")),
            ])

        tbl = Table(table_data, hAlign="LEFT")
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]))
        story.append(tbl)

        doc.build(story)
        buffer.seek(0)

        filename = f"report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
        return send_file(
            buffer,
            as_attachment=True,
            download_name=filename,
            mimetype="application/pdf",
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/health")
def health():
    # simple health check ok
    return {"status": "ok"}


@app.route("/static/css/styles.css")
def serve_css():
    # explicit static file route (robust absolute path + graceful errors)
    from flask import send_from_directory, abort
    base_dir = os.path.dirname(__file__)
    dir_path = os.path.join(base_dir, "static", "css")
    try:
        return send_from_directory(dir_path, "styles.css", mimetype="text/css")
    except Exception:
        abort(404)


@app.route("/static/js/app.js")
def serve_js():
    # explicit static file route (robust absolute path + graceful errors)
    from flask import send_from_directory, abort
    base_dir = os.path.dirname(__file__)
    dir_path = os.path.join(base_dir, "static", "js")
    try:
        return send_from_directory(dir_path, "app.js", mimetype="application/javascript")
    except Exception:
        abort(404)


@app.route("/debug/static")
def debug_static():
    # quick static debug info
    import os
    static_path = os.path.join(os.getcwd(), "static")
    css_path = os.path.join(static_path, "css", "styles.css")
    js_path = os.path.join(static_path, "js", "app.js")
    
    return jsonify({
        "static_folder": app.static_folder,
        "template_folder": app.template_folder,
        "css_exists": os.path.exists(css_path),
        "js_exists": os.path.exists(js_path),
        "css_path": css_path,
        "js_path": js_path,
        "working_directory": os.getcwd()
    })


# Ensure directories and sample assets exist at import time (works under Gunicorn)
ensure_dirs()
create_test_pdf_if_missing()

if __name__ == "__main__":
    # start flask app
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "False").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)


