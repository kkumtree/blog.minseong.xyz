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
kubectl get pod -n dev-team
```
