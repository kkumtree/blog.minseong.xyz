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

# 파드에 기본 적용되는 SA 정보(토큰) 확인
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

# 실습 NS인 default에서 액세스 매트릭스 확인
kubectl access-matrix --namespace default

# USER/GROUP/SA 단위의 RBAC 조회
# system:nodes == eks:node-bootstrapper
# system:bootstrappers == eks:node-bootstrapper
kubectl rbac-tool lookup system:masters

# USER/GROUP/SA 단위의 RBAC 정책 규칙 확인
kubectl rbac-tool policy-rules
kubectl rbac-tool policy-rules

# 해당 클러스터에서 사용 가능한 클러스터롤 조회
kubectl rbac-tool show

# 클러스터에 인증된 현재 컨텍스트의 사용자 확인
kubectl rbac-tool whoami

# USER/GROUP/SA 단위의 RBAC 역할 조회
kubectl rolesum aws-node -n kube-system
kubectl rolesum -k User system:kube-proxy
kubectl rolesum -k Group system:masters

# (새로운 쉘) 현재 접속한 본인의 RBAC 권한을 시각적으로 확인
echo -e "RBAC View Web http://$(curl -s ipinfo.io/ip):8800"
kubectl rbac-view
```