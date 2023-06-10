---
date: 2023-06-10T15:13:19+09:00
title: "AWS EKS 스터디 7주차 - Automation"
tags:
 - AWS
 - EKS
 - CloudNet@
 - automation
 - ACK
 - flux
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho@ubuntu-kr.org
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.jpg # 커버 이미지 URL
draft: false # 글 초안 여부
---

EKS 스터디도 마지막 7주차를 맞이했습니다.

이번에는 AWS Controller for k8s(ACK)와 flux를 가볍게 실습해보고  
자동화에 대해 맛보기를 해보았습니다.

앞서 학습해본 IRSA 개념 외에도 CRD(CustomResourceDefinition)을 활용합니다.  

## 1. 실습환경 배포

실습을 위한 YAML파일이 변경된거 말고는 6주차와 유사합니다.

```bash
curl -O https://s3.ap-northeast-2.amazonaws.com/cloudformation.cloudneta.net/K8S/eks-oneclick6.yaml

# 이하 중략

# CERT_ARN(ACM)의 경우에는 /etc/profile에 환경변수 저장을 안해둬서  
# 세션이 만료되면, 다시 재설정 필요

CERT_ARN=`aws acm list-certificates --query 'CertificateSummaryList[].CertificateArn[]' --output text`
echo $CERT_ARN
```

## 2. ACK(AWS Controller for k8s)

- 웹콘솔에 접근하지 않고도, AWS 서비스 리소스를 직접 k8s에서 정의 및 사용가능
- 순서: ACK 컨트롤러 설치 -> IRSA 설정 -> AWS 리소스 컨트롤  
  - 같은 패턴으로 이루어져있는데, Cloudformation을 쓰다보니 중간중간 대기 시간 발생
- (23/05/29) GA: 17개 서비스, Preview: 10개 서비스

### 2-1. S3

- [ACK S3 Controller 설치]

```bash
# 서비스명 변수 지정
export SERVICE=s3

# helm 차트 다운로드
export RELEASE_VERSION=$(curl -sL https://api.github.com/repos/aws-controllers-k8s/$SERVICE-controller/releases/latest | grep '"tag_name":' | cut -d'"' -f4 | cut -c 2-)
helm pull oci://public.ecr.aws/aws-controllers-k8s/$SERVICE-chart --version=$RELEASE_VERSION
tar xzvf $SERVICE-chart-$RELEASE_VERSION.tgz

# helm chart 확인
tree ~/$SERVICE-chart

# ACK S3 Controller 설치
export ACK_SYSTEM_NAMESPACE=ack-system
export AWS_REGION=ap-northeast-2
helm install --create-namespace -n $ACK_SYSTEM_NAMESPACE ack-$SERVICE-controller --set aws.region="$AWS_REGION" ~/$SERVICE-chart

# 설치 확인
helm list --namespace $ACK_SYSTEM_NAMESPACE
kubectl -n ack-system get pods
kubectl get crd | grep $SERVICE

kubectl get all -n ack-system
kubectl get-all -n ack-system
kubectl describe sa -n ack-system ack-s3-controller
```

- [IRSA 설정] AmazonS3FullAccess  
  - 설정 후에는 rollout으로 반영해주어야함

```bash
# Create an iamserviceaccount - AWS IAM role bound to a Kubernetes service account
eksctl create iamserviceaccount \
  --name ack-$SERVICE-controller \
  --namespace ack-system \
  --cluster $CLUSTER_NAME \
  --attach-policy-arn $(aws iam list-policies --query 'Policies[?PolicyName==`AmazonS3FullAccess`].Arn' --output text) \
  --override-existing-serviceaccounts --approve

# 확인
eksctl get iamserviceaccount --cluster $CLUSTER_NAME
kubectl get sa -n ack-system
kubectl describe sa ack-$SERVICE-controller -n ack-system

# Restart ACK service controller deployment using the following commands.
kubectl -n ack-system rollout restart deploy ack-$SERVICE-controller-$SERVICE-chart

# IRSA 적용으로 Env, projected Volume 추가 확인
kubectl describe pod -n ack-system -l k8s-app=$SERVICE-chart
```

![ISRA with override](./images/ISRA-with-override.png)

![check helm chart after applying IRSA](./images/check-helm-chart-after-applying-IRSA.png)

- [리소스 조작] S3 버킷 생성, 업데이트, 삭제  
  - 새로운 쉘로 모니터링 준비: `watch -d aws s3 ls`
  - S3 버킷네임은 전세계에서 고유해야하므로 각자 본인이 쓰고 있는 계정명으로 명명

