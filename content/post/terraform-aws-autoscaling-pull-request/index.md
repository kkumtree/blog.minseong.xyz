---
date: 2023-12-11T14:47:31+09:00
title: "테라폼 모듈 기여 시도해보기 - AWS autoscaling module"
tags:
 - AWS
 - terraform
 - contribution
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho7969@ubuntu.com
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.jpeg # 커버 이미지 URL
draft: true # 글 초안 여부
---

## 요약

- Pull Request를 위한 테스트를 통과했었음에도, 실제로 적용하면서 에러가 발생하여 리퀘스트를 닫았습니다. 
- 임시 조치로 해당 모듈을 fork하고, 값을 바꿔 임시로 이용하였습니다.  
- v7.3.1 이후 버전부터는 모듈에서 `load_balancers` 과 `target_group_arns` 모두 추적하지 않는 옵션을 사용할 수 있습니다.  
- Pull Request를 시행 함에 있어, 레퍼런스를 눈에 띄게 적어두는 것이 좋을 것 같습니다.  

## 계기  

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 Terraform 스터디를 마칠 쯤에 테라폼을, 그것도 Terraform Cloud(TFC)를 사용해야하는 상황이 생겼습니다.  
그룹 프로젝트 진행에 있어, 다른 팀과 OU로 구분되지 않은채로 같은 계정을 사용하게 된 것인데요.  
Backend를 S3로 사용하게 되면, 무결성을 확신할 수 없었기 때문에, OIDC 기반으로 TFC를 사용하게 되었습니다.  
해당 [포스트](https://blog.minseong.xyz/post/notification-about-terraform-cloud-drift/)를 작성할 때만 해도, TFC를 적극적으로 쓸 상황이 올거라고는 생각치 못했습니다.  

- TFC를 쓸 경우, 로컬 서브 디렉터리에 작성한 모듈을 사용할 수 없습니다.  
  - 정확하게는, git을 기반으로 서브 모듈들을 올려놓고 끌어오거나, registry에 올려둔 모듈을 사용해야합니다.  

처음에는 git으로 관리하고자 하였으나, 목표(이자 실제로)는 VPC/Subnet/SG/EICE/IAM/ALB 등을  
하나의 State로 올리려 했기 때문에 시간 단축을 위해 registry에 올려둔 모듈을 사용하기로 했습니다.  

## 당시 ASG 모듈의 문제점

다른 모듈들도 Cycle이 발생하는 경우가 있었지만, SG와 SGR을 별개로 생성하는 등 분리작업을 통해 사이클을 피할 수 있었습니다.  

하지만, ASG 모듈은 하나가 더 있었습니다.  

### Lifecycle 조정의 한계

- Hashicorp의 [튜토리얼 가이드](https://developer.hashicorp.com/terraform/tutorials/aws/aws-asg#set-lifecycle-rule)에 의하면, Terraform 외부에서 변동되는 수치에 대해서 lifecycle을 추적하지 않는 것을 권장합니다.  
- 예를 들어, ASG의 경우, 타겟그룹(`target_group_arns`)과 
- `target_group_arns`에 대해서만 라이프사이클을 조정할 수 있었습니다.  

