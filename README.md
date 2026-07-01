# 🛡️ HookShield

**HookShield** is an enterprise-grade Webhook Proxy and Exponential Retry Engine. 

It acts as a secure, intermediate buffer between third-party services (like Stripe, GitHub, or Shopify) and your internal servers. If your server goes down, HookShield catches the webhook, securely stores the payload, and automatically retries the delivery using an exponential backoff strategy until your system recovers.

---

## ✨ Core Features

*   **🔄 Smart Webhook Proxy:** Issue unique proxy URLs to third-party services. HookShield receives the payloads instantly and forwards them to your actual destination.
*   **🚨 Automatic Retries & Incident Board:** If your destination server is unreachable (returns 500+ errors), HookShield automatically queues the payload. Failed deliveries populate a Kanban-style Incident Board where you can manually review and replay them.
*   **📜 Live Event Logs:** A real-time, virtualized table of all incoming webhooks, complete with HTTP headers, JSON payload inspection, latency tracking, and status codes.
*   **📊 Analytics Dashboard:** Monitor your system's health with total volume metrics, success/failure rates, and average latency visualizations.
*   **🗺️ Project Roadmaps:** Keep track of internal development milestones, custom fields, and severity levels.
*   **🔒 Secure Authentication:** Built-in JWT authentication with email/password logic, plus drop-in support for Google and GitHub OAuth.

---

## 📐 System Architecture

HookShield is designed with a decoupled architecture for maximum scalability and reliability.

```mermaid
graph TD
    %% Entities
    ThirdParty[Third-Party Services\nStripe, GitHub, etc.]
    Destination[Your Internal Server\nDestination API]
    
    %% Infrastructure
    subgraph HookShield Infrastructure
        Nginx[Nginx Reverse Proxy]
        Frontend[Next.js 15 Frontend\nReact App]
        Backend[FastAPI Backend\nPython API]
        DB[(PostgreSQL\nDatabase)]
    end

    %% Data Flow
    ThirdParty -- "1. Sends Webhook (POST)" --> Nginx
    Nginx -- "2. Routes API Traffic" --> Backend
    Nginx -- "Serves UI" --> Frontend
    Frontend -- "Fetches Data (REST)" --> Backend
    Backend -- "3. Stores Payload" --> DB
    Backend -- "4. Forwards Webhook" --> Destination
    Destination -- "5. Fails (500 Error)" --> Backend
    Backend -- "6. Queues for Retry" --> DB
```

### Architecture Breakdown
1. **Nginx Reverse Proxy:** Acts as the gateway, routing traffic to the Next.js frontend (UI) or FastAPI backend (`/api/*`).
2. **Next.js (App Router) Frontend:** A heavily stylized, dark-themed React application providing the dashboards, live logs, and incident management interfaces.
3. **FastAPI Backend:** A highly concurrent Python server responsible for instantly accepting payloads, logging them, and acting as the HTTP client that forwards requests to your internal infrastructure.
4. **PostgreSQL Database:** The persistent storage layer that holds user accounts, project configurations, webhook endpoints, and the historical event logs/failed delivery queues.

---

## 📖 User Guide: How to Use HookShield

Follow these steps to seamlessly integrate HookShield into your webhook flow:

### 1. Create a Project & Endpoint
* Log in to the HookShield dashboard.
* Click on **"Create Project"** (e.g., "Payment Processing").
* Inside the project, click **"Add Endpoint"**. You will be asked for the **Destination URL** (the URL on *your* server that actually processes the webhook).
* HookShield will instantly generate a **Proxy URL** for you.

### 2. Configure Your Third-Party Provider
* Go to the third-party service (e.g., your Stripe Developer Dashboard).
* Paste the **HookShield Proxy URL** into their webhook configuration field. 
* *Result: Stripe will now send webhooks to HookShield, and HookShield will instantly forward them to your server.*

### 3. Monitor Traffic (Analytics & Live Logs)
* Navigate to the **Live Event Logs** tab. As third-party services trigger webhooks, you will see them appear here in real-time. 
* You can click on any log to inspect the exact JSON payload, headers, and response latency.
* The **Analytics** tab will generate visualizations showing traffic spikes and success/failure ratios over time.

### 4. Manage Failures (Incident Board)
* If your destination server crashes or returns an error, HookShield catches the failure.
* Navigate to the **Incident Board**. You will see Kanban-style cards for every failed webhook delivery.
* HookShield will automatically begin retrying the delivery in the background using an exponential backoff.
* You can manually click **"Replay"** on any card to force an immediate retry once you know your server is back online.

---

## 🛠️ Technology Stack

*   **Frontend:** Next.js 15 (App Router), React, Tailwind CSS, Lucide Icons, Recharts (for analytics).
*   **Backend:** FastAPI (Python), SQLAlchemy (AsyncORM), Alembic (Migrations), Uvicorn/Gunicorn.
*   **Database:** PostgreSQL (Production) / SQLite (Local Development).
*   **Infrastructure:** Docker, Docker Compose, Nginx.

---

## 🚀 Local Development (Quick Start)

To run the application on your personal computer for development and testing:

### 1. Backend Setup (FastAPI)
Open a terminal in the project root and run:
```bash
cd backend
python -m venv venv
venv\Scripts\activate      # On Windows
# source venv/bin/activate # On Mac/Linux
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload --port 8000
```
*The API will be available at http://localhost:8000/docs*

### 2. Frontend Setup (Next.js)
Open a **new** terminal in the project root and run:
```bash
cd frontend
npm install

# Start the dev server
npm run dev
```
*The UI will be available at http://localhost:3000*

---

## 🌍 Production Deployment

HookShield is fully containerized and ready for production deployment using Docker. 

A comprehensive, step-by-step PDF/Markdown guide on how to rent a server, link a domain name, configure OAuth keys, and deploy the application can be found in the root directory: 
👉 **[HookShield_Deployment_Guide.md](./HookShield_Deployment_Guide.md)**

### TL;DR Deploy Command:
```bash
cp .env.example .env.production
# Edit .env.production with your real API keys/Database credentials
docker-compose --env-file .env.production up -d --build
```