```bash
# S3 버킷 생성을 위한 설정 파일 생성
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
export BUCKET_NAME=my-ack-s3-bucket-$AWS_ACCOUNT_ID

read -r -d '' BUCKET_MANIFEST <<EOF
apiVersion: s3.services.k8s.aws/v1alpha1
kind: Bucket
metadata:
  name: $BUCKET_NAME
spec:
  name: $BUCKET_NAME
EOF

echo "${BUCKET_MANIFEST}" > bucket.yaml
cat bucket.yaml | yh

# S3 버킷 생성
aws s3 ls
kubectl create -f bucket.yaml

# S3 버킷 확인
aws s3 ls
kubectl get buckets
kubectl describe bucket/$BUCKET_NAME | head -6
aws s3 ls | grep $BUCKET_NAME

# S3 버킷 업데이트: 태그 정보 입력
read -r -d '' BUCKET_MANIFEST <<EOF
apiVersion: s3.services.k8s.aws/v1alpha1
kind: Bucket
metadata:
  name: $BUCKET_NAME
spec:
  name: $BUCKET_NAME
  tagging:
    tagSet:
    - key: myTagKey
      value: myTagValue
EOF

echo "${BUCKET_MANIFEST}" > bucket.yaml

# S3 버킷 설정 업데이트 실행 : 필요 주석 자동 업뎃 내용이니 무시해도됨!
kubectl apply -f bucket.yaml

# S3 버킷 업데이트 확인 
kubectl describe bucket/$BUCKET_NAME | grep Spec: -A5

# S3 버킷 삭제
kubectl delete -f bucket.yaml

kubectl get bucket/$BUCKET_NAME
aws s3 ls | grep $BUCKET_NAME
```

![applying s3 bucket manifest](./images/applying-s3-bucket-manifest.png)

- [ACK S3 Controller 삭제] helm -> CRD -> IRSA

```bash
# helm uninstall
export SERVICE=s3
helm uninstall -n $ACK_SYSTEM_NAMESPACE ack-$SERVICE-controller

# ACK S3 Controller 관련 crd 삭제
kubectl delete -f ~/$SERVICE-chart/crds

# IRSA 삭제
eksctl delete iamserviceaccount --cluster myeks --name ack-$SERVICE-controller --namespace ack-system
```

### 2-2. EC2 & VPC

- 반복숙달의 반복.  
  - S3(2-1)를 건너뛰었다면, helm 설치 시 `--create-namespace` 추가

- [ACK EC2-Controller 설치]
  - EC2 외에도, 해당 인스턴스를 위한 구성요소들을 위한 CRD도 포함된다.  

```bash
# 서비스명 변수 지정 및 helm 차트 다운로드
export SERVICE=ec2
export RELEASE_VERSION=$(curl -sL https://api.github.com/repos/aws-controllers-k8s/$SERVICE-controller/releases/latest | grep '"tag_name":' | cut -d'"' -f4 | cut -c 2-)
helm pull oci://public.ecr.aws/aws-controllers-k8s/$SERVICE-chart --version=$RELEASE_VERSION
tar xzvf $SERVICE-chart-$RELEASE_VERSION.tgz

# helm chart 확인
tree ~/$SERVICE-chart

# ACK EC2-Controller 설치
export ACK_SYSTEM_NAMESPACE=ack-system
export AWS_REGION=ap-northeast-2
helm install -n $ACK_SYSTEM_NAMESPACE ack-$SERVICE-controller --set aws.region="$AWS_REGION" ~/$SERVICE-chart

# 설치 확인
helm list --namespace $ACK_SYSTEM_NAMESPACE
kubectl -n $ACK_SYSTEM_NAMESPACE get pods -l "app.kubernetes.io/instance=ack-$SERVICE-controller"
kubectl get crd | grep $SERVICE
```

- [IRSA 설정] AmazonEC2FullAccess

```bash
eksctl create iamserviceaccount \
  --name ack-$SERVICE-controller \
  --namespace $ACK_SYSTEM_NAMESPACE \
  --cluster $CLUSTER_NAME \
  --attach-policy-arn $(aws iam list-policies --query 'Policies[?PolicyName==`AmazonEC2FullAccess`].Arn' --output text) \
  --override-existing-serviceaccounts --approve

eksctl get iamserviceaccount --cluster $CLUSTER_NAME

kubectl get sa -n $ACK_SYSTEM_NAMESPACE
kubectl describe sa ack-$SERVICE-controller -n $ACK_SYSTEM_NAMESPACE

kubectl -n $ACK_SYSTEM_NAMESPACE rollout restart deploy ack-$SERVICE-controller-$SERVICE-chart

# IRSA 적용으로 Env, projected Volume 추가 확인
kubectl describe pod -n $ACK_SYSTEM_NAMESPACE -l k8s-app=$SERVICE-chart
```

- [리소스 조작] VPC, Subnet 생성 및 삭제  
  - 새로운 쉘로 모니터링 준비: `while true; do aws ec2 describe-vpcs --query 'Vpcs[*].{VPCId:VpcId, CidrBlock:CidrBlock}' --output text; echo "-----"; sleep 1; done`

```bash
# VPC 생성
cat <<EOF > vpc.yaml
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: VPC
metadata:
  name: vpc-tutorial-test
spec:
  cidrBlocks: 
  - 10.0.0.0/16
  enableDNSSupport: true
  enableDNSHostnames: true
EOF
 
kubectl apply -f vpc.yaml

# VPC 생성 확인
kubectl get vpcs
kubectl describe vpcs
aws ec2 describe-vpcs --query 'Vpcs[*].{VPCId:VpcId, CidrBlock:CidrBlock}' --output text

# 다른 새로운 쉘이나 기존 모니터링 쉘 변경하여 모니터링 준비
VPCID=$(kubectl get vpcs vpc-tutorial-test -o jsonpath={.status.vpcID})
while true; do aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPCID" --query 'Subnets[*].{SubnetId:SubnetId, CidrBlock:CidrBlock}' --output text; echo "-----"; sleep 1 ; done

# 서브넷 생성
VPCID=$(kubectl get vpcs vpc-tutorial-test -o jsonpath={.status.vpcID})

cat <<EOF > subnet.yaml
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: Subnet
metadata:
  name: subnet-tutorial-test
spec:
  cidrBlock: 10.0.0.0/20
  vpcID: $VPCID
EOF
kubectl apply -f subnet.yaml

# 서브넷 생성 확인
kubectl get subnets
kubectl describe subnets
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPCID" --query 'Subnets[*].{SubnetId:SubnetId, CidrBlock:CidrBlock}' --output text

# 리소스 삭제: 서브넷, VPC
kubectl delete -f subnet.yaml && kubectl delete -f vpc.yaml
```

