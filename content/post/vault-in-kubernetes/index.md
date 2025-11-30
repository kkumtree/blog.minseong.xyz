---
date: 2025-11-16T17:38:34+09:00
title: "Vault UI in Kubernetes - CI/CD 스터디 7주차"
tags:
  - vault
  - CICD
  - CloudNet@
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho7969@ubuntu.com
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: image-10.png # 커버 이미지 URL
draft: false # 글 초안 여부
---

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 CI/CD Study 7주차에는 [Vault](https://www.vaultproject.io/)를 다루었습니다.  

자세한 설명은 해당 공식 페이지에서 해주고 있지만, 그저 1password 같은 패스워드 관리 서비스가 엔드유저 대상이라면 Vault는 인프라 관리자 대상으로 사용되는 것으로 알고 있는 제게는 흥미로운 주차였습니다.  

이번 스터디에서는 계속해서 kind로 로컬 Kubernetes(k8s)를 활용했기에, 이번에도 비슷하게 배포해보겠습니다.  

## 0. 실습 환경 준비

> 해당 구성들은 아래 GitHub에 탑재되어 있습니다.  
> <https://github.com/kkumtree/ci-cd-cloudnet-study> 의 7w 폴더

### (1) kind 클러스터 배포

```bash
kind create cluster --name vault --image kindest/node:v1.32.8 --config - <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
- role: worker
  labels:
    ingress-ready: true
  extraPortMappings:
  - containerPort: 80
    hostPort: 30080
EOF


echo "[Provisoning..] ingress-nginx in vault cluster"

kubectl config use-context kind-vault

kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

이번에는 UI 관련해서 80포트 하나만 뚫어놓고 사용하고 싶었는데, 뭔가 하나씩 뚫어보는 중입니다. 

