# Travel Agent AI — Production Deployment Documentation

## Overview

This document covers everything you need to deploy the **Travel Agent AI** application — a Flask-based, LangGraph-powered travel assistant — to **AWS ECS Fargate** via an automated Jenkins CI/CD pipeline.

The Jenkins pipeline handles **everything automatically**:
- Creates the ECR repository (if it does not exist)
- Creates the ECS cluster, security group, and IAM execution role (if they do not exist)
- Builds and pushes the Docker image
- Registers the ECS task definition (with CloudWatch logging)
- Creates or updates the ECS Fargate service
- Waits for deployment stability and prints the public URL

**You only need to do three one-time manual steps: install Jenkins tools, and save 3 credentials.**

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Web Framework | Flask + Gunicorn |
| AI Agent | LangGraph + LangChain (OpenAI GPT-4o-mini) |
| Web Search | Tavily Search API |
| Container | Docker |
| Registry | AWS ECR |
| Compute | AWS ECS Fargate |
| Logs | AWS CloudWatch |
| CI/CD | Jenkins |

---

## Phase 1: Upgrading Your Existing Jenkins Container

Since you already have Jenkins running as a Docker container, execute directly into it as `root` to install the necessary tools.

### 1. Access the Container as Root

SSH into your EC2 host machine where Jenkins is running. Find your Jenkins container ID or name:

```bash
sudo docker ps
```

Open an interactive root shell inside it (replace `jenkins` with your container name if different):

```bash
sudo docker exec -u root -it jenkins /bin/bash
```

### 2. Install Docker CLI and Utilities

Inside the container shell, run:

```bash
apt-get update -y
apt-get install -y unzip curl apt-transport-https ca-certificates gnupg lsb-release
```

### 3. Install AWS CLI

Still inside the container shell:

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install
rm -rf awscliv2.zip aws
aws --version
```

### 4. Exit the Container Shell

```bash
exit
```

---

## Phase 2: Storing Required Credentials in Jenkins

The pipeline needs **three credentials**. All are stored in Jenkins — nothing is hardcoded.

### 1. Install Required Jenkins Plugins

1. Open your Jenkins Dashboard at `http://<EC2-PUBLIC-IP>:8080`
2. Go to **Manage Jenkins → Plugins → Available plugins**
3. Search for and install:
   - **CloudBees AWS Credentials**
   - **Pipeline: AWS Steps**
4. Click **Install without restart**

### 2. Add AWS Credentials (IAM Admin User)

1. In Jenkins, go to **Dashboard → Manage Jenkins → Credentials → System → Global credentials**
2. Click **Add Credentials**
   - **Kind:** AWS Credentials
   - **ID:** `aws-credentials`
   - **Access Key ID:** Paste your IAM user's Access Key ID
   - **Secret Access Key:** Paste your IAM user's Secret Access Key
3. Click **Create**

> **Note:** The IAM user you provide will be used to create ECR repositories, ECS clusters, register task definitions, create security groups, and manage IAM roles — admin permissions cover all of this.

### 3. Add OpenAI API Key

1. Go to **Dashboard → Manage Jenkins → Credentials → System → Global credentials**
2. Click **Add Credentials**
   - **Kind:** Secret text
   - **ID:** `openai-api-key`
   - **Secret:** Paste your OpenAI API key (`sk-...`)
3. Click **Create**

### 4. Add Tavily API Key

1. Go to **Dashboard → Manage Jenkins → Credentials → System → Global credentials**
2. Click **Add Credentials**
   - **Kind:** Secret text
   - **ID:** `tavily-api-key`
   - **Secret:** Paste your Tavily API key (`tvly-...`)
3. Click **Create**

---

## Phase 3: Configure the Jenkinsfile Variables

Open the `Jenkinsfile` at the top of this repository and verify or update these variables to match your AWS account:

```groovy
AWS_REGION     = 'us-east-1'          // Your AWS region
AWS_ACCOUNT_ID = '789438508565'        // Your 12-digit AWS Account ID
ECR_REPO_NAME  = 'travel-agent-app'   // ECR repository name (created automatically)
ECS_CLUSTER    = 'travel-agent-cluster' // ECS cluster name (created automatically)
ECS_SERVICE    = 'travel-agent-service' // ECS service name (created automatically)
```

All AWS resources are created **automatically** by the pipeline. You do not need to touch the AWS Console.

---

## Phase 4: Create the Jenkins Pipeline Job

1. In Jenkins, click **Dashboard → New Item**
2. Name it `travel-agent-deployment` and select **Pipeline**
3. Click **OK**
4. Scroll to the **Pipeline** section
5. Set **Definition** to `Pipeline script from SCM`
6. Set **SCM** to `Git`
7. Enter your GitHub repository URL
8. Under **Credentials**, select your GitHub credentials (create them the same way as above if needed — Kind: Username with password, Username: your GitHub username, Password: your Personal Access Token)
9. Set **Script Path** to `Jenkinsfile`
10. Click **Save**
11. Click **Build Now**