![creating VPC](images/creating-vpc.png)

![creating subnet](images/creating-subnet.png)

![subnet mapped with VPC](images/subnet-mapped-with-vpc.png)

### 2-4. VPC Workflow 실습  

- 2-3의 ACK 및 IRSA는 그대로 활용
- VPC, Subnet, SG, RT, EIP, IGW, NATGW, Instance 생성
- client <-> public subnet(ssh tunneling) <-> private subnet 접속
- ACK로 위의 환경을 만들 수 있는지 실습하는 작업

- [VPC 환경설정]
  - 모니터링 준비: watch -d kubectl get routetables,subnet  
  - NATGW 생성 완료 후, 아래 요소들이 순차적으로 확인됨 (약 5분 소요)  
    - tutorial-private-route-table-az1: 라우팅 테이블 ID
    - tutorial-private-subnet1: 서브넷 ID

![route table and subnet created consequently in private VPC 1](images/route-table-and-subnet-created-consequently-in-private-vpc-1.png)

![route table and subnet created consequently in private VPC 2](images/route-table-and-subnet-created-consequently-in-private-vpc-2.png)

![route table and subnet created consequently in private VPC 3](images/route-table-and-subnet-created-consequently-in-private-vpc-3.png)

```bash
cat <<EOF > vpc-workflow.yaml
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: VPC
metadata:
  name: tutorial-vpc
spec:
  cidrBlocks: 
  - 10.0.0.0/16
  enableDNSSupport: true
  enableDNSHostnames: true
  tags:
    - key: name
      value: vpc-tutorial
---
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: InternetGateway
metadata:
  name: tutorial-igw
spec:
  vpcRef:
    from:
      name: tutorial-vpc
---
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: NATGateway
metadata:
  name: tutorial-natgateway1
spec:
  subnetRef:
    from:
      name: tutorial-public-subnet1
  allocationRef:
    from:
      name: tutorial-eip1
---
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: ElasticIPAddress
metadata:
  name: tutorial-eip1
spec:
  tags:
    - key: name
      value: eip-tutorial
---
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: RouteTable
metadata:
  name: tutorial-public-route-table
spec:
  vpcRef:
    from:
      name: tutorial-vpc
  routes:
  - destinationCIDRBlock: 0.0.0.0/0
    gatewayRef:
      from:
        name: tutorial-igw
---
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: RouteTable
metadata:
  name: tutorial-private-route-table-az1
spec:
  vpcRef:
    from:
      name: tutorial-vpc
  routes:
  - destinationCIDRBlock: 0.0.0.0/0
    natGatewayRef:
      from:
        name: tutorial-natgateway1
---
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: Subnet
metadata:
  name: tutorial-public-subnet1
spec:
  availabilityZone: ap-northeast-2a
  cidrBlock: 10.0.0.0/20
  mapPublicIPOnLaunch: true
  vpcRef:
    from:
      name: tutorial-vpc
  routeTableRefs:
  - from:
      name: tutorial-public-route-table
---
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: Subnet
metadata:
  name: tutorial-private-subnet1
spec:
  availabilityZone: ap-northeast-2a
  cidrBlock: 10.0.128.0/20
  vpcRef:
    from:
      name: tutorial-vpc
  routeTableRefs:
  - from:
      name: tutorial-private-route-table-az1
---
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: SecurityGroup
metadata:
  name: tutorial-security-group
spec:
  description: "ack security group"
  name: tutorial-sg
  vpcRef:
     from:
       name: tutorial-vpc
  ingressRules:
    - ipProtocol: tcp
      fromPort: 22
      toPort: 22
      ipRanges:
        - cidrIP: "0.0.0.0/0"
          description: "ingress"
EOF

kubectl apply -f vpc-workflow.yaml

# VPC 환경 생성 확인
kubectl describe vpcs
kubectl describe internetgateways
kubectl describe routetables
kubectl describe natgateways
kubectl describe elasticipaddresses
kubectl describe securitygroups
```

- Public Subnet에 인스턴스 생성

