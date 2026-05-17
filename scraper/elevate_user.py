import os
import argparse
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from the root .env.local
# (Since the script is in scraper/, we point to ../.env.local)
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
load_dotenv(dotenv_path)

url: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local")
    exit(1)

supabase: Client = create_client(url, key)

def elevate_user(email: str):
    print(f"Looking up user by email: {email}...")
    
    # Supabase Admin API to get user by email is only available via the admin client
    # Actually, we can just query the auth.users table via an RPC, but we don't have one.
    # The python client supabase.auth.admin.list_users() is available using service_role!
    
    try:
        # Fetch all users (works for small scale)
        response = supabase.auth.admin.list_users()
        users = response.users
        
        target_user = None
        for u in users:
            if u.email == email:
                target_user = u
                break
        
        if not target_user:
            print(f"User with email {email} not found in Supabase Auth.")
            return

        print(f"Found user! ID: {target_user.id}")
        print("Elevating role to 'admin' in public.profiles...")
        
        update_resp = supabase.table('profiles').update({'role': 'admin'}).eq('id', target_user.id).execute()
        
        if update_resp.data:
            print("Successfully elevated user to ADMIN!")
        else:
            print("Failed to update profile. Does the profile exist?")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Elevate a DTL user to Admin")
    parser.add_argument("email", help="The email address of the user to elevate")
    args = parser.parse_args()
    
    elevate_user(args.email)
