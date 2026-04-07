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
        ALB_NAME         = 'travel-agent-alb'
        TG_NAME          = 'travel-agent-tg'
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

                            // ── 3b. ALB Security Group (allows port 80 from internet) ──
                            def albSgId = sh(
                                script: """
                                    aws ec2 describe-security-groups \
                                        --filters Name=group-name,Values=travel-agent-alb-sg Name=vpc-id,Values=${vpcId} \
                                        --query 'SecurityGroups[0].GroupId' \
                                        --output text \
                                        --region ${AWS_REGION}
                                """,
                                returnStdout: true
                            ).trim()

                            if (albSgId == 'None' || albSgId == '') {
                                albSgId = sh(
                                    script: """
                                        aws ec2 create-security-group \
                                            --group-name travel-agent-alb-sg \
                                            --description 'Travel Agent ALB Security Group' \
                                            --vpc-id ${vpcId} \
                                            --region ${AWS_REGION} \
                                            --query 'GroupId' \
                                            --output text
                                    """,
                                    returnStdout: true
                                ).trim()

                                // Allow HTTP port 80 from anywhere
                                sh """
                                    aws ec2 authorize-security-group-ingress \
                                        --group-id ${albSgId} \
                                        --protocol tcp \
                                        --port 80 \
                                        --cidr 0.0.0.0/0 \
                                        --region ${AWS_REGION} || true
                                """

                                // Allow ECS tasks to receive traffic from ALB SG on APP_PORT
                                sh """
                                    aws ec2 authorize-security-group-ingress \
                                        --group-id ${sgId} \
                                        --protocol tcp \
                                        --port ${APP_PORT} \
                                        --source-group ${albSgId} \
                                        --region ${AWS_REGION} || true
                                """
                            }

                            // ── 3c. Create Target Group (idempotent) ──────────
                            def tgArn = sh(
                                script: """
                                    aws elbv2 describe-target-groups \
                                        --names ${TG_NAME} \
                                        --query 'TargetGroups[0].TargetGroupArn' \
                                        --output text \
                                        --region ${AWS_REGION} 2>/dev/null || echo NONE
                                """,
                                returnStdout: true
                            ).trim()

                            if (tgArn == 'NONE' || tgArn == 'None' || tgArn == '') {
                                tgArn = sh(
                                    script: """
                                        aws elbv2 create-target-group \
                                            --name ${TG_NAME} \
                                            --protocol HTTP \
                                            --port ${APP_PORT} \
                                            --vpc-id ${vpcId} \
                                            --target-type ip \
                                            --health-check-path /health \
                                            --health-check-interval-seconds 30 \
                                            --healthy-threshold-count 2 \
                                            --unhealthy-threshold-count 3 \
                                            --region ${AWS_REGION} \
                                            --query 'TargetGroups[0].TargetGroupArn' \
                                            --output text
                                    """,
                                    returnStdout: true
                                ).trim()
                            }

                            // ── 3d. Create ALB (idempotent) ───────────────────
                            def albArn = sh(
                                script: """
                                    aws elbv2 describe-load-balancers \
                                        --names ${ALB_NAME} \
                                        --query 'LoadBalancers[0].LoadBalancerArn' \
                                        --output text \
                                        --region ${AWS_REGION} 2>/dev/null || echo NONE
                                """,
                                returnStdout: true
                            ).trim()

                            if (albArn == 'NONE' || albArn == 'None' || albArn == '') {
                                def subnetList = subnets.split(',').collect { "'${it}'" }.join(' ')
                                albArn = sh(
                                    script: """
                                        aws elbv2 create-load-balancer \
                                            --name ${ALB_NAME} \
                                            --subnets ${subnets.replace(',', ' ')} \
                                            --security-groups ${albSgId} \
                                            --scheme internet-facing \
                                            --type application \
                                            --ip-address-type ipv4 \
                                            --region ${AWS_REGION} \
                                            --query 'LoadBalancers[0].LoadBalancerArn' \
                                            --output text
                                    """,
                                    returnStdout: true
                                ).trim()

                                // ── 3e. Create HTTP Listener → forward to Target Group ──
                                sh """
                                    aws elbv2 create-listener \
                                        --load-balancer-arn ${albArn} \
                                        --protocol HTTP \
                                        --port 80 \
                                        --default-actions Type=forward,TargetGroupArn=${tgArn} \
                                        --region ${AWS_REGION}
                                """
                            }

                            // Get stable ALB DNS name
                            def albDns = sh(
                                script: """
                                    aws elbv2 describe-load-balancers \
                                        --names ${ALB_NAME} \
                                        --query 'LoadBalancers[0].DNSName' \
                                        --output text \
                                        --region ${AWS_REGION}
                                """,
                                returnStdout: true
                            ).trim()

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
                                // Update existing service (ALB is already attached, just roll new image)
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
                                // Create new service wired to the ALB target group
                                sh """
                                    aws ecs create-service \
                                        --cluster ${ECS_CLUSTER} \
                                        --service-name ${ECS_SERVICE} \
                                        --task-definition ${taskDefArn} \
                                        --desired-count ${DESIRED_COUNT} \
                                        --launch-type FARGATE \
                                        --network-configuration "awsvpcConfiguration={subnets=[${subnets}],securityGroups=[${sgId}],assignPublicIp=ENABLED}" \
                                        --load-balancers "targetGroupArn=${tgArn},containerName=${CONTAINER_NAME},containerPort=${APP_PORT}" \
                                        --health-check-grace-period-seconds 60 \
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

                            // ── 8. Print stable ALB URL (never changes between builds) ──
                            echo "================================================================"
                            echo " DEPLOYMENT SUCCESSFUL"
                            echo " Application URL: http://${albDns}"
                            echo " (This URL is permanent — it does not change between builds)"
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