```bash
# public 서브넷 ID 확인
PUBSUB1=$(kubectl get subnets tutorial-public-subnet1 -o jsonpath={.status.subnetID})
echo $PUBSUB1

# 보안그룹 ID 확인
TSG=$(kubectl get securitygroups tutorial-security-group -o jsonpath={.status.id})
echo $TSG

# Amazon Linux 2 최신 AMI ID 확인
AL2AMI=$(aws ec2 describe-images --owners amazon --filters "Name=name,Values=amzn2-ami-hvm-2.0.*-x86_64-gp2" --query 'Images[0].ImageId' --output text)
echo $AL2AMI

# SSH 키페어 이름 변수 지정: 사용할 AWS keypair 
MYKEYPAIR=ryzen1600

# 변수 확인 > 특히 서브넷 ID가 확인되었는지 꼭 확인하자!
echo $PUBSUB1 , $TSG , $AL2AMI , $MYKEYPAIR


# 모니터링 준비
while true; do aws ec2 describe-instances --query "Reservations[*].Instances[*].{PublicIPAdd:PublicIpAddress,PrivateIPAdd:PrivateIpAddress,InstanceName:Tags[?Key=='Name']|[0].Value,Status:State.Name}" --filters Name=instance-state-name,Values=running --output table; date ; sleep 1 ; done

# public 서브넷에 인스턴스 생성
cat <<EOF > tutorial-bastion-host.yaml
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: Instance
metadata:
  name: tutorial-bastion-host
spec:
  imageID: $AL2AMI # AL2 AMI ID - ap-northeast-2
  instanceType: t3.medium
  subnetID: $PUBSUB1
  securityGroupIDs:
  - $TSG
  keyName: $MYKEYPAIR
  tags:
    - key: producer
      value: ack
EOF
kubectl apply -f tutorial-bastion-host.yaml

# 인스턴스 생성 확인
kubectl get instance
kubectl describe instance
aws ec2 describe-instances --query "Reservations[*].Instances[*].{PublicIPAdd:PublicIpAddress,PrivateIPAdd:PrivateIpAddress,InstanceName:Tags[?Key=='Name']|[0].Value,Status:State.Name}" --filters Name=instance-state-name,Values=running --output table
```

![Instance IP in Public IP](./images/instance-ip-in-public-ip.png)

- Public Subnet의 인스턴스에 접속
  - ping test 실패해야 정상

```bash
## Client PC
ssh -i ${사용할 keypair} ec2-user@${앞에서 확인한 Public IP}

ping -c 2 8.8.8.8
```

![ping test failure without engress rule](./images/ping-test-failure-without-engress-rule.png)

- 보안 그룹 정책 수정: egress 규칙 추가

```bash
cat <<EOF > modify-sg.yaml
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: SecurityGroup
metadata:
  name: tutorial-security-group
spec:
  description: "ack security group"
  name: tutorial-sg
  vpcRef:
     from:
       name: tutorial-vpc
  ingressRules:
    - ipProtocol: tcp
      fromPort: 22
      toPort: 22
      ipRanges:
        - cidrIP: "0.0.0.0/0"
          description: "ingress"
  egressRules:
    - ipProtocol: '-1'
      ipRanges:
        - cidrIP: "0.0.0.0/0"
          description: "egress"
EOF
kubectl apply -f modify-sg.yaml

# 변경 확인 >> 보안그룹에 아웃바운드 규칙 확인
kubectl logs -n $ACK_SYSTEM_NAMESPACE -l k8s-app=ec2-chart -f
```

![logs about addition of egress rule to security group](./images/logs-about-addition-of-egress-rule-to-security-group.png)

- 다시, Public Subnet상 인스턴스 접속 상태에서, ping test: 정상  
  - curl로 출력되는 IP는 인스턴스 Public IP 주소  

```bash
## Client PC
# ssh -i ${사용할 keypair} ec2-user@${앞에서 확인한 Public IP}

ping -c 2 8.8.8.8
curl ipinfo.io/ip ; echo # 인스턴스 Public UP(공인IP)
exit
```

![ping test success with egress rule](./images/ping-test-success-with-egress-rule.png)

- Private Subnet에 인스턴스 생성
  - 2-3 실습에서도 봤듯이 Private Subnet ID 확인까지 시간 소요

```bash
# private 서브넷 ID 확인
PRISUB1=$(kubectl get subnets tutorial-private-subnet1 -o jsonpath={.status.subnetID})
echo $PRISUB1

# 변수 확인
echo $PRISUB1 , $TSG , $AL2AMI , $MYKEYPAIR

# Private Subnet에 인스턴스 생성
cat <<EOF > tutorial-instance-private.yaml
apiVersion: ec2.services.k8s.aws/v1alpha1
kind: Instance
metadata:
  name: tutorial-instance-private
spec:
  imageID: $AL2AMI # AL2 AMI ID - ap-northeast-2
  instanceType: t3.medium
  subnetID: $PRISUB1
  securityGroupIDs:
  - $TSG
  keyName: $MYKEYPAIR
  tags:
    - key: producer
      value: ack
EOF
kubectl apply -f tutorial-instance-private.yaml

# 인스턴스 생성 확인
kubectl get instance
kubectl describe instance
aws ec2 describe-instances --query "Reservations[*].Instances[*].{PublicIPAdd:PublicIpAddress,PrivateIPAdd:PrivateIpAddress,InstanceName:Tags[?Key=='Name']|[0].Value,Status:State.Name}" --filters Name=instance-state-name,Values=running --output table
```

![launch instance in Private Subnet](./images/launch-instance-in-private-subnet.png)

- Public Subnet 인스턴스에 SSH 터널링 설정
  - 터널링이므로, 접속 이후 그대로 두기
  - 실습에서는 임의 포트를 `9999`로 설정

```bash
ssh -i ~/.ssh/id_ed25518 -L 9999:${Private Subnet의 인스턴스 private IP}:22 ec2-user@${Public Subnet의 인스턴스 public IP} -v 
```

