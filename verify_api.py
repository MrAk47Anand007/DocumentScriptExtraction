import requests
import uuid

BASE_URL = "http://localhost:5000"

def test_api():
    print("Starting API Verification...")
    
    # 1. Create Template
    print("\n1. Testing Create Template...")
    template_name = f"Test Template {uuid.uuid4().hex[:6]}"
    res = requests.post(f"{BASE_URL}/api/templates", json={"name": template_name})
    if res.status_code == 201:
        template = res.json()
        template_id = template['id']
        print(f"SUCCESS: Created template '{template_name}' (ID: {template_id})")
    else:
        print(f"FAILED: Could not create template. Status: {res.status_code}, Resp: {res.text}")
        return

    # 2. Add Rule to Template
    print("\n2. Testing Create Rule...")
    rule_data = {"field_name": "TestField", "regex": r"Test:\d+"}
    res = requests.post(f"{BASE_URL}/api/templates/{template_id}/rules", json=rule_data)
    if res.status_code == 201:
        rule = res.json()
        rule_id = rule['id']
        print(f"SUCCESS: Created rule '{rule['field_name']}' (ID: {rule_id})")
        
        # Verify Rule attributes
        if rule.get('template_id') == template_id:
             print("SUCCESS: Rule has correct template_id")
        else:
             print(f"FAILED: Rule template_id mismatch: {rule.get('template_id')} != {template_id}")
    else:
        print(f"FAILED: Could not create rule. Status: {res.status_code}, Resp: {res.text}")

    # 3. Fetch Rules for Template
    print("\n3. Testing Fetch Rules...")
    res = requests.get(f"{BASE_URL}/api/templates/{template_id}/rules")
    if res.status_code == 200:
        rules = res.json()
        if len(rules) > 0 and rules[0]['id'] == rule_id:
            print("SUCCESS: Fetched rules correctly.")
        else:
             print("FAILED: Rule not found in fetch list.")
    else:
         print(f"FAILED: Fetch rules failed. Status: {res.status_code}")

    # 4. Delete Template
    print("\n4. Testing Delete Template...")
    res = requests.delete(f"{BASE_URL}/api/templates/{template_id}")
    if res.status_code == 200:
        print("SUCCESS: Deleted template.")
    else:
        print(f"FAILED: Delete template failed. Status: {res.status_code}, Resp: {res.text}")

    # 5. Verify Deletion
    res = requests.get(f"{BASE_URL}/api/templates")
    templates = res.json()
    if not any(t['id'] == template_id for t in templates):
        print("SUCCESS: Template verification confirmed (not found in list).")
    else:
        print("FAILED: Template still exists in list after deletion.")

if __name__ == "__main__":
    try:
        test_api()
    except requests.exceptions.ConnectionError:
        print("ERROR: Connection refused. Is the backend running on localhost:5000?")
