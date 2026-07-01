# HookShield: Complete Production Deployment Guide

This guide will walk you through deploying HookShield to a live production environment. Follow every step carefully to get your app running securely on the internet.

---

## Step 1: Rent a Virtual Private Server (VPS)
Since HookShield is containerized using Docker, you need a Linux server to run it.

1. Go to [DigitalOcean.com](https://www.digitalocean.com/) (or Linode / AWS).
2. Create an account and click **Create a Droplet**.
3. Choose **Ubuntu 22.04 (LTS)** as your operating system.
4. Choose the **Basic Plan** (a $5 to $10/month plan is perfect to start).
5. Choose a datacenter region closest to where your users are.
6. Under Authentication, select **Password** and create a strong password (save this, you will need it).
7. Click **Create Droplet**. Wait 1-2 minutes for it to boot. You will be given an **IP Address** (e.g., `142.25.12.99`).

---

## Step 2: Get a Domain Name (Optional but Recommended)
To allow users to visit `yourwebsite.com` instead of an IP address:

1. Go to [Namecheap.com](https://www.namecheap.com/) or GoDaddy and buy a domain name.
2. Go to your domain's **DNS Management** page.
3. Add a new **"A Record"**:
   - **Host/Name:** `@`
   - **Value/Target:** Paste the **IP Address** of your DigitalOcean droplet from Step 1.
   - **TTL:** Automatic or 30 minutes.

---

## Step 3: Generate Your Real API Keys
Your application needs credentials to send emails and authenticate users securely.

### 3A. Gmail App Password (For Password Resets)
You cannot use your standard Gmail password. You must generate an App Password.
1. Go to your Google Account Settings -> **Security**.
2. Make sure **2-Step Verification** is turned ON.
3. Search for **App Passwords** in the settings search bar.
4. Create a new App Password named "HookShield".
5. Google will give you a 16-character password (e.g., `abcd efgh ijkl mnop`). Save this.

### 3B. Google OAuth Client ID (For Google Login)
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click "Select a Project" -> **New Project** (Name it "HookShield").
3. Go to **APIs & Services** -> **Credentials**.
4. Click **Create Credentials** -> **OAuth Client ID**.
5. Set Application Type to **Web Application**.
6. Under "Authorized redirect URIs", add: `http://<your-droplet-ip>:8000/api/oauth/callback/google` (replace with your domain if you bought one).
7. Copy the **Client ID** and **Client Secret**.

### 3C. GitHub OAuth Client ID (For GitHub Login)
1. Go to GitHub.com -> Settings -> **Developer Settings** (at the very bottom).
2. Click **OAuth Apps** -> **New OAuth App**.
3. Set the "Homepage URL" to your droplet's IP address or domain.
4. Set the "Authorization callback URL" to: `http://<your-droplet-ip>:8000/api/oauth/callback/github`.
5. Click **Register Application**. Copy the **Client ID** and generate a **Client Secret**.

---

## Step 4: Prepare the Server
Now, you will log into your server and install Docker.

1. Open a terminal (Command Prompt or PowerShell) on your personal computer.
2. Type: `ssh root@<your-droplet-ip>` and hit Enter.
3. Type `yes` when prompted, and enter the Droplet password you created in Step 1.
4. Run the following command to install Docker and Docker-Compose:
   ```bash
   apt update && apt install docker.io docker-compose -y
   ```

---

## Step 5: Upload Your Code and Deploy
1. Upload your code to a private GitHub repository.
2. On your VPS terminal, clone the repository:
   ```bash
   git clone https://github.com/your-username/hookshield.git
   cd hookshield
   ```
3. Copy the `.env.example` file to create your actual production environment file:
   ```bash
   cp .env.example .env.production
   ```
4. Open the file to edit it:
   ```bash
   nano .env.production
   ```
5. Fill in the file with your actual values:
   - `JWT_SECRET`: Enter a random long string of text.
   - `SMTP_USER`: Your Gmail address.
   - `SMTP_PASSWORD`: The 16-character App Password from Step 3A.
   - `GOOGLE_CLIENT_ID` / `GITHUB_CLIENT_ID`: The IDs you got in Steps 3B and 3C.
6. Press `Ctrl + X`, then `Y`, then `Enter` to save and exit.
7. Finally, start the application!
   ```bash
   docker-compose --env-file .env.production up -d --build
   ```

**Congratulations!** 
HookShield is now running on your server. Visit your Droplet's IP address (or your domain name) in your browser to see your live application.