- 앞에서 설정한 임의 설정 포트(`9999`)로 SSH 접속 시 Private Subnet의 인스턴스에 접속 가능 [Jump Host]

```bash
ssh -i ~/.ssh/id_ed25519 -p 9999 ec2-user@localhost

# IP 및 네트워크 정보 확인
ip -c addr
sudo ss -tnp
ping -c 2 8.8.8.8
curl ipinfo.io/ip ; echo # NATGW IP
exit
```

![connection success in Private instance and check NATGW IP](./images/connection-success-in-private-instance-and-check-natgw-ip.png)

- 실습 후 리소스 삭제  
  - VPC 관련 모든 리소스 삭제 시, 다소 시간이 소요

```bash
kubectl delete -f tutorial-bastion-host.yaml && kubectl delete -f tutorial-instance-private.yaml
kubectl delete -f vpc-workflow.yaml
```

### 2-5. RDS 생성

- 지원 엔진: Aurora(MySQL, PostgreSQL), RDS(MySQL, MariaDB, Oracle, SQL Server)

- [ACK RDS Controller 설치]

```bash
# 서비스명 변수 지정 및 helm 차트 다운로드
export SERVICE=rds
export RELEASE_VERSION=$(curl -sL https://api.github.com/repos/aws-controllers-k8s/$SERVICE-controller/releases/latest | grep '"tag_name":' | cut -d'"' -f4 | cut -c 2-)
helm pull oci://public.ecr.aws/aws-controllers-k8s/$SERVICE-chart --version=$RELEASE_VERSION
tar xzvf $SERVICE-chart-$RELEASE_VERSION.tgz

# helm chart 확인
tree ~/$SERVICE-chart

# ACK EC2-Controller 설치
export ACK_SYSTEM_NAMESPACE=ack-system
export AWS_REGION=ap-northeast-2
helm install -n $ACK_SYSTEM_NAMESPACE ack-$SERVICE-controller --set aws.region="$AWS_REGION" ~/$SERVICE-chart

# 설치 확인
helm list --namespace $ACK_SYSTEM_NAMESPACE
kubectl -n $ACK_SYSTEM_NAMESPACE get pods -l "app.kubernetes.io/instance=ack-$SERVICE-controller"
kubectl get crd | grep $SERVICE
```

![install ACK RDS Controller](./images/install-ack-rds-controller.png)

- [IRSA 설정] AmazonRDSFullAccess

```bash
eksctl create iamserviceaccount \
  --name ack-$SERVICE-controller \
  --namespace $ACK_SYSTEM_NAMESPACE \
  --cluster $CLUSTER_NAME \
  --attach-policy-arn $(aws iam list-policies --query 'Policies[?PolicyName==`AmazonRDSFullAccess`].Arn' --output text) \
  --override-existing-serviceaccounts --approve

eksctl get iamserviceaccount --cluster $CLUSTER_NAME

kubectl get sa -n $ACK_SYSTEM_NAMESPACE
kubectl describe sa ack-$SERVICE-controller -n $ACK_SYSTEM_NAMESPACE

kubectl -n $ACK_SYSTEM_NAMESPACE rollout restart deploy ack-$SERVICE-controller-$SERVICE-chart

# Env, projected Volume 추가 확인
kubectl describe pod -n $ACK_SYSTEM_NAMESPACE -l k8s-app=$SERVICE-chart
```

![applying IRSA to ACK RDS Controller](./images/applying-irsa-to-ack-rds-controller.png)

- [리소스 조작] AWS RDS for MariaDB 생성 및 삭제
  - 모니터링 준비: `watch -d "kubectl describe dbinstance "${RDS_INSTANCE_NAME}" | grep 'Db Instance Status'"`

```bash
# DB 암호를 위한 secret 생성
RDS_INSTANCE_NAME=myrds
RDS_INSTANCE_PASSWORD=qwe12345
kubectl create secret generic "${RDS_INSTANCE_NAME}-password" --from-literal=password="${RDS_INSTANCE_PASSWORD}"

# 확인
kubectl get secret $RDS_INSTANCE_NAME-password

# RDS 배포 생성 : 15분 이내 시간 소요 >> 보안그룹, 서브넷 등 필요한 옵션들은 추가해서 설정해보자!
cat <<EOF > rds-mariadb.yaml
apiVersion: rds.services.k8s.aws/v1alpha1
kind: DBInstance
metadata:
  name: "${RDS_INSTANCE_NAME}"
spec:
  allocatedStorage: 20
  dbInstanceClass: db.t4g.micro
  dbInstanceIdentifier: "${RDS_INSTANCE_NAME}"
  engine: mariadb
  engineVersion: "10.6"
  masterUsername: "admin"
  masterUserPassword:
    namespace: default
    name: "${RDS_INSTANCE_NAME}-password"
    key: password
EOF
kubectl apply -f rds-mariadb.yaml

# 생성 확인
kubectl get dbinstances  ${RDS_INSTANCE_NAME}
kubectl describe dbinstance "${RDS_INSTANCE_NAME}"
aws rds describe-db-instances --db-instance-identifier $RDS_INSTANCE_NAME | jq

# Db Instance Status: creating/backing-up/available
kubectl describe dbinstance "${RDS_INSTANCE_NAME}" | grep 'Db Instance Status'

# 생성 완료 대기 : for 지정 상태가 완료되면 정상 종료됨
# dbinstance.rds.services.k8s.aws/myrds condition met
kubectl wait dbinstances ${RDS_INSTANCE_NAME} --for=condition=ACK.ResourceSynced --timeout=15m
```

