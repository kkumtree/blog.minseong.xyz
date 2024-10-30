---
date: 2024-10-30T23:44:01+09:00
title: "Monitoring CoreDNS in EKS with AMG"
tags:
 - kans
 - eks
 - amg
 - otel
 - coredns
authors:  
  - name: kkumtree  
    bio: plumber for infra  
    email: mscho7969@ubuntu.com  
    launchpad: mscho7969  
    github: kkumtree  
    profile: https://avatars.githubusercontent.com/u/52643858?v=4  
image: cover.png  
draft: false # 글 초안 여부  
---

> 안타?깝게도 Mercedes AMG는 아닙니다.  

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 **K**8s **A**dvanced **N**etwork **S**tudy(이하, KANS)를 통해 학습한 내용을 정리합니다.  

이번 주차는 실감이 아직 안나는데, 스터디 마지막 주차입니다.  
그래서 **여러분이 잘 알고, 매우 좋아하는** EKS를 통해, CoreDNS 이슈를 모니터링하는 Hands-on을 차근차근 따라해보려고합니다.  

- [AWS Cloud Operations Blog/Monitoring CoreDNS for DNS throttling issues using AWS Open source monitoring services](https://aws.amazon.com/ko/blogs/mt/monitoring-coredns-for-dns-throttling-issues-using-aws-open-source-monitoring-services/)

위의 Blog를 그대로 따라해볼 겁니다.  

## 0. EKS Cluster 생성  

스터디에서 제공된 CloudFormation을 통해 EKS Cluster를 생성해볼까합니다.  
`eksctl`이 언급되어 있어서 왠지... 나중에 롤백하고 태초마을부터 `eksctl` 기반 CloudFormation 배포를 할 것 같은 불안함이 있지만 해보죠(?).  

음 아직은 기우였네요. 기억을 끄집어내보니 bation host에서 `eksctl` 을 사용해서 EKS Cluster 생성하는 것까지 스크립팅 되어 있다고, 말씀을 들었던 것 같습니다.  

![about-15-mins-needed](images/eks-cluster-created.png)  

![instances-from-cloudformation](images/instances-eks-bastion.png)  

## ... 잘래
