import os
import paramiko
from stat import S_ISDIR

HOST = '10.50.50.201'
USER = 'badmin'
REMOTE_DIR = '/home/badmin/dtl-scraper'
LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))

def sftp_put_dir(sftp, local_dir, remote_dir):
    try:
        sftp.mkdir(remote_dir)
    except IOError:
        pass

    for item in os.listdir(local_dir):
        # Skip node_modules, .git, etc if present
        if item in ['.git', '__pycache__', '.env', 'deploy.py', 'venv', 'node_modules', 'data']:
            continue
        
        local_path = os.path.join(local_dir, item)
        remote_path = remote_dir + '/' + item

        if os.path.isfile(local_path):
            print(f"Uploading {item}...")
            sftp.put(local_path, remote_path)
        elif os.path.isdir(local_path):
            sftp_put_dir(sftp, local_path, remote_path)

if __name__ == '__main__':
    print(f"Deploying scraper to {USER}@{HOST}:{REMOTE_DIR}...")
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER)
    
    sftp = ssh.open_sftp()
    
    # Upload files
    sftp_put_dir(sftp, LOCAL_DIR, REMOTE_DIR)
    
    # Also attempt to upload .env manually if it exists locally
    env_path = os.path.join(LOCAL_DIR, '.env')
    if os.path.exists(env_path):
        print("Uploading .env...")
        sftp.put(env_path, REMOTE_DIR + '/.env')

    print("Building Docker image...")
    stdin, stdout, stderr = ssh.exec_command(f'cd {REMOTE_DIR} && docker compose up -d --build')
    
    # Print the output of docker compose
    for line in iter(stdout.readline, ""):
        try:
            print(line, end="")
        except UnicodeEncodeError:
            print(line.encode('ascii', 'replace').decode('ascii'), end="")
            
    for line in iter(stderr.readline, ""):
        try:
            print(line, end="")
        except UnicodeEncodeError:
            print(line.encode('ascii', 'replace').decode('ascii'), end="")

    sftp.close()
    ssh.close()
    print("Deployment complete.")
