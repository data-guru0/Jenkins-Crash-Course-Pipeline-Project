# Jenkins and AWS App Runner Deployment Documentation

This document outlines the complete, step-by-step procedure to upgrade your existing Dockerized Jenkins instance and construct a CI/CD pipeline that automatically builds and deploys your Travel Agent application to AWS App Runner.

## Phase 1: Upgrading Your Existing Jenkins Container

Since you already have Jenkins running as a Docker container, we will execute directly into your running container as the `root` user to install the necessary Docker CLI and AWS CLI tools. This avoids needing to reinstall Jenkins or mess with plugins.

### 1. Access the Container as Root
SSH into your EC2 host machine where Jenkins is running. Find your Jenkins container ID or name:
```bash
sudo docker ps
```
Assuming your container is named `jenkins` (replace if different), open an interactive root shell inside it:
```bash
sudo docker exec -u root -it jenkins /bin/bash
```

### 2. Install Docker CLI and Utilities
Now that you are inside your running Jenkins container as root, update the package list and install the Docker backend tools:
```bash
apt-get update -y
apt-get install -y unzip curl
```

### 3. Install AWS CLI
You are still inside the container shell. Run the following to inject AWS CLI capabilities:
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install
rm -rf awscliv2.zip aws
```

### 4. Exit and Bind the Docker Socket
Leave the container's root shell to return to your EC2 environment:
```bash
exit
```

## Phase 2: Storing Required Credentials Step-by-Step

Jenkins needs to authenticate with GitHub (to pull code) and AWS (to push Docker images to ECR and deploy to App Runner).

### 1. Install AWS Plugins
1. Open your Jenkins Dashboard at `http://<EC2-PUBLIC-IP>:8080`.
2. Go to Manage Jenkins -> Plugins -> Available plugins.
3. Search for and install **CloudBees AWS Credentials** and **Pipeline: AWS Steps**.
4. Select "Install without restart".

### 2. AWS Credentials
1. In AWS Console, go to IAM -> Users -> Create User (e.g., `jenkins-deployer`).
2. Attach policies: `AmazonEC2ContainerRegistryPowerUser` and `AWSAppRunnerFullAccess`.
3. Create an Access Key for this user and save the Access Key ID and Secret Access Key.
4. In Jenkins, go to Dashboard -> Manage Jenkins -> Credentials -> System -> Global credentials.
5. Click "Add Credentials".
   - Kind: select **AWS Credentials**
   - ID: `aws-credentials`
   - Access Key ID: Paste your AWS Access Key ID
   - Secret Access Key: Paste your AWS Secret Access Key

### 2. GitHub Credentials
1. Go to your GitHub account settings -> Developer Settings -> Personal Access Tokens -> Tokens (classic) -> Generate New Token.
2. Grant it `repo` scope.
3. In Jenkins, go to Manage Jenkins -> Credentials -> Global credentials -> Add Credentials.
   - Kind: Username with password
   - Username: Your GitHub Username
   - Password: The Personal Access Token
   - ID: `github-credentials`

## Phase 3: Setting Up AWS ECR and App Runner

**Important Note:** The AWS ECR Repository and the AWS App Runner service are NOT automatically created by the Jenkins pipeline. You must manually create them ONE TIME in the AWS Console. Once created, Jenkins will automatically update them with new code moving forward.

### 1. Create the ECR Repository (Manual Step)
This is where your Docker images will be stored securely.
1. Open the AWS Management Console and search for **Elastic Container Registry**.
2. On the left pane, click **Repositories** and then click the orange **Create repository** button.
3. **Visibility settings:** Choose **Private**.
4. **Repository name:** Type `travel-agent-app` exactly as written.
5. Scroll to the bottom and click **Create repository**.
6. Once created, click on the repository name `travel-agent-app`.
7. Look at the "URI" at the top right. It will look like `123456789012.dkr.ecr.us-east-1.amazonaws.com/travel-agent-app`. 
   - Note down the **AWS Account ID** (the 12 digit number at the start).
   - Note down the **Region** (e.g., `us-east-1`).
   - You must update your `Jenkinsfile` with these exact values!

### 2. Create the App Runner Service (Manual Step)
This is the serverless environment that runs your application and provides a public URL.

*Note: Before doing this step, run your Jenkins pipeline at least ONCE so that an initial Docker image is uploaded into your ECR repository. App Runner needs an existing image to launch.*

1. Open the AWS Management Console and search for **AWS App Runner**.
2. Click **Create an App Runner service**.
3. **Repository type:** Select **Container registry**.
4. **Provider:** Select **Amazon ECR**.
5. **Container image URI:** Click **Browse** and select the `travel-agent-app` repository and choose the `latest` image tag.
6. **Deployment settings:** Select **Automatic** (This is the magic step! It means whenever Jenkins pushes a new image to ECR, App Runner will detect it and update your website automatically).
7. Under **ECR access role**, choose **Create new service role**.
8. Click **Next**.
9. **Service name:** Type `travel-agent-service`.
10. **Virtual CPU & memory:** Leave as default (1 vCPU, 2 GB).
11. **Port:** Enter `8501`.
12. Expand the **Environment variables** section and click **Add variable** twice:
    - Key: `OPENAI_API_KEY` | Value: (Paste your OpenAI Key)
    - Key: `TAVILY_API_KEY`   | Value: (Paste your Tavily Key)
13. Scroll down and click **Next**, then click **Create & deploy**.

Wait about 5-10 minutes. Once it says "Running", AWS will provide a Default domain URL. Click it to view your live application!

## Phase 4: Constructing the Pipeline

Create a new Pipeline job in Jenkins that connects to your GitHub repo and executes the `Jenkinsfile` you committed.
1. Dashboard -> New Item -> Name it `travel-agent-deployment` -> Select "Pipeline".
2. In the Pipeline section, select "Pipeline script from SCM".
3. SCM: Git -> Provide your GitHub repo URL.
4. Credentials: Select `github-credentials`.
5. Script Path: `Jenkinsfile`.
6. Click Save and click **Build Now**.
