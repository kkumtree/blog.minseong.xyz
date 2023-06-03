---
date: 2023-06-03T13:37:35+09:00
title: "AWS EKS 스터디 6주차 - Security"
tags:
 - AWS
 - EKS
 - CloudNet@
 - security
 - IRSA
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho@ubuntu-kr.org
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.jpg # 커버 이미지 URL
draft: true # 글 초안 여부
---

이번에는 인증 및 인가, 그리고 IRSA를 중심으로 EKS의 보안에 대해 학습해보았습니다.

## 1. 실습 환경 배포

- 모의공격(?) 테스트를 위해 2개의 bastion 서버가 구성된 환경을 배포하였습니다.
- p8s 및 grafana의 경우, 선택적으로 배포해도 되서 기술은 생략합니다.

```bash
curl -O https://s3.ap-northeast-2.amazonaws.com/cloudformation.cloudneta.net/K8S/eks-oneclick5.yaml

# 이하 중략

# CERT_ARN(ACM)의 경우에는 /etc/profile에 환경변수 저장을 안해둬서  
# 세션이 만료되면, 다시 재설정해야합니다.

CERT_ARN=`aws acm list-certificates --query 'CertificateSummaryList[].CertificateArn[]' --output text`
echo $CERT_ARN
```

## 2. k8s 인증/인가

- `.kube/config` 파일을 기반  
  - cluster: k8s API 서버 접속정보
  - users: API 서버에 접속하기 위한 유저 인증정보 목록
  - contexts: cluster및 user를 매핑(조합)한 정보

### 2-1. 인증/인가 실습

- 여기서는 인프라팀, 개발팀으로 각각의 ns에 유저를 생성하여 실습  

```bash
kubectl create namespace dev-team
kubectl create ns infra-team
kubectl get ns

# 네임스페이스에 서비스 어카운트 생성
kubectl create sa dev-k8s -n dev-team
kubectl create sa infra-k8s -n infra-team

# 서비스 어카운트 정보 확인
kubectl get sa -n dev-team
kubectl get sa dev-k8s -n dev-team -o yaml | yh

kubectl get sa -n infra-team
kubectl get sa infra-k8s -n infra-team -o yaml | yh

# dev-k8s 서비스 어카운트의 토큰 획득
DevTokenName=$(kubectl get sa dev-k8s -n dev-team -o jsonpath="{.secrets[0].name}")
DevToken=$(kubectl get secret -n dev-team $DevTokenName -o jsonpath="{.data.token}" | base64 -d)
echo $DevToken
```

