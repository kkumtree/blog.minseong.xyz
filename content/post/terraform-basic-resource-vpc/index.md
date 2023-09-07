---
date: 2023-09-07T16:11:04+09:00
title: "Terraform resource 이해하기 w/AWS VPC"
tags:
 - Terraform
 - CloudNet@
 - HCL
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho@ubuntu-kr.org
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.png # 커버 이미지 URL
draft: true # 글 초안 여부
---

이번에는 [CloudNet@](https://gasidaseo.notion.site/3-8b2603d882734df0b96f8670bb4e15d4)를 통해 학습한 내용을 기반으로,  

- AZ를 대상으로 한 data 조회  
- resource 이름 변경  
- AWS VPC 생성 예제로 살펴보는 output

순으로 알아보도록 하겠습니다.  

교재로 사용한 [[테라폼으로 시작하는 IaC](https://link.coupang.com/a/8mN0N)] 도 참고하였습니다.

## data 조회