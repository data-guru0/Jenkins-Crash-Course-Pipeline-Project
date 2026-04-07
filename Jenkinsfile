pipeline {
    agent any

    environment {
        AWS_REGION       = 'us-east-1'
        AWS_ACCOUNT_ID   = '789438508565'
        ECR_REPO_NAME    = 'travel-agent-app'
        ECS_CLUSTER      = 'travel-agent-cluster'
        ECS_SERVICE      = 'travel-agent-service'
        TASK_FAMILY      = 'travel-agent-task'
        CONTAINER_NAME   = 'travel-agent'
        APP_PORT         = '5000'
        IMAGE_TAG        = "${env.BUILD_NUMBER}"
        ECR_REGISTRY     = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        IMAGE_URI        = "${ECR_REGISTRY}/${ECR_REPO_NAME}:${IMAGE_TAG}"
        LATEST_URI       = "${ECR_REGISTRY}/${ECR_REPO_NAME}:latest"
        DESIRED_COUNT    = '1'
        TASK_CPU         = '512'
        TASK_MEMORY      = '1024'
    }

    stages {

        // ────────────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        // ────────────────────────────────────────────────────────────
        stage('Build Docker Image') {
            steps {
                sh "docker build -t ${ECR_REPO_NAME}:${IMAGE_TAG} ."
            }
        }

        // ────────────────────────────────────────────────────────────
        stage('Push to ECR') {
            steps {
                withAWS(credentials: 'aws-credentials', region: "${AWS_REGION}") {
                    script {
                        // Create ECR repo if it does not exist (idempotent)
                        sh """
                            aws ecr describe-repositories \
                                --repository-names ${ECR_REPO_NAME} \
                                --region ${AWS_REGION} \
                            || aws ecr create-repository \
                                --repository-name ${ECR_REPO_NAME} \
                                --region ${AWS_REGION} \
                                --image-scanning-configuration scanOnPush=true
                        """

                        // Authenticate Docker to ECR
                        sh """
                            aws ecr get-login-password --region ${AWS_REGION} \
                            | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                        """

                        // Tag and push versioned + latest
                        sh "docker tag ${ECR_REPO_NAME}:${IMAGE_TAG} ${IMAGE_URI}"
                        sh "docker tag ${ECR_REPO_NAME}:${IMAGE_TAG} ${LATEST_URI}"
                        sh "docker push ${IMAGE_URI}"
                        sh "docker push ${LATEST_URI}"
                    }
                }
            }
        }

        // ────────────────────────────────────────────────────────────
        stage('Deploy to ECS Fargate') {
            steps {
                withAWS(credentials: 'aws-credentials', region: "${AWS_REGION}") {
                    script {

                            // ── 1. Create ECS Cluster (idempotent) ────────────
                            sh """
                                aws ecs describe-clusters \
                                    --clusters ${ECS_CLUSTER} \
                                    --region ${AWS_REGION} \
                                    --query 'clusters[?status==`ACTIVE`].clusterName' \
                                    --output text \
                                | grep -q ${ECS_CLUSTER} \
                                || aws ecs create-cluster \
                                    --cluster-name ${ECS_CLUSTER} \
                                    --region ${AWS_REGION}
                            """

                            // ── 2. Resolve default VPC & first two public subnets ──
                            def vpcId = sh(
                                script: """
                                    aws ec2 describe-vpcs \
                                        --filters Name=isDefault,Values=true \
                                        --query 'Vpcs[0].VpcId' \
                                        --output text \
                                        --region ${AWS_REGION}
                                """,
                                returnStdout: true
                            ).trim()

                            // AWS CLI returns tab-separated subnet IDs — split in Groovy, take first 2
                            def subnetRaw = sh(
                                script: """
                                    aws ec2 describe-subnets \
                                        --filters Name=vpc-id,Values=${vpcId} Name=defaultForAz,Values=true \
                                        --query 'Subnets[*].SubnetId' \
                                        --output text \
                                        --region ${AWS_REGION}
                                """,
                                returnStdout: true
                            ).trim()
                            def subnets = subnetRaw.split(/\s+/).take(2).join(',')

                            // ── 3. Ensure Security Group exists ───────────────
                            def sgId = sh(
                                script: """
                                    aws ec2 describe-security-groups \
                                        --filters Name=group-name,Values=travel-agent-sg Name=vpc-id,Values=${vpcId} \
                                        --query 'SecurityGroups[0].GroupId' \
                                        --output text \
                                        --region ${AWS_REGION}
                                """,
                                returnStdout: true
                            ).trim()

                            if (sgId == 'None' || sgId == '') {
                                sgId = sh(
                                    script: """
                                        aws ec2 create-security-group \
                                            --group-name travel-agent-sg \
                                            --description 'Travel Agent ECS Security Group' \
                                            --vpc-id ${vpcId} \
                                            --region ${AWS_REGION} \
                                            --query 'GroupId' \
                                            --output text
                                    """,
                                    returnStdout: true
                                ).trim()

                                sh """
                                    aws ec2 authorize-security-group-ingress \
                                        --group-id ${sgId} \
                                        --protocol tcp \
                                        --port ${APP_PORT} \
                                        --cidr 0.0.0.0/0 \
                                        --region ${AWS_REGION} || true
                                """
                            }

                            // ── 4. Ensure ECS Task Execution Role exists ───────
                            def roleArn = sh(
                                script: """
                                    aws iam get-role \
                                        --role-name ecsTaskExecutionRole \
                                        --query 'Role.Arn' \
                                        --output text 2>/dev/null \
                                    || aws iam create-role \
                                        --role-name ecsTaskExecutionRole \
                                        --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
                                        --query 'Role.Arn' \
                                        --output text \
                                    && aws iam attach-role-policy \
                                        --role-name ecsTaskExecutionRole \
                                        --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
                                """,
                                returnStdout: true
                            ).trim()

                            // If the role already existed, get the ARN cleanly
                            if (!roleArn.startsWith('arn:')) {
                                roleArn = sh(
                                    script: """
                                        aws iam get-role \
                                            --role-name ecsTaskExecutionRole \
                                            --query 'Role.Arn' \
                                            --output text
                                    """,
                                    returnStdout: true
                                ).trim()
                            }

                            // ── 4b. Grant CloudWatch Logs permissions (idempotent) ──
                            // AmazonECSTaskExecutionRolePolicy does NOT include logs:CreateLogGroup.
                            // This inline policy is always applied so it self-heals on every build.
                            sh """
                                aws iam put-role-policy \
                                    --role-name ecsTaskExecutionRole \
                                    --policy-name CloudWatchLogsPolicy \
                                    --policy-document '{
                                        "Version": "2012-10-17",
                                        "Statement": [{
                                            "Effect": "Allow",
                                            "Action": [
                                                "logs:CreateLogGroup",
                                                "logs:CreateLogStream",
                                                "logs:PutLogEvents",
                                                "logs:DescribeLogStreams"
                                            ],
                                            "Resource": "arn:aws:logs:*:*:*"
                                        }]
                                    }' || true
                            """

                            // ── 5. Register ECS Task Definition ───────────────
                            def taskDefJson = """{
                                "family": "${TASK_FAMILY}",
                                "networkMode": "awsvpc",
                                "requiresCompatibilities": ["FARGATE"],
                                "cpu": "${TASK_CPU}",
                                "memory": "${TASK_MEMORY}",
                                "executionRoleArn": "${roleArn}",
                                "containerDefinitions": [
                                    {
                                        "name": "${CONTAINER_NAME}",
                                        "image": "${IMAGE_URI}",
                                        "portMappings": [
                                            {
                                                "containerPort": ${APP_PORT},
                                                "protocol": "tcp"
                                            }
                                        ],
                                        "logConfiguration": {
                                            "logDriver": "awslogs",
                                            "options": {
                                                "awslogs-group": "/ecs/${TASK_FAMILY}",
                                                "awslogs-region": "${AWS_REGION}",
                                                "awslogs-stream-prefix": "ecs",
                                                "awslogs-create-group": "true"
                                            }
                                        },
                                        "essential": true
                                    }
                                ]
                            }"""

                            writeFile file: 'task-def.json', text: taskDefJson

                            def taskDefArn = sh(
                                script: """
                                    aws ecs register-task-definition \
                                        --cli-input-json file://task-def.json \
                                        --region ${AWS_REGION} \
                                        --query 'taskDefinition.taskDefinitionArn' \
                                        --output text
                                """,
                                returnStdout: true
                            ).trim()

                            // ── 6. Create or Update ECS Service ───────────────
                            def serviceExists = sh(
                                script: """
                                    aws ecs describe-services \
                                        --cluster ${ECS_CLUSTER} \
                                        --services ${ECS_SERVICE} \
                                        --region ${AWS_REGION} \
                                        --query 'services[?status==`ACTIVE`].serviceName' \
                                        --output text
                                """,
                                returnStdout: true
                            ).trim()

                            if (serviceExists == ECS_SERVICE) {
                                // Update existing service
                                sh """
                                    aws ecs update-service \
                                        --cluster ${ECS_CLUSTER} \
                                        --service ${ECS_SERVICE} \
                                        --task-definition ${taskDefArn} \
                                        --desired-count ${DESIRED_COUNT} \
                                        --force-new-deployment \
                                        --region ${AWS_REGION}
                                """
                            } else {
                                // Create new service
                                sh """
                                    aws ecs create-service \
                                        --cluster ${ECS_CLUSTER} \
                                        --service-name ${ECS_SERVICE} \
                                        --task-definition ${taskDefArn} \
                                        --desired-count ${DESIRED_COUNT} \
                                        --launch-type FARGATE \
                                        --network-configuration "awsvpcConfiguration={subnets=[${subnets}],securityGroups=[${sgId}],assignPublicIp=ENABLED}" \
                                        --region ${AWS_REGION}
                                """
                            }

                            // ── 7. Wait for service stability ─────────────────
                            sh """
                                aws ecs wait services-stable \
                                    --cluster ${ECS_CLUSTER} \
                                    --services ${ECS_SERVICE} \
                                    --region ${AWS_REGION}
                            """

                            // ── 8. Print public task IP ────────────────────────
                            def taskArn = sh(
                                script: """
                                    aws ecs list-tasks \
                                        --cluster ${ECS_CLUSTER} \
                                        --service-name ${ECS_SERVICE} \
                                        --query 'taskArns[0]' \
                                        --output text \
                                        --region ${AWS_REGION}
                                """,
                                returnStdout: true
                            ).trim()

                            def eniId = sh(
                                script: """
                                    aws ecs describe-tasks \
                                        --cluster ${ECS_CLUSTER} \
                                        --tasks ${taskArn} \
                                        --region ${AWS_REGION} \
                                        --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' \
                                        --output text
                                """,
                                returnStdout: true
                            ).trim()

                            def publicIp = sh(
                                script: """
                                    aws ec2 describe-network-interfaces \
                                        --network-interface-ids ${eniId} \
                                        --query 'NetworkInterfaces[0].Association.PublicIp' \
                                        --output text \
                                        --region ${AWS_REGION}
                                """,
                                returnStdout: true
                            ).trim()

                            echo "================================================================"
                            echo " DEPLOYMENT SUCCESSFUL"
                            echo " Application URL: http://${publicIp}:${APP_PORT}"
                            echo "================================================================"
                        }
                }
            }
        }
    }

    post {
        always {
            sh "docker rmi ${ECR_REPO_NAME}:${IMAGE_TAG} || true"
            sh "docker rmi ${IMAGE_URI}                  || true"
            sh "docker rmi ${LATEST_URI}                 || true"
            sh "rm -f task-def.json"
        }
        success {
            echo "Pipeline completed successfully. New image: ${IMAGE_URI}"
        }
        failure {
            echo "Pipeline FAILED. Check the logs above for details."
        }
    }
}
