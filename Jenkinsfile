pipeline {
    agent any

    environment {
        AWS_REGION = 'us-east-1'
        AWS_ACCOUNT_ID = 'YOUR_AWS_ACCOUNT_ID'
        ECR_REPO_NAME = 'travel-agent-app'
        IMAGE_TAG = "${env.BUILD_NUMBER}"
        ECR_REGISTRY = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        IMAGE_URI = "${ECR_REGISTRY}/${ECR_REPO_NAME}:${IMAGE_TAG}"
        LATEST_URI = "${ECR_REGISTRY}/${ECR_REPO_NAME}:latest"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                sh "docker build -t ${ECR_REPO_NAME}:${IMAGE_TAG} ."
            }
        }

        stage('Push to ECR') {
            steps {
                withAWS(credentials: 'aws-credentials', region: "${AWS_REGION}") {
                    sh "aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}"
                    sh "docker tag ${ECR_REPO_NAME}:${IMAGE_TAG} ${IMAGE_URI}"
                    sh "docker tag ${ECR_REPO_NAME}:${IMAGE_TAG} ${LATEST_URI}"
                    sh "docker push ${IMAGE_URI}"
                    sh "docker push ${LATEST_URI}"
                }
            }
        }
    }

    post {
        always {
            sh "docker rmi ${ECR_REPO_NAME}:${IMAGE_TAG} || true"
            sh "docker rmi ${IMAGE_URI} || true"
            sh "docker rmi ${LATEST_URI} || true"
        }
    }
}
