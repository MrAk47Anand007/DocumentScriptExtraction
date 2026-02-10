import pdfplumber
import re

def extract_text_from_pdf(pdf_path):
    """
    Extracts all text from a PDF file.
    """
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
    except Exception as e:
        print(f"Error reading PDF: {e}")
        raise e
    return text

def apply_rules(text, rules):
    """
    Applies regex rules to the extracted text.
    """
    extracted_data = {}
    
    for rule in rules:
        field_name = rule.get('field_name')
        pattern = rule.get('regex')
        
        if not field_name or not pattern:
            continue
            
        try:
            matches = re.findall(pattern, text, re.MULTILINE | re.IGNORECASE)
            # Default behavior: take the first match or all depending on requirement
            # Here we just take the first match for simplicity, or a list if multiple expected
            if matches:
                if len(matches) == 1:
                    extracted_data[field_name] = matches[0]
                else:
                    extracted_data[field_name] = matches
            else:
                extracted_data[field_name] = None
        except re.error:
            extracted_data[field_name] = "Invalid Regex"
            
    return extracted_data
