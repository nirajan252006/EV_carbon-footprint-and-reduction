import io
import os
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from PIL import Image

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None

try:
    import pypdf
except ImportError:
    pypdf = None

try:
    import pytesseract
except ImportError:
    pytesseract = None


def find_tesseract_binary() -> str | None:
    """Discovers tesseract binary portably via env var, PATH, or standard OS directories."""
    env_cmd = os.environ.get("TESSERACT_CMD")
    if env_cmd and os.path.isfile(env_cmd):
        return env_cmd

    which_cmd = shutil.which("tesseract")
    if which_cmd and os.path.isfile(which_cmd):
        return which_cmd

    standard_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        r"/usr/bin/tesseract",
        r"/usr/local/bin/tesseract",
        r"/opt/homebrew/bin/tesseract",
    ]
    for p in standard_paths:
        if os.path.isfile(p):
            return p
    return None


def is_ocr_available() -> bool:
    """Returns True if pytesseract is installed and a valid tesseract binary is discovered."""
    if not pytesseract:
        return False
    cmd = find_tesseract_binary()
    return cmd is not None


def get_ocr_engine_info() -> dict[str, Any]:
    cmd = find_tesseract_binary()
    return {
        "tesseract_installed": cmd is not None,
        "tesseract_path": cmd,
        "pymupdf_available": fitz is not None,
        "pypdf_available": pypdf is not None,
        "pytesseract_available": pytesseract is not None,
    }


def extract_text_from_pdf(content: bytes) -> tuple[str, str]:
    """
    Extracts selectable text from PDF.
    Returns (extracted_text, engine_used).
    """
    text_parts = []
    # Try PyMuPDF first
    if fitz:
        try:
            doc = fitz.open(stream=content, filetype="pdf")
            for page in doc:
                text_parts.append(page.get_text() or "")
            joined = "\n".join(text_parts).strip()
            if joined:
                return joined, "pymupdf_text"
        except Exception:
            pass

    # Fallback to pypdf
    if pypdf:
        try:
            reader = pypdf.PdfReader(io.BytesIO(content))
            for page in reader.pages:
                text_parts.append(page.extract_text() or "")
            joined = "\n".join(text_parts).strip()
            if joined:
                return joined, "pypdf_text"
        except Exception:
            pass

    return "", "none"


def extract_text_from_image_bytes(content: bytes) -> tuple[str, str]:
    """Extracts text from image bytes using pytesseract if binary is available."""
    tess_cmd = find_tesseract_binary()
    if not tess_cmd or not pytesseract:
        return "", "ocr_unavailable"

    pytesseract.pytesseract.tesseract_cmd = tess_cmd
    try:
        image = Image.open(io.BytesIO(content))
        text = pytesseract.image_to_string(image)
        return text.strip(), "tesseract_ocr"
    except Exception as e:
        return "", f"ocr_error: {str(e)}"


def extract_text_from_scanned_pdf(content: bytes) -> tuple[str, str]:
    """Renders PDF pages to images and runs OCR if tesseract is available."""
    tess_cmd = find_tesseract_binary()
    if not tess_cmd or not pytesseract or not fitz:
        return "", "ocr_unavailable"

    pytesseract.pytesseract.tesseract_cmd = tess_cmd
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        page_texts = []
        # Process up to 3 pages to avoid excessive OCR timeouts
        for i, page in enumerate(doc):
            if i >= 3:
                break
            pix = page.get_pixmap(dpi=150)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            page_text = pytesseract.image_to_string(img)
            page_texts.append(page_text)
        return "\n".join(page_texts).strip(), "pymupdf_tesseract_ocr"
    except Exception as e:
        return "", f"ocr_error: {str(e)}"