### 2-6. Maria DB 접속

- RDS를 사용하는 파드를 생성하여 테스트
  - fieldexport를 먼저 생성 후 이를 활용

```bash
RDS_INSTANCE_CONN_CM="${RDS_INSTANCE_NAME}-conn-cm"

cat <<EOF > rds-field-exports.yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${RDS_INSTANCE_CONN_CM}
data: {}
---
apiVersion: services.k8s.aws/v1alpha1
kind: FieldExport
metadata:
  name: ${RDS_INSTANCE_NAME}-host
spec:
  to:
    name: ${RDS_INSTANCE_CONN_CM}
    kind: configmap
  from:
    path: ".status.endpoint.address"
    resource:
      group: rds.services.k8s.aws
      kind: DBInstance
      name: ${RDS_INSTANCE_NAME}
---
apiVersion: services.k8s.aws/v1alpha1
kind: FieldExport
metadata:
  name: ${RDS_INSTANCE_NAME}-port
spec:
  to:
    name: ${RDS_INSTANCE_CONN_CM}
    kind: configmap
  from:
    path: ".status.endpoint.port"
    resource:
      group: rds.services.k8s.aws
      kind: DBInstance
      name: ${RDS_INSTANCE_NAME}
---
apiVersion: services.k8s.aws/v1alpha1
kind: FieldExport
metadata:
  name: ${RDS_INSTANCE_NAME}-user
spec:
  to:
    name: ${RDS_INSTANCE_CONN_CM}
    kind: configmap
  from:
    path: ".spec.masterUsername"
    resource:
      group: rds.services.k8s.aws
      kind: DBInstance
      name: ${RDS_INSTANCE_NAME}
EOF

kubectl apply -f rds-field-exports.yaml

# 상태 정보 확인 : address 와 port 정보 
kubectl get dbinstances myrds -o jsonpath={.status.endpoint} | jq

# 상태 정보 확인 : masterUsername 확인
kubectl get dbinstances myrds -o jsonpath={.spec.masterUsername} ; echo

# 컨피그맵 확인
kubectl get cm myrds-conn-cm -o yaml | kubectl neat | yh

# fieldexport 정보 확인
kubectl get crd | grep fieldexport
kubectl get fieldexport
kubectl get fieldexport myrds-host -o yaml | k neat | yh
```

![check rdb and configmap data with fieldexport](./images/check-rdb-and-configmap-data-with-fieldexport.png)

![check crd and fieldexport](./images/check-crd-and-fieldexport.png)

- RDS 사용 파드 생성

```bash
APP_NAMESPACE=default
cat <<EOF > rds-pods.yaml
apiVersion: v1
kind: Pod
metadata:
  name: app
  namespace: ${APP_NAMESPACE}
spec:
  containers:
   - image: busybox
     name: myapp
     command:
        - sleep
        - "3600"
     imagePullPolicy: IfNotPresent
     env:
      - name: DBHOST
        valueFrom:
         configMapKeyRef:
          name: ${RDS_INSTANCE_CONN_CM}
          key: "${APP_NAMESPACE}.${RDS_INSTANCE_NAME}-host"
      - name: DBPORT
        valueFrom:
         configMapKeyRef:
          name: ${RDS_INSTANCE_CONN_CM}
          key: "${APP_NAMESPACE}.${RDS_INSTANCE_NAME}-port"
      - name: DBUSER
        valueFrom:
         configMapKeyRef:
          name: ${RDS_INSTANCE_CONN_CM}
          key: "${APP_NAMESPACE}.${RDS_INSTANCE_NAME}-user"
      - name: DBPASSWORD
        valueFrom:
          secretKeyRef:
           name: "${RDS_INSTANCE_NAME}-password"
           key: password
EOF
kubectl apply -f rds-pods.yaml

# 생성 확인
kubectl get pod app

# 파드의 환경 변수 확인
kubectl exec -it app -- env | grep DB
```

![check pod env](./images/check-pod-env.png)

- RDS의 identifier(접속 식별자)를 변경해보고 확인  
  - Roll-out이 아닌, 새로운 식별자를 기반으로 RDS가 생성  
  - 모니터링 준비: `watch -d "kubectl get dbinstance; echo; kubectl get cm myrds-conn-cm -o yaml | kubectl neat"`  

```bash
# DB 식별자를 업데이트 
kubectl patch dbinstance myrds --type=merge -p '{"spec":{"dbInstanceIdentifier":"studyend"}}'

# 확인
kubectl get dbinstance myrds
kubectl describe dbinstance myrds
```

![check rds creation in AWS web console](./images/check-rds-creation-in-aws-web-console.png)

- 변경 정보 반영 확인
  - RDS address: 변경 확인 (`"address": "studyend.-"`)
  - pod 환경변수: 변경되지 않음 (`DBHOST=myrds.-`)
    - 환경 변수(env)로 정보를 주입했기 때문에 업데이트 되지 않음
    - pod rollout으로 env 변경 적용 가능 (deployments/daemonsets/statefulsets)

![RDS address is not changed after RDS identifier changed](./images/rds-address-is-not-changed-after-rds-identifier-changed.png)