---

## Phase 5: What the Pipeline Does Automatically

Each time you push to your repository and run the pipeline, it performs these steps in order:

| Stage | What Happens |
|-------|-------------|
| **Checkout** | Pulls latest code from GitHub |
| **Build Docker Image** | Builds the Flask app image tagged with the build number |
| **Push to ECR** | Creates ECR repo if needed, authenticates, pushes versioned + latest tags |
| **Deploy to ECS Fargate** | Creates cluster/SG/role if needed, registers task definition, creates or updates the ECS service with `--force-new-deployment`, waits for stability |
| **Print URL** | Resolves and echoes the public IP of the running Fargate task |
| **Cleanup** | Removes local Docker images to free disk space |

---

## Phase 6: Accessing Your Application

After the pipeline completes successfully, look at the Jenkins build log. At the end you will see:

```
================================================================
 DEPLOYMENT SUCCESSFUL
 Application URL: http://3.94.12.56:5000
================================================================
```

Open that URL in your browser. The application is live.

> **Note:** The public IP changes each time a new task is deployed. For a stable URL, set up an **Application Load Balancer (ALB)** in front of the ECS service. The task definition and service are already configured to support this.

---

## Application Architecture

```
Browser
  │
  ├── GET  /           → Renders templates/index.html (chat UI)
  ├── GET  /health     → Returns {"status": "healthy"} (for ALB health checks)
  └── POST /chat       → Accepts {message, openai_key, tavily_key}
                          Runs LangGraph agent → Tavily search → OpenAI GPT-4o-mini
                          Returns {response}
```

### Project File Structure

```
PIPELINE PROJECT/
├── app.py                   # Flask application (entry point)
├── Dockerfile               # Container definition (Gunicorn, port 5000)
├── Jenkinsfile              # Fully automated CI/CD pipeline
├── requirements.txt         # Python dependencies
├── templates/
│   └── index.html           # Chat UI (dark glassmorphism design)
├── static/
│   ├── css/style.css        # Custom CSS with animations
│   └── js/main.js           # Async chat + send logic
└── src/
    ├── agent/
    │   ├── graph.py         # LangGraph agent graph
    │   ├── state.py         # Agent state definition
    │   └── tools.py         # Tavily search tool
    └── ui/                  # Legacy Streamlit UI (unused)
```

---

## CORS Configuration

CORS is enabled via `flask-cors` for the `/chat` endpoint, allowing cross-origin requests from any origin. This resolves browser CORS errors when the frontend and backend are served from different origins (e.g., during local testing or behind a load balancer).

The CORS configuration in `app.py`:

```python
CORS(app, resources={r"/chat": {"origins": "*"}})
```

To restrict to specific origins in production (recommended), update the origins list:

```python
CORS(app, resources={r"/chat": {"origins": ["https://yourdomain.com"]}})
```

---

## CloudWatch Logs

The ECS task definition is configured to send all container logs to **AWS CloudWatch** under the log group `/ecs/travel-agent-task`. The log group is created automatically.

To view logs:
1. Open the AWS Console → **CloudWatch → Log groups**
2. Find `/ecs/travel-agent-task`
3. Click on the latest log stream

---

## Security Notes

- API keys (`OPENAI_API_KEY`, `TAVILY_API_KEY`) are injected into the ECS task as environment variables from Jenkins credentials — they are **never committed to Git** or stored in plain text
- The security group allows inbound traffic on port `5000` from `0.0.0.0/0`. Restrict this to your IP or ALB security group in production
- The container runs as a non-root user inside the `python:3.11-slim` base image by default
- ECR image scanning is enabled on push via `--image-scanning-configuration scanOnPush=true`

---

## Running Locally (Development)

```bash
# Install dependencies
pip install -r requirements.txt

# Run Flask dev server
python app.py
```

Open `http://localhost:5000` in your browser. Enter your API keys in the sidebar and start chatting.

---

## Troubleshooting

### Task fails to start
- Check CloudWatch logs at `/ecs/travel-agent-task`
- Ensure the `ecsTaskExecutionRole` has the `AmazonECSTaskExecutionRolePolicy` attached

### Pipeline fails at Deploy stage
- Verify three Jenkins credentials exist: `aws-credentials`, `openai-api-key`, `tavily-api-key`
- Confirm the IAM user in `aws-credentials` has admin permissions

### Application shows no response
- Verify both API keys are entered in the UI sidebar
- GPT-4o-mini responses can take 10–30 seconds; the typing indicator will show while waiting

### CORS error in browser console
- The `/chat` endpoint has `Access-Control-Allow-Origin: *` set via flask-cors
- If it persists, check that the request is going to the correct URL (port 5000)