def parse_billing_period(text: str) -> tuple[str | None, str | None]:
    """
    Attempts to identify the billing period (YYYY-MM).
    Returns (period, evidence_snippet).
    """
    lines = text.splitlines()

    # Pattern 1: ISO, standard or slash dates
    period_patterns = [
        (r"(?:bill(?:ing)?\s*(?:period|month|cycle|date)?|period)\s*[:=-]?\s*(\d{4})[-/](0[1-9]|1[0-2])", "ym"),
        (r"(?:bill(?:ing)?\s*(?:period|month|cycle|date)?|period)\s*[:=-]?\s*(0[1-9]|1[0-2])[-/](\d{4})", "my"),
        (r"(?:bill(?:ing)?\s*(?:period|month|cycle)?)\s*[:=-]?\s*([A-Za-z]{3,9})[,\s-]+(\d{4})", "word_m_y"),
        (r"(?:bill(?:ing)?\s*(?:period|month|cycle|date)?|period)\s*[:=-]?\s*([0-3]?\d)[-/](0[1-9]|1[0-2])[-/](\d{4})", "dmy"),
    ]

    months_map = {
        "jan": "01", "feb": "02", "mar": "03", "apr": "04", "may": "05", "jun": "06",
        "jul": "07", "aug": "08", "sep": "09", "oct": "10", "nov": "11", "dec": "12",
        "january": "01", "february": "02", "march": "03", "april": "04", "june": "06",
        "july": "07", "august": "08", "september": "09", "october": "10",
        "november": "11", "december": "12",
    }

    for line in lines:
        clean = line.strip()
        if not clean:
            continue
        for pat, kind in period_patterns:
            m = re.search(pat, clean, re.IGNORECASE)
            if m:
                if kind == "ym":
                    return f"{m.group(1)}-{m.group(2)}", clean
                elif kind == "my":
                    return f"{m.group(2)}-{m.group(1)}", clean
                elif kind == "word_m_y":
                    mon_str = m.group(1).lower()
                    if mon_str in months_map:
                        return f"{m.group(2)}-{months_map[mon_str]}", clean
                elif kind == "dmy":
                    return f"{m.group(3)}-{m.group(2)}", clean

    # Also search for standalone month names with year in the header
    for line in lines[:15]:
        m = re.search(r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d\d)\b", line, re.IGNORECASE)
        if m:
            mon_str = m.group(1).lower()
            if mon_str in months_map:
                return f"{m.group(2)}-{months_map[mon_str]}", line.strip()

    return None, None


def parse_electricity_consumption(text: str) -> dict[str, Any]:
    """
    Extracts electricity consumption in kWh from extracted text.
    Carefully discriminates between consumption, meter IDs, money amounts, dates, and load.
    """
    lines = text.splitlines()
    candidates: list[dict[str, Any]] = []

    # Regex patterns targeting consumption specifically
    direct_patterns = [
        # Units Consumed: 350.00
        (r"(?:total\s*)?(?:units|energy|consumption)\s*(?:consumed|billed|used)?\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:kwh|units)?", 0.95),
        # Billed Units: 350
        (r"(?:billed\s*units|units\s*billed|billed\s*kwh|kwh\s*billed)\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)\s*", 0.95),
        # Active Energy / KWH: 350
        (r"(?:active\s*energy|net\s*consumption)\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:kwh)?", 0.90),
        # 350 kWh or 350 Units
        (r"\b([0-9]{1,6}(?:\.[0-9]{1,2})?)\s*(?:kwh|units)\b", 0.70),
    ]

    # Negative indicator keywords to reject lines containing amounts, account IDs, phone numbers, tariffs
    reject_keywords = ["rs.", "rs ", "₹", "inr", "$", "amount", "payable", "phone", "account", "ca no", "meter no", "tariff", "rate/unit", "sanctioned load", "contract demand", "kva", "hsn", "gstin"]

    for idx, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            continue
        line_lower = line.lower()

        # Check for reading difference pattern: Current Reading: X, Previous Reading: Y
        reading_diff_match = re.search(
            r"(?:current|present|new)\s*(?:reading)?\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?).*?(?:previous|old|past)\s*(?:reading)?\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)",
            line,
            re.IGNORECASE,
        )
        if reading_diff_match:
            try:
                curr_val = float(reading_diff_match.group(1))
                prev_val = float(reading_diff_match.group(2))
                diff = curr_val - prev_val
                if 0 < diff < 100000:
                    candidates.append({
                        "value": round(diff, 2),
                        "confidence": 0.92,
                        "evidence": f"Calculated from readings: {curr_val} - {prev_val} = {diff} kWh in '{line}'",
                        "line_number": idx + 1,
                    })
            except ValueError:
                pass

        for pattern, base_conf in direct_patterns:
            for match in re.finditer(pattern, line, re.IGNORECASE):
                val_str = match.group(1)
                try:
                    val = float(val_str)
                except ValueError:
                    continue

                # Plausible monthly residential/commercial consumption check
                if val <= 0 or val > 1_000_000:
                    continue

                # Lower confidence if line contains price/currency/ID keywords
                conf = base_conf
                if any(k in line_lower for k in reject_keywords):
                    conf -= 0.35

                # Boost confidence if explicitly labeled kWh or units consumed
                if "kwh" in line_lower or "units consumed" in line_lower or "billed units" in line_lower:
                    conf = min(1.0, conf + 0.15)

                if conf > 0.40:
                    candidates.append({
                        "value": val,
                        "confidence": round(conf, 2),
                        "evidence": line,
                        "line_number": idx + 1,
                    })

    # Sort candidates by confidence descending
    candidates.sort(key=lambda x: (x["confidence"], x["value"]), reverse=True)

    if not candidates:
        return {
            "consumption_kwh": None,
            "confidence": 0.0,
            "evidence": [],
            "requires_confirmation": True,
            "candidates": [],
        }

    best = candidates[0]
    ambiguous = len(candidates) > 1 and (candidates[1]["confidence"] >= 0.80 and abs(candidates[1]["value"] - best["value"]) > 0.1)

    return {
        "consumption_kwh": best["value"],
        "confidence": best["confidence"],
        "evidence": [c["evidence"] for c in candidates[:3]],
        "requires_confirmation": best["confidence"] < 0.85 or ambiguous,
        "candidates": candidates[:5],
    }


