---
date: 2025-10-30T01:17:39+09:00
title: "Helm 101 - CI/CD 스터디 2주차"
tags:
  - helm
  - CICD
  - CloudNet@
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho7969@ubuntu.com
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: image-6.png # 커버 이미지 URL
draft: true # 글 초안 여부
---

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 CI/CD Study 2주차에는 Jenkins와 ArgoCD을 다뤘습니다.  

이번에는 kubernetes(이하, k8s)에 self-host Git과 Jenkins를 배포 후 CI/CD 부분을 다루도록 하겠습니다.  

## 0. 실습 준비  

1. kind  

    > kind 설치의 경우 다음 포스트를 참고할 수 있습니다.  
    > [리눅스에 KIND 설치하기 w/golang](../kans-2w-kind-installation-on-linux/)  
    > Docs: <https://kind.sigs.k8s.io/>  

  kind를 통해, 로컬 환경에 k8s를 배포해보겠습니다.  
    - networking.apiServerAddress:  
      ControlPlane에 접속하기 위한 주소 지정  
    - nodes.extraPortMappings:  
      호스트의 포트를 kind의 각 노드 포트로 직접 연결 설정.  
      이를 통해, 호스트에서 kind 내부의 `NodePost` 서비스에 접근 가능  

  ```bash
  # 3w/shells/kind/up-kind.sh
  kind create cluster --name myk8s --image kindest/node:v1.32.8 --config - <<EOF
  kind: Cluster
  apiVersion: kind.x-k8s.io/v1alpha4
  networking:
    apiServerAddress: "0.0.0.0"
  nodes:
  - role: control-plane
    extraPortMappings:
    - containerPort: 30000
      hostPort: 30000
    - containerPort: 30001
      hostPort: 30001
    - containerPort: 30002
      hostPort: 30002
    - containerPort: 30003
      hostPort: 30003
  - role: worker
  EOF
  ```
  
  이후에 배포를 확인 후, namespace를 설정합니다. 

![deploy kind control plane and worker node]

## 1. 