# scraper/simulate_ig_webhook.py
import requests
import json
import uuid

WEBHOOK_URL = 'http://localhost:3000/api/webhooks/instagram'

def send_mock_payload():
    mock_media_id = f"ig_{uuid.uuid4().hex[:12]}"
    
    payload = {
        "object": "instagram",
        "entry": [
            {
                "id": "0",
                "time": 1715610000,
                "changes": [
                    {
                        "field": "hashtags",
                        "value": {
                            "media_id": mock_media_id,
                            "media_type": "IMAGE",
                            "media_url": "https://images.unsplash.com/photo-1545128485-c400e7702796?w=800&q=80",
                            "caption": "Incredible night out at the London Music Hall! 🎸✨ #DTLNightly #LdnOnt",
                            "username": "london_vibes_99",
                            "permalink": "https://instagram.com"
                        }
                    }
                ]
            }
        ]
    }

    headers = {'Content-Type': 'application/json'}
    
    print(f"Sending mock Instagram webhook payload to {WEBHOOK_URL}...")
    try:
        response = requests.post(WEBHOOK_URL, data=json.dumps(payload), headers=headers)
        if response.status_code == 200:
            print("Success! Next.js parsed the payload and inserted it into Supabase.")
        else:
            print(f"Failed. Status Code: {response.status_code} - {response.text}")
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to localhost:3000. Is your Next.js server running?")

if __name__ == "__main__":
    send_mock_payload()