- 각각의 YAML파일에 토큰이 있는데 이는 JWT(Bearer)토큰으로 아래에서 확인가능
  - [https://jwt.io/](https://jwt.io/)
  - Credential도 있기 때문에 취급주의

- SA 지정하여 파드 생성 후 권한 테스트

```bash
cat <<EOF | kubectl create -f -
apiVersion: v1
kind: Pod
metadata:
  name: dev-kubectl
  namespace: dev-team
spec:
  serviceAccountName: dev-k8s
  containers:
  - name: kubectl-pod
    image: bitnami/kubectl:1.24.10
    command: ["tail"]
    args: ["-f", "/dev/null"]
  terminationGracePeriodSeconds: 0
EOF

cat <<EOF | kubectl create -f -
apiVersion: v1
kind: Pod
metadata:
  name: infra-kubectl
  namespace: infra-team
spec:
  serviceAccountName: infra-k8s
  containers:
  - name: kubectl-pod
    image: bitnami/kubectl:1.24.10
    command: ["tail"]
    args: ["-f", "/dev/null"]
  terminationGracePeriodSeconds: 0
EOF

# 확인
kubectl get pod -o dev-kubectl -n dev-team -o yaml | grep serviceAccount
kubectl get pod -o infra-kubectl -n infra-team -o yaml | grep serviceAccount

# 파드에 기본 적용되는 SA 정보(토큰) 
kubectl exec -it dev-kubectl -n dev-team -- ls /run/secrets/kubernetes.io/serviceaccount
kubectl exec -it dev-kubectl -n dev-team -- cat /run/secrets/kubernetes.io/serviceaccount/token
kubectl exec -it dev-kubectl -n dev-team -- cat /run/secrets/kubernetes.io/serviceaccount/namespace
kubectl exec -it dev-kubectl -n dev-team -- cat /run/secrets/kubernetes.io/serviceaccount/ca.crt

# 각 파드 접속하여, 정보 확인 with alias
alias k1='kubectl exec -it dev-kubectl -n dev-team -- kubectl'
alias k2='kubectl exec -it infra-kubectl -n infra-team -- kubectl'

# 권한 테스트
k1 get pods # kubectl exec -it dev-kubectl -n dev-team -- kubectl get pods 와 동일한 실행 명령이다!
k1 run nginx --image nginx:1.20-alpine
k1 get pods -n kube-system

# (옵션) kubectl 실행 사용자(host 기준)가 특정 권한을 가지고 있는지 확인 [결과: no]
k1 auth can-i get pods
```

- 당연히 되지 않음. 단지 SA를 만들어서 파드에 적어넣었을 뿐
  1. Role의 부재
  2. SA와 Role의 매핑(RoleBinding)의 부재
- 아래에서 위의 두 가지를 생성

```bash
# 각 NS에 Role 생성 후 확인
cat <<EOF | kubectl create -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: role-dev-team
  namespace: dev-team
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
EOF

cat <<EOF | kubectl create -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: role-infra-team
  namespace: infra-team
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
EOF

kubectl describe roles role-dev-team -n dev-team

# 각 NS에 SA와 Role 매핑(RoleBinding) 생성 후 확인
cat <<EOF | kubectl create -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: roleB-dev-team
  namespace: dev-team
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: role-dev-team
subjects:
- kind: ServiceAccount
  name: dev-k8s
  namespace: dev-team
EOF

cat <<EOF | kubectl create -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: roleB-infra-team
  namespace: infra-team
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: role-infra-team
subjects:
- kind: ServiceAccount
  name: infra-k8s
  namespace: infra-team
EOF

kubectl describe rolebindings roleB-dev-team -n dev-team

# 권한 테스트 성공
alias k1='kubectl exec -it dev-kubectl -n dev-team -- kubectl'
alias k2='kubectl exec -it infra-kubectl -n infra-team -- kubectl'

k1 get pods 
k1 run nginx --image nginx:1.20-alpine
k1 get pods
k1 delete pods nginx
k1 get pods -n kube-system
k1 get nodes

k1 auth can-i get pods # yes
```

## 3. EKS 인증/인가

- 앞에서 k8s 인증/인가를 했다면 이제는 AWS IAM 서비스와 결합
  - 인증: AWS IAM
  - 인가: k8s RBAC
- 원활한 진행을 위해 RBAC용 krew 플러그인 설치

```bash
kubectl krew install access-matrix rbac-tool rbac-view rolesum

# 실습 NS인 default에서 액세스 매트릭스 
kubectl access-matrix --namespace default

# USER/GROUP/SA 단위의 RBAC 조회
# system:nodes == eks:node-bootstrapper
# system:bootstrappers == eks:node-bootstrapper
kubectl rbac-tool lookup system:masters

# USER/GROUP/SA 단위의 RBAC 정책 규칙 
kubectl rbac-tool policy-rules
kubectl rbac-tool policy-rules

# 해당 클러스터에서 사용 가능한 클러스터롤 조회
kubectl rbac-tool show

# 클러스터에 인증된 현재 컨텍스트의 사용자 
kubectl rbac-tool whoami

# USER/GROUP/SA 단위의 RBAC 역할 조회
kubectl rolesum aws-node -n kube-system
kubectl rolesum -k User system:kube-proxy
kubectl rolesum -k Group system:masters

# (새로운 쉘) 현재 접속한 본인의 RBAC 권한을 시각적으로 
echo -e "RBAC View Web http://$(curl -s ipinfo.io/ip):8800"
kubectl rbac-view
```

### 3-1. EKS 인증/인가 살펴보기

- STS(Security Token Service)를 기반  
- aws-cli v1.16.156부터 aws-iam-authenticator 설치 없이 get-token으로 획득 가능
  1. kubectl ~ `aws eks get-token` ~ EKS Service Endpoint 요청 구조
  2. kubectl의 Client-Go 라이브러가 Pre-Signed URL을 Tokenize하여 엔드포인트 요청 **[Credential 가득함. 유의!]**
  3. EKS API는 Webhook token authenticator에 Token Review Request  
     AWS IAM 해당 인증을 호출 완료 후, User/Role의 ARN 반환
  4. k8s RBAC 인가 처리
- EKS configmap에서 `system:masters`나 `system:authenticated`로 예상되는 그룹 정보는 노출되지 않음
  - Human Error 예방 추정
  - `kubectl rbac-tool whoami`으로 조회 가능
- (kubeconfig)v1beta1을 쓰고 있는데, 실습을 하다보면 간혹 token값 앞부분이 깨져나옴  
  - To-Do: v1(GA) 이후로 해서 테스트해봐야 함

```bash
# sts caller id의 ARN
aws sts get-caller-identity --query Arn

# kubeconfig 정보. get-token 커맨드 삽입 확인
cat ~/.kube/config | yh

# STS 임시 보안 자격 증명 토큰 요청. 시간경과 시 토큰 재발급
aws eks get-token --cluster-name $CLUSTER_NAME | jq -r '.status.token'

# tokenreview, Webhook, validatingwebhookconfigurations API 리소스 
kubectl api-resources | grep authentication
kubectl api-resources | grep Webhook
kubectl get validatingwebhookconfigurations
kubectl get validatingwebhookconfigurations eks-aws-auth-configmap-validation-webhook -o yaml | kubectl neat | yh

# aws-auth configmap
kubectl get cm -n kube-system aws-auth -o yaml | kubectl neat | yh

# EKS를 설치한 IAM User 정보
kubectl rbac-tool whoami

# system:masters, system:authenticated 그룹 정보
kubectl rbac-tool lookup system:masters
kubectl rbac-tool lookup system:authenticated
kubectl rolesum -k Group system:masters
kubectl rolesum -k Group system:authenticated

# system:masters 그룹이 사용 가능한 ClusterRole: cluster-admin
kubectl describe clusterrolebindings.rbac.authorization.k8s.io cluster-admin

# cluster-admin 의 PolicyRule: 모든 리소스 사용 가능!
kubectl describe clusterrole cluster-admin

# system:authenticated 그룹이 사용 가능한 ClusterRole
kubectl describe ClusterRole system:discovery
kubectl describe ClusterRole system:public-info-viewer
kubectl describe ClusterRole system:basic-user
kubectl describe ClusterRole eks:podsecuritypolicy:privileged
```

### 3-2. 신규 인프라 관리자용 myeks-bastion-2에 EKS 인증/인가 설정

- 기존 쉘(myeks-bastion)과 교차하여 진행: testuser 생성 및 권한 수정

```bash
##
# myeks-bastion
##

# testuser 생성 및 프로그래밍 방식 Access 권한 부여, 어드민 접속 정책 추가
# Access Key의 경우, 1회만 출력 -> 메모
aws iam create-user --user-name testuser
aws iam create-access-key --user-name testuser
aws iam attach-user-policy --policy-arn arn:aws:iam::aws:policy/AdministratorAccess --user-name testuser

# get-call-identity ARN 
aws sts get-caller-identity --query Arn

# testuser가 접속할 myeks-bastion-2 PublicIP 확인
aws ec2 describe-instances --query "Reservations[*].Instances[*].{PublicIPAdd:PublicIpAddress,PrivateIPAdd:PrivateIpAddress,InstanceName:Tags[?Key=='Name']|[0].Value,Status:State.Name}" --filters Name=instance-state-name,Values=running --output table
```

- 현재 상태에서 testuser는 접속은 가능하지만, kubectl 불가
  - 당연하게도, 관리자 그룹(`system:masters`)과 매핑이 되지 않았기에 불가

```bash
##
# myeks-bastion-2
##

# testuser로 접속
ssh ec2-user@{myeks-bastion-2 PublicIP}

# testuser IAM 설정
aws configure

# get-call-identity ARN
aws sts get-caller-identity --query Arn

# kubectl 명령어 실행: 권한 없음
kubectl get node -v6
ls ~/.kube
```

- 다시, 원래 쉘에서 그룹 부여를 하여 권한 설정: EKS 관리자 레벨

```bash
##
# myeks-bastion
##
eksctl create iamidentitymapping --cluster $CLUSTER_NAME --username testuser --group system:masters --arn arn:aws:iam::$ACCOUNT_ID:user/testuser

# system:masters 적용 확인
# IAM 매핑 확인 시, 기존 NodeInstanceRole은 노드에 접속될 때 사용되는 IAM Role(Credential 확인 불가, 세션과 같은 느낌으로 이해)
kubectl get cm -n kube-system aws-auth -o yaml | kubectl neat | yh
eksctl get iamidentitymapping --cluster $CLUSTER_NAME
```

- 다시, testuser에서 kubectl 명령어 실행: 권한 있음
  - 실행 전, kubeconfig 업데이트 필요

```bash
##
# myeks-bastion-2
##

# kubeconfig 업데이트(생성)
aws eks update-kubeconfig --name $CLUSTER_NAME --user-alias testuser

# kubeconfig에 system:masters 그룹 추가 확인
cat ~/.kube/config | yh

# kubectl 실행: 권한 있음
kubectl ns default
kubectl get node -v6

# rbac-tool: system:masters 그룹과 더불어 system:authenticated가 같이 설정
kubectl krew install rbac-tool && kubectl rbac-tool whoami
```

- testuser의 그룹 재설정 (system:masters -> system:authenticated)
  - 텍스트에디터로 직접 편집
  - (또는) iamidentitymapping 삭제 후, 다시 생성

```bash
##
# myeks-bastion
##

kubectl edit cm -n kube-system aws-auth
eksctl get iamidentitymapping --cluster $CLUSTER_NAME
```

- testuser에서 kubectl 명령어 실행 **시도**: 일부 권한 없음
  - config 업데이트를 하지 않아도, 적용되어 있음

```bash
##
# myeks-bastion-2
##

kubectl get node -v6
kubectl api-resources -v5
```

- 물론 testuser IAM 매핑을 삭제하면, 아예 권한이 없음

```bash
##
# myeks-bastion
##

# testuser IAM 맵핑 삭제
eksctl delete iamidentitymapping --cluster $CLUSTER_NAME --arn  arn:aws:iam::$ACCOUNT_ID:user/testuser

eksctl get iamidentitymapping --cluster $CLUSTER_NAME
kubectl get cm -n kube-system aws-auth -o yaml | yh
```

```bash
##
# myeks-bastion-2
##

kubectl get node -v6
kubectl api-resources -v5
```

### 3-3. (옵션) EC2 Instance Profile(IAM Role)에 맵핑된 k8s RBAC 확인

- 3-2에서 `NodeInstanceRole`을 중간에 확인
  - `system:nodes`
  - username: `system:node:{{EC2PrivateDNSName}}`
- 추가 IAM 증명이 없어도, 노드에 생성된 파드에서 IMDS로 EC2 IAM Role 사용  
  - Token 만료 전까지 이용 가능. 권한 유의

```bash
# 노드 별 hostname, sts ARN
for node in $N1 $N2 $N3; do ssh ec2-user@$node hostname; done
for node in $N1 $N2 $N3; do ssh ec2-user@$node aws sts get-caller-identity --query Arn; done

# aws-auth ConfigMap
kubectl describe configmap -n kube-system aws-auth

# IAM identity mapping
eksctl get iamidentitymapping --cluster $CLUSTER_NAME
```

- aws-cli(v2) 파드를 추가하여, 해당 EC2 노드의 IMDS 정보 확인

```bash
cat <<EOF | kubectl create -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: awscli-pod
spec:
  replicas: 2
  selector:
    matchLabels:
      app: awscli-pod
  template:
    metadata:
      labels:
        app: awscli-pod
    spec:
      containers:
      - name: awscli-pod
        image: amazon/aws-cli
        command: ["tail"]
        args: ["-f", "/dev/null"]
      terminationGracePeriodSeconds: 0
EOF

kubectl get pod -owide

# 파드 이름 변수 지정 후 각 파드에서 EC2 InstancePrfile(IAM Role) ARN 확인
APODNAME1=$(kubectl get pod -l app=awscli-pod -o jsonpath={.items[0].metadata.name})
APODNAME2=$(kubectl get pod -l app=awscli-pod -o jsonpath={.items[1].metadata.name})
echo $APODNAME1, $APODNAME2

kubectl exec -it $APODNAME1 -- aws sts get-caller-identity --query Arn
kubectl exec -it $APODNAME2 -- aws sts get-caller-identity --query Arn

# 추가 IAM 증명이 없어도, IMDS로 EC2 IAM Role 사용: 권한 유의
kubectl exec -it $APODNAME1 -- aws ec2 describe-instances --region ap-northeast-2 --output table --no-cli-pager
kubectl exec -it $APODNAME2 -- aws ec2 describe-vpcs --region ap-northeast-2 --output table --no-cli-pager
 
# aws-cli 파드에 쉘 접속 후, EC2 메타데이터 확인
kubectl exec -it $APODNAME1 -- bash
curl -s http://169.254.169.254/ -v

# Token 요청 
curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" ; echo
curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" ; echo

# Token을 이용한 IMDSv2 사용
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
echo $TOKEN
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" –v http://169.254.169.254/ ; echo
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" –v http://169.254.169.254/latest/ ; echo
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" –v http://169.254.169.254/latest/meta-data/iam/security-credentials/ ; echo

# 위에서 출력된 IAM Role을 아래 입력 후 확인
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" –v http://169.254.169.254/latest/meta-data/iam/security-credentials/eksctl-myeks-nodegroup-ng1-NodeInstanceRole-1DC6Y2GRDAJHK

# 파드 쉘 종료
exit
```

- aws-cli 파드에 kubeconfig를 통한 mapRoles 정보 생성

```bash
# node 의 IAM Role ARN을 변수로 지정
eksctl get iamidentitymapping --cluster $CLUSTER_NAME
NODE_ROLE=eksctl-myeks-nodegroup-ng1-NodeInstanceRole-{IAM Role ARN}

# awscli 파드에서 kubeconfig 정보 생성
# 확인 시, 실행 인자에 role도 추가되었음
kubectl exec -it $APODNAME1 -- aws eks update-kubeconfig --name $CLUSTER_NAME --role-arn $NODE_ROLE
kubectl exec -it $APODNAME1 -- cat /root/.kube/config | yh

kubectl exec -it $APODNAME2 -- aws eks update-kubeconfig --name $CLUSTER_NAME --role-arn $NODE_ROLE
kubectl exec -it $APODNAME2 -- cat /root/.kube/config | yh