def analyze_bill_document(filename: str, content: bytes) -> dict[str, Any]:
    """
    Main pipeline to analyze an electricity bill (PDF or image).
    Extracts selectable text or runs OCR, detects consumption and billing period,
    and returns a structured, explainable response.
    """
    ext = Path(filename).suffix.lower()
    supported_extensions = {".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp"}
    if ext not in supported_extensions:
        return {
            "status": "error",
            "message": f"Unsupported file type '{ext}'. Please upload a PDF, JPG, PNG, TIFF, or BMP bill.",
            "extracted_consumption": None,
            "billing_period": None,
            "evidence": [],
            "requires_confirmation": True,
        }

    raw_text = ""
    engine_used = "none"

    if ext == ".pdf":
        raw_text, engine_used = extract_text_from_pdf(content)
        # If no selectable text, attempt scanned PDF OCR if tesseract is available
        if not raw_text.strip():
            raw_text, engine_used = extract_text_from_scanned_pdf(content)
    else:
        raw_text, engine_used = extract_text_from_image_bytes(content)

    if not raw_text.strip():
        ocr_info = get_ocr_engine_info()
        if not ocr_info["tesseract_installed"]:
            return {
                "status": "ocr_unavailable",
                "message": (
                    "Could not extract selectable text from this document, and the Tesseract OCR "
                    "binary is not installed on the system. You can verify or manually enter your electricity consumption below."
                ),
                "extracted_consumption": None,
                "unit": "kWh",
                "billing_period": datetime.now().strftime("%Y-%m"),
                "confidence": 0.0,
                "evidence": [],
                "engine_used": engine_used,
                "requires_confirmation": True,
                "tesseract_installed": False,
            }
        return {
            "status": "empty_text",
            "message": "No readable text could be recognized from the uploaded bill document.",
            "extracted_consumption": None,
            "unit": "kWh",
            "billing_period": datetime.now().strftime("%Y-%m"),
            "confidence": 0.0,
            "evidence": [],
            "engine_used": engine_used,
            "requires_confirmation": True,
            "tesseract_installed": True,
        }

    # Parse consumption and billing period from extracted text
    consumption_res = parse_electricity_consumption(raw_text)
    period, period_evidence = parse_billing_period(raw_text)

    evidence_list = consumption_res.get("evidence", [])
    if period_evidence and period_evidence not in evidence_list:
        evidence_list.append(f"Billing period match: {period_evidence}")

    return {
        "status": "success" if consumption_res["consumption_kwh"] is not None else "partial",
        "message": (
            "Electricity consumption extracted successfully."
            if consumption_res["consumption_kwh"] is not None
            else "Could not unambiguously detect kWh consumption. Please confirm manually."
        ),
        "extracted_consumption": consumption_res["consumption_kwh"],
        "unit": "kWh",
        "billing_period": period or datetime.now().strftime("%Y-%m"),
        "confidence": consumption_res["confidence"],
        "evidence": evidence_list,
        "engine_used": engine_used,
        "requires_confirmation": consumption_res["requires_confirmation"],
        "raw_text_snippet": raw_text[:300].strip(),
    }
