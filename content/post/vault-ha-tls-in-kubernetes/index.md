---
date: 2025-12-03T08:59:34+09:00
title: "Vault HA 및 TLS 설정 - CI/CD 스터디 8주차"
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
draft: true # 글 초안 여부
---

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 CI/CD Study 8주차에는 [Vault](https://www.vaultproject.io/)의 HA(High Availability) 및 TLS 설정에 대해 다루었습니다.  

구성 방법의 이론적 부분은 단순했으나, 예상한 구성 방법과 달라서 제가 나중에 참고하려고 부연설명을 해두려고 합니다. 



![before raft](image.png)



![init vault operator in a pod](image-1.png)