```bash
# 상태 정보 확인 : address 변경 확인!
kubectl get dbinstances myrds -o jsonpath={.status.endpoint} | jq

# 파드의 환경 변수 확인 >> 파드의 경우 환경 변수 env로 정보를 주입했기 때문에 변경된 정보를 확인 할 수 없다
kubectl exec -it app -- env | grep DB

# 파드 삭제 후 재생성 후 확인
kubectl delete pod app && kubectl apply -f rds-pods.yaml

# 파드의 환경 변수 업데이트 확인!
kubectl exec -it app -- env | grep DB
```

![check rds address changed in configmap](./images/check-rds-address-changed-in-configmap.png)

![rollout pod to apply changed env](./images/rollout-pod-to-apply-changed-env.png)

- RDS 삭제: 단, ACK의 관리에서 벗어난 myrds는 직접 삭제해야함

```bash
# 파드 삭제
kubectl delete pod app
# RDS 삭제 
kubectl delete -f rds-mariadb.yaml
```

![delete not tracked rds](./images/delete-not-tracked-rds.png)

## 3. Flux

- Flux하면, [f.lux](https://justgetflux.com/) 시간별 화면 색조 변경프로그램이 떠오르는데... 아쉽지만, 이번엔 GitOps용 솔루션.  
- GitHub 토큰을 활용  
  - 한번 생성되고, 재 조회가 안되므로 메모를 하거나 다시 생성  
  - 같은 계정에서 발급한 다른 토큰을 써도 Flux사용은 연속적으로 사용 가능
- 부트스트랩으로 Github private repo 생성 후, manifest 추가하여 사용

![GitHub token needed](./images/github-token-needed.png)

```bash
# Flux CLI 설치
curl -s https://fluxcd.io/install.sh | sudo bash
. <(flux completion bash)

# 버전 확인
flux --version

# GitHub 토큰 주입
export GITHUB_TOKEN=${ghp_###}
export GITHUB_USER=kkumtree

# Bootstrap
flux bootstrap github \
  --owner=$GITHUB_USER \
  --repository=fleet-infra \
  --branch=main \
  --path=./clusters/my-cluster \
  --personal

# 설치 확인
# GitHub에서 신규 private repo(fleet-infra) 생성 확인
kubectl get pods -n flux-system
kubectl get-all -n flux-system
kubectl get crd | grep fluxc
kubectl get gitrepository -n flux-system
```

![private repo created](./images/private-repo-created.png)

- GitOps 도구 설치: flux 대시보드
  - admin / password
  - ingress 설정: p8s, grafana 설치를 안했다면 시간 소요

```bash
# gitops 도구 설치
curl --silent --location "https://github.com/weaveworks/weave-gitops/releases/download/v0.24.0/gitops-$(uname)-$(uname -m).tar.gz" | tar xz -C /tmp
sudo mv /tmp/gitops /usr/local/bin
gitops version

# flux 대시보드 설치
PASSWORD="password"
gitops create dashboard ww-gitops --password=$PASSWORD

# 확인
flux -n flux-system get helmrelease
kubectl -n flux-system get pod,svc

# ingress 배포를 위한 ACM ARN
CERT_ARN=`aws acm list-certificates --query 'CertificateSummaryList[].CertificateArn[]' --output text`
echo $CERT_ARN

# Ingress 설정
cat <<EOT > gitops-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: gitops-ingress
  annotations:
    alb.ingress.kubernetes.io/certificate-arn: $CERT_ARN
    alb.ingress.kubernetes.io/group.name: study
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}, {"HTTP":80}]'
    alb.ingress.kubernetes.io/load-balancer-name: myeks-ingress-alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    alb.ingress.kubernetes.io/success-codes: 200-399
    alb.ingress.kubernetes.io/target-type: ip
spec:
  ingressClassName: alb
  rules:
  - host: gitops.$MyDomain
    http:
      paths:
      - backend:
          service:
            name: ww-gitops-weave-gitops
            port:
              number: 9001
        path: /
        pathType: Prefix
EOT
kubectl apply -f gitops-ingress.yaml -n flux-system

# 배포 확인
kubectl get ingress -n flux-system

# GitOps 접속 정보 확인 >> 웹 접속 후 정보 확인
echo -e "GitOps Web https://gitops.$MyDomain"
```

![flux dashboard](./images/flux-dashboard.png)

### 3-1. kustomize 예제로 샘플 실습

- 모니터링 준비: `watch -d kubectl get pod,svc nginx-example1`  
- GitHub에 있는 Nginx manifest를 k8s에 배포
  - 배포 시에 kustomize를 사용
- flux 지원 소스: git / helm / oci / bucket
  - `flux create source {target source}

```bash
GITURL="https://github.com/sungwook-practice/fluxcd-test.git"
flux create source git nginx-example1 --url=$GITURL --branch=main --interval=30s

# 소스 확인
flux get sources git
kubectl -n flux-system get gitrepositories

# flux 애플리케이션 생성: 유형(kustomization), git 소스 경로(--path)
# 생성 후 GitOps 대시보드에서 확인
flux create kustomization nginx-example1 --target-namespace=default --interval=1m --source=nginx-example1 --path="./nginx" --health-check-timeout=2m

kubectl get pod,svc nginx-example1
kubectl get kustomizations -n flux-system
flux get kustomizations
```

![git source creation with flux](./images/git-source-creation-with-flux.png)

![Nginx manifest deployment with kustomize](./images/nginx-manifest-deployment-with-kustomize.png)

![deployment status in GitOps dashboard](./images/deployment-status-in-gitops-dashboard.png)

![graph view in GitOps dashboard](./images/graph-view-in-gitops-dashboard.png)

- 애플리케이션 삭제
  - 처음 삭제 시: pod, svc는 사라지지 않음. annotation 개념
  - `--prune=true`를 통해 같이 삭제되도록 할 수 있음 (default: false)

```bash
# flux 애플리케이션 삭제
flux delete kustomization nginx-example1
flux get kustomizations
kubectl get pod,svc nginx-example1

# flux 애플리케이션 다시 생성 :  --prune 옵션 true
flux create kustomization nginx-example1 \
  --target-namespace=default \
  --prune=true \
  --interval=1m \
  --source=nginx-example1 \
  --path="./nginx" \
  --health-check-timeout=2m

# 확인
flux get kustomizations
kubectl get pod,svc nginx-example1

# flux 애플리케이션 삭제: pod, svc 함께 삭제
flux delete kustomization nginx-example1
flux get kustomizations
kubectl get pod,svc nginx-example1

# flux 소스 삭제
flux delete source git nginx-example1

# 소스 확인
flux get sources git
kubectl -n flux-system get gitrepositories
```

![delete kustomization without prune option](./images/delete-kustomization-without-prune-option.png)

![only kustomization deleted](./images/only-kustomization-deleted.png)

![pod and service survived without flux prune option](./images/pod-and-service-survived-without-flux-prune-option.png)

![kustomization reconciliation with existed pod and service](./images/kustomization-reconciliation-with-existed-pod-and-service.png)

![delete with prune option 1](./images/delete-with-prune-option-1.png)

![delete with prune option 2](./images/delete-with-prune-option-2.png)

### 3-2. Flux 공식 Docs 샘플 실습

- 앞서 최성욱(악성코드분석)님께서 만들어주신 샘플로 계속 하려 했으나,  
  - 샘플 실습에서의 replica 변경이 적용되지 않아 새로이 진행
- 모니터링 준비: `watch -d kubectl get pod,svc`
  - scale down 시 pod가 삭제되었다가, 다시 재생성 됨

![pratice with new flux sample](./images/pratice-with-new-flux-sample.png)

![another git source creation with flux](./images/another-git-source-creation-with-flux.png)

![source events in GitOps dashboard](./images/source-events-in-gitops-dashboard.png)

```bash
# Clone the git repository : 자신의 Github 의 Username, Token 입력
# Username for 'https://github.com': <자신의 Github 의 Username>
# Password for 'https://kkumtree@github.com': <자신의 Github의 Token>
git clone https://github.com/$GITHUB_USER/fleet-infra

cd fleet-infra
tree

## ADD podinfo repository to Flux
# GitRepository yaml 파일 생성
flux create source git podinfo \
  --url=https://github.com/stefanprodan/podinfo \
  --branch=master \
  --interval=30s \
  --export > ./clusters/my-cluster/podinfo-source.yaml

# GitRepository yaml 파일 확인
cat ./clusters/my-cluster/podinfo-source.yaml | yh

# Commit and push the podinfo-source.yaml file to the fleet-infra repository
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git add -A && git commit -m "Add podinfo GitRepository"
git push
Username for 'https://github.com': <자신의 Github 의 Username>
Password for 'https://gasida@github.com': <자신의 Github의 Token>

# 소스 확인
flux get sources git
kubectl -n flux-system get gitrepositories

## Deploy podinfo application
## Configure Flux to build and apply the kustomize directory located in the podinfo repository
# Use the flux create command to create a Kustomization that applies the podinfo deployment.
flux create kustomization podinfo \
  --target-namespace=default \
  --source=podinfo \
  --path="./kustomize" \
  --prune=true \
  --interval=5m \
  --export > ./clusters/my-cluster/podinfo-kustomization.yaml

# 파일 확인
cat ./clusters/my-cluster/podinfo-kustomization.yaml | yh

# Commit and push the Kustomization manifest to the repository:
git add -A && git commit -m "Add podinfo Kustomization"
git push

# 확인
kubectl get pod,svc
kubectl get kustomizations -n flux-system
flux get kustomizations
tree

## Watch Flux sync the application 
kubectl scale deployment podinfo --replicas 1
kubectl scale deployment podinfo --replicas 3

## 삭제
flux delete kustomization podinfo
flux delete source git podinfo

flux uninstall --namespace=flux-system
```

![podinfo running as default in 2 replicas](./images/podinfo-running-as-default-in-2-replicas.png)

![health check in GitOps dashboard](./images/health-check-in-gitops-dashboard.png)

![podinfo pod scaled to 1 but failed](./images/podinfo-pod-scaled-to-1-but-failed.png)

![new replica created to fit 2 replicas](./images/new-replica-created-to-fit-2-replicas.png)

![cause desiredReplicas 2, scaling down to 1 is failed](./images/cause-desiredReplicas-2-scaling-down-to-1-is-failed.png)

![podinfo pod scaled to 3 success](./images/podinfo-pod-scaled-to-3-success.png)

![replica status when scale out to 3](./images/replica-status-when-scale-out-to-3.png)

![delete kustomization and source](./images/delete-kustomization-and-source.png)
